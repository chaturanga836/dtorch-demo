import { createClient, envSummary } from "./client";

async function main() {
  console.log("Connecting with", envSummary());
  const client = createClient();
  const result = await client.validate();
  console.log("validate ok:", result.ok);
  console.log("workspaceId:", result.workspaceId);
  console.log("scopes:", result.scopes.length ? result.scopes : "(not returned by this API build)");
  console.log(
    "databases:",
    result.databases.map((db) => ({
      id: (db as { id?: number; database_id?: number }).id
        ?? (db as { database_id?: number }).database_id,
      name: (db as { name?: string }).name,
      engine: (db as { engine?: string }).engine,
    })),
  );

  if (!result.databases.length) {
    console.log(
      "\nNo databases yet. In Studio open project 1 → create/provision a Postgres database,\nthen set DTORCH_DATABASE_ID in .env and re-run.",
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
