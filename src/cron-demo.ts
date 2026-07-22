import "dotenv/config";
import * as readline from "node:readline";
import cron from "node-cron";
import { createClient, envSummary } from "./client";
import type { DtorchPlatformClient } from "@dtorch/sdk";

/**
 * Local cron demo (platform Celery Beat not available yet).
 *
 * Flow:
 *  1. User types `start` to begin the schedule
 *  2. Each tick generates a batch of rows in a loop
 *  3. Rows are inserted into test_db.demo_jobs (created by migration)
 *  4. Tick result is pushed via runtime.cronPushLogs (Studio shows it when
 *     the cron job has history_log enabled)
 *
 * Env (optional):
 *  CRON_EXPR      default "* * * * *" (every minute)
 *  CRON_BATCH     rows per tick (default 3)
 *  CRON_MAX_TICKS stop after N ticks (0 = run forever)
 *  CRON_AUTO_START=1  skip the interactive prompt
 *  CRON_JOB_NAME  Studio cron job name for push logs (default "demo-jobs")
 */

const CRON_EXPR = process.env.CRON_EXPR?.trim() || "* * * * *";
const BATCH = Math.max(1, Number(process.env.CRON_BATCH || "3"));
const MAX_TICKS = Math.max(0, Number(process.env.CRON_MAX_TICKS || "0"));
const AUTO_START = process.env.CRON_AUTO_START === "1";
const CRON_JOB_NAME = process.env.CRON_JOB_NAME?.trim() || "demo-jobs";

let tickCount = 0;
let running = false;
let task: cron.ScheduledTask | null = null;
let client: DtorchPlatformClient | null = null;

function getClient(): DtorchPlatformClient {
  if (!client) client = createClient();
  return client;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = (err as Error).message;
      console.warn(`  [retry ${i}/${attempts}] ${label}: ${msg}`);
      if (i < attempts) await sleep(1500 * i);
    }
  }
  throw lastErr;
}

async function populateAndInsert(n: number) {
  const api = getClient();
  const at = new Date().toISOString();
  const batchId = `cron-${Date.now()}`;
  const jobs = api.db.table("demo_jobs");

  console.log(`\n[cron] tick #${n} at ${at} — generating ${BATCH} rows (${batchId})`);

  // Warm schema once per tick (same path as db-demo).
  await withRetry("schema", () => jobs.schema());

  for (let i = 1; i <= BATCH; i++) {
    const name = `${batchId}-${i}`;
    const payload = {
      source: "cron-demo",
      batchId,
      index: i,
      at,
    };
    const result = await withRetry(`insert ${name}`, () =>
      jobs.insert({
        name,
        status: "queued",
        payload: JSON.stringify(payload),
      }),
    );
    console.log(`  [${i}/${BATCH}] inserted ${name}`, {
      ok: (result as { ok?: boolean }).ok,
      rows_affected: (result as { rows_affected?: number }).rows_affected,
    });
    if (i < BATCH) await sleep(300);
  }

  const recent = await withRetry("findMany", () => jobs.findMany({ limit: Math.max(BATCH, 5) }));
  console.log("[cron] recent demo_jobs rows:", recent);
  return { batchId, ok: true as const };
}

async function pushHistoryLog(
  n: number,
  entry: { message: string; level?: string; metadata?: Record<string, unknown> },
) {
  const api = getClient();
  try {
    const result = await withRetry("cronPushLogs", () =>
      api.runtime.cronPushLogs(CRON_JOB_NAME, entry),
    );
    console.log(`[cron] history push → ${CRON_JOB_NAME}`, result);
  } catch (err) {
    console.warn(`[cron] history push failed (tick #${n}):`, (err as Error).message);
    console.warn(
      `  Hint: create Studio cron job "${CRON_JOB_NAME}" and ensure project has cron:log scope.`,
    );
  }
}

async function tick() {
  if (running) {
    console.log("[cron] previous tick still running — skip");
    return;
  }
  running = true;
  const n = ++tickCount;
  try {
    const { batchId } = await populateAndInsert(n);
    await pushHistoryLog(n, {
      message: `tick #${n} complete`,
      level: "info",
      metadata: { batchId, rows: BATCH, ok: true },
    });
  } catch (err) {
    console.error("[cron] tick failed:", (err as Error).message);
    const detail = (err as { detail?: unknown }).detail;
    if (detail !== undefined) console.error("[cron] detail:", detail);
    console.error(
      "  Hint: ensure migration is applied (demo_jobs in test_db) and DTORCH_DATABASE_ID is set.",
    );
    await pushHistoryLog(n, {
      message: `tick #${n} failed: ${(err as Error).message}`,
      level: "error",
      metadata: { ok: false },
    });
  } finally {
    running = false;
  }

  if (MAX_TICKS > 0 && tickCount >= MAX_TICKS) {
    console.log(`\n[cron] reached CRON_MAX_TICKS=${MAX_TICKS} — stopping`);
    stopCron();
    process.exit(0);
  }
}

function startCron() {
  if (task) {
    console.log("[cron] already started");
    return;
  }
  if (!cron.validate(CRON_EXPR)) {
    throw new Error(`Invalid CRON_EXPR: ${CRON_EXPR}`);
  }
  console.log(`[cron] starting schedule "${CRON_EXPR}" (batch=${BATCH})`);
  console.log("  connected as", envSummary());
  // Immediate first tick, then schedule subsequent ones (avoids double-fire on the minute).
  void tick().then(() => {
    if (MAX_TICKS > 0 && tickCount >= MAX_TICKS) return;
    task = cron.schedule(CRON_EXPR, () => {
      void tick();
    });
  });
}

function stopCron() {
  if (task) {
    task.stop();
    task = null;
    console.log("[cron] stopped");
  }
}

function promptLoop() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("Cron demo — inserts into test_db.demo_jobs via local node-cron");
  console.log(`  schedule: ${CRON_EXPR}  |  batch: ${BATCH}  |  maxTicks: ${MAX_TICKS || "∞"}`);
  console.log(`  history job: ${CRON_JOB_NAME} (Studio cron job; enable History log to see pushes)`);
  console.log("Commands: start | stop | tick | quit\n");

  const ask = () => {
    rl.question("> ", (line) => {
      const cmd = line.trim().toLowerCase();
      if (cmd === "start") {
        startCron();
      } else if (cmd === "stop") {
        stopCron();
      } else if (cmd === "tick") {
        void tick();
      } else if (cmd === "quit" || cmd === "exit" || cmd === "q") {
        stopCron();
        rl.close();
        process.exit(0);
      } else if (cmd === "") {
        // ignore empty
      } else {
        console.log("Unknown. Use: start | stop | tick | quit");
      }
      ask();
    });
  };

  ask();
}

if (AUTO_START) {
  console.log("CRON_AUTO_START=1 — starting without prompt");
  startCron();
} else {
  promptLoop();
}
