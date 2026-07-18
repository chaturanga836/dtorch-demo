import { createClient } from "./client";

async function main() {
  const client = createClient();
  await client.validate();

  const jobs = client.db.table("demo_jobs");

  try {
    const inserted = await jobs.insert({
      name: `demo-${Date.now()}`,
      status: "pending",
      payload: JSON.stringify({ source: "db-demo" }),
    });
    console.log("insert:", inserted);
  } catch (err) {
    console.error(
      "insert failed — apply the migration first (demo_jobs table), or check database id.",
    );
    throw err;
  }

  const rows = await jobs.findMany({ limit: 10 });
  console.log("recent rows:", rows);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
