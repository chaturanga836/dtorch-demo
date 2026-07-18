import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Customer schema changes use dtorch/migrations + Studio JWT (`dtorch db push`).
 * Project key/secret cannot apply DDL. This script only prints the sample SQL.
 */
const migrationPath = join(
  process.cwd(),
  "dtorch",
  "migrations",
  "20260718100000_create_demo_jobs.sql",
);

console.log("Sample migration SQL (apply with dtorch CLI + DTORCH_ACCESS_TOKEN):\n");
console.log(readFileSync(migrationPath, "utf8"));
console.log("\nCommands:");
console.log("  pip install ../python/etl-deployment/sdk/python ../python/etl-deployment/cli");
console.log("  dtorch init && dtorch link --api-url $DTORCH_API_URL --workspace 1 --database 1");
console.log("  $env:DTORCH_ACCESS_TOKEN='<studio jwt>'; dtorch db push -y");
