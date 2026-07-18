import cron from "node-cron";
import { createClient } from "./client";

/**
 * Platform Celery Beat / schedule APIs are not available yet.
 * This demo uses local node-cron and writes/publishes through project credentials.
 */
async function tick() {
  const client = createClient();
  const at = new Date().toISOString();
  console.log(`[cron] tick ${at}`);

  try {
    await client.db.table("demo_jobs").insert({
      name: `cron-${Date.now()}`,
      status: "queued",
      payload: JSON.stringify({ source: "cron-demo", at }),
    });
    console.log("[cron] wrote demo_jobs row");
  } catch (err) {
    console.warn("[cron] demo_jobs insert skipped:", (err as Error).message);
  }

  try {
    const published = await client.runtime.notificationPublish("demo", {
      type: "demo.cron",
      at,
    });
    console.log("[cron] notification:", published);
  } catch (err) {
    console.warn("[cron] notification skipped:", (err as Error).message);
  }
}

console.log("Starting local cron every minute (platform scheduler not implemented yet)");
cron.schedule("* * * * *", () => {
  void tick();
});
void tick();
