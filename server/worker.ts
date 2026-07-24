import { createClient } from "../src/client";
import { markResult } from "./jobResults";

export type CronTickPayload = {
  type: "cron.tick";
  requestId: string;
  jobName: string;
  batch: number;
  enqueuedAt?: string;
  source?: string;
};

type WorkerOptions = {
  queueName: string;
  channel: string;
  cronJobName: string;
  pollMs: number;
};

function isCronTick(payload: unknown): payload is CronTickPayload {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return p.type === "cron.tick" && typeof p.requestId === "string";
}

async function processCronTick(msg: CronTickPayload, channel: string): Promise<void> {
  const client = createClient();
  const batch = Math.max(1, Number(msg.batch || 3));
  const jobName = msg.jobName || "demo-jobs";
  const at = new Date().toISOString();
  const batchId = `cron-${Date.now()}`;
  const jobs = client.db.table("demo_jobs");

  console.log(`[worker] cron.tick ${msg.requestId} batch=${batch}`);

  try {
    await jobs.schema();
    for (let i = 1; i <= batch; i++) {
      const name = `${batchId}-${i}`;
      await jobs.insert({
        name,
        status: "queued",
        payload: JSON.stringify({
          source: "queue-cron",
          requestId: msg.requestId,
          batchId,
          index: i,
          at,
        }),
      });
    }

    try {
      await client.runtime.cronPushLogs(jobName, {
        message: `queue cron tick ok (${batch} rows)`,
        level: "info",
        metadata: { requestId: msg.requestId, batchId, rows: batch, ok: true },
      });
    } catch (logErr) {
      console.warn("[worker] cronPushLogs failed:", (logErr as Error).message);
    }

    const successMsg = `Cron via queue finished — inserted ${batch} demo_jobs`;
    markResult({
      requestId: msg.requestId,
      status: "success",
      message: successMsg,
      at: new Date().toISOString(),
      batchId,
      rows: batch,
    });

    try {
      await client.runtime.notificationPublish(channel, {
        type: "cron.result",
        status: "success",
        requestId: msg.requestId,
        message: successMsg,
        batchId,
        rows: batch,
        at: new Date().toISOString(),
      });
    } catch (notifyErr) {
      console.warn(
        "[worker] notificationPublish failed (enable Notifications in Studio):",
        (notifyErr as Error).message,
      );
    }

    console.log(`[worker] success ${msg.requestId}`);
  } catch (err) {
    const message = (err as Error).message;
    console.error(`[worker] failed ${msg.requestId}:`, message);

    markResult({
      requestId: msg.requestId,
      status: "failed",
      message: `Cron via queue failed: ${message}`,
      at: new Date().toISOString(),
    });

    try {
      await client.runtime.cronPushLogs(jobName, {
        message: `queue cron tick failed: ${message}`,
        level: "error",
        metadata: { requestId: msg.requestId, ok: false },
      });
    } catch {
      /* ignore secondary failure */
    }

    try {
      await client.runtime.notificationPublish(channel, {
        type: "cron.result",
        status: "failed",
        requestId: msg.requestId,
        message: `Cron via queue failed: ${message}`,
        at: new Date().toISOString(),
      });
    } catch (notifyErr) {
      console.warn("[worker] notify failed:", (notifyErr as Error).message);
    }
  }
}

export function startQueueWorker(opts: WorkerOptions): void {
  let busy = false;
  let lastPollError = "";
  let lastPollErrorAt = 0;

  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const client = createClient();
      const msg = await client.runtime.queuePop(opts.queueName);
      if (!msg) return;

      const payload = msg.payload;
      if (isCronTick(payload)) {
        await processCronTick(payload, opts.channel);
      } else {
        console.log("[worker] skipped non-cron message", payload);
      }
    } catch (err) {
      const message = (err as Error).message;
      const now = Date.now();
      if (message !== lastPollError || now - lastPollErrorAt > 30_000) {
        console.error("[worker] poll error:", message);
        lastPollError = message;
        lastPollErrorAt = now;
      }
    } finally {
      busy = false;
    }
  };

  console.log(`[worker] polling queue "${opts.queueName}" every ${opts.pollMs}ms`);
  void tick();
  setInterval(() => {
    void tick();
  }, opts.pollMs);
}
