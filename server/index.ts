import "dotenv/config";
import cors from "cors";
import express from "express";
import { randomUUID } from "node:crypto";
import { channelNamed } from "@dtorch/sdk";
import { createClient, envSummary } from "../src/client";
import { getResult, listRecent, markPending } from "./jobResults";
import { startQueueWorker } from "./worker";

const PORT = Number(process.env.DEMO_APP_PORT || "5174");
const QUEUE_NAME = process.env.DTORCH_QUEUE_NAME?.trim() || "test_queue";
const CHANNEL = process.env.DTORCH_CHANNEL?.trim() || "demo";
const ORG_ID = Number(process.env.DTORCH_ORG_ID || "1");
const CRON_JOB_NAME = process.env.CRON_JOB_NAME?.trim() || "demo-jobs";
const CRON_BATCH = Math.max(1, Number(process.env.CRON_BATCH || "3"));

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

function jobsTable() {
  return createClient().db.table("demo_jobs");
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, env: envSummary(), queue: QUEUE_NAME, channel: CHANNEL });
});

app.get("/api/config", (_req, res) => {
  res.json({
    queueName: QUEUE_NAME,
    channel: CHANNEL,
    cronJobName: CRON_JOB_NAME,
    batch: CRON_BATCH,
    workspaceId: Number(process.env.DTORCH_WORKSPACE_ID || "1"),
    orgId: ORG_ID,
  });
});

app.get("/api/jobs", async (_req, res) => {
  try {
    const data = await jobsTable().findMany({ limit: 50 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message, detail: (err as { detail?: unknown }).detail });
  }
});

app.post("/api/jobs", async (req, res) => {
  try {
    const name = String(req.body?.name || `job-${Date.now()}`).trim();
    const status = String(req.body?.status || "pending").trim();
    const payload =
      typeof req.body?.payload === "string"
        ? req.body.payload
        : JSON.stringify(req.body?.payload ?? { source: "web-ui" });
    const result = await jobsTable().insert({ name, status, payload });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message, detail: (err as { detail?: unknown }).detail });
  }
});

app.patch("/api/jobs/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const changes: Record<string, unknown> = {};
    if (req.body?.name !== undefined) changes.name = String(req.body.name);
    if (req.body?.status !== undefined) changes.status = String(req.body.status);
    if (req.body?.payload !== undefined) {
      changes.payload =
        typeof req.body.payload === "string"
          ? req.body.payload
          : JSON.stringify(req.body.payload);
    }
    const result = await jobsTable().updateByPk({ id }, changes);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message, detail: (err as { detail?: unknown }).detail });
  }
});

app.delete("/api/jobs/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const result = await jobsTable().deleteByPk({ id });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message, detail: (err as { detail?: unknown }).detail });
  }
});

/** Enqueue a cron tick — worker will insert rows, push Studio logs, notify result. */
app.post("/api/cron/enqueue", async (_req, res) => {
  try {
    const client = createClient();
    const requestId = randomUUID();
    const payload = {
      type: "cron.tick",
      requestId,
      jobName: CRON_JOB_NAME,
      batch: CRON_BATCH,
      enqueuedAt: new Date().toISOString(),
      source: "dtorch-demo-web",
    };
    const pushed = await client.runtime.queuePush(QUEUE_NAME, payload);
    markPending(requestId);
    res.json({ ok: true, queue: QUEUE_NAME, requestId, pushed });
  } catch (err) {
    res.status(500).json({
      error: (err as Error).message,
      detail: (err as { detail?: unknown }).detail,
      hint: `Create queue "${QUEUE_NAME}" in Studio and enable Queues for the account.`,
    });
  }
});

app.get("/api/cron/status/:requestId", (req, res) => {
  const item = getResult(req.params.requestId);
  if (!item) {
    res.status(404).json({ error: "Unknown requestId" });
    return;
  }
  res.json(item);
});

app.get("/api/cron/events", (_req, res) => {
  res.json({ items: listRecent() });
});

/** Mint a short-lived Centrifugo token for the browser (secret stays on server). */
app.get("/api/realtime", async (_req, res) => {
  try {
    const client = createClient();
    const validation = await client.validate();
    const workspaceId = validation.workspaceId;
    const channel = channelNamed(ORG_ID, workspaceId, CHANNEL);

    const baseUrl = process.env.DTORCH_API_URL!.replace(/\/$/, "");
    const tokenRes = await fetch(
      `${baseUrl}/api/v1/workspaces/${workspaceId}/notifications/realtime-token`,
      {
        headers: {
          "X-Project-Key": process.env.DTORCH_PROJECT_KEY!,
          Authorization: `Bearer ${process.env.DTORCH_PROJECT_SECRET!}`,
        },
      },
    );
    if (!tokenRes.ok) {
      let detail = await tokenRes.text();
      try {
        const parsed = JSON.parse(detail) as { detail?: string };
        if (parsed.detail) detail = parsed.detail;
      } catch {
        /* keep raw text */
      }
      res.status(tokenRes.status).json({
        error: detail || "realtime-token failed",
        hint:
          detail.includes("not enabled")
            ? "Enable Notifications for this account in Studio (Account settings -> Realtime / Notifications), and ensure Centrifugo is configured."
            : "Check project credentials and that notification:subscribe is in scopes.",
      });
      return;
    }
    const body = (await tokenRes.json()) as { token: string; ws_url: string };
    res.json({
      token: body.token,
      wsUrl: body.ws_url,
      channel,
      shortChannel: CHANNEL,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.listen(PORT, () => {
  console.log(`dtorch-demo API http://localhost:${PORT}`);
  console.log(`queue=${QUEUE_NAME} channel=${CHANNEL} cronJob=${CRON_JOB_NAME}`);
  startQueueWorker({
    queueName: QUEUE_NAME,
    channel: CHANNEL,
    cronJobName: CRON_JOB_NAME,
    pollMs: Number(process.env.QUEUE_POLL_MS || "2000"),
  });
});
