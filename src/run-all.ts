import { spawn } from "node:child_process";

const steps = ["validate", "storage", "notify"] as const;

async function run(script: string) {
  console.log(`\n=== npm run ${script} ===\n`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn("npm", ["run", script], {
      stdio: "inherit",
      shell: true,
      cwd: process.cwd(),
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with ${code}`));
    });
  });
}

async function main() {
  for (const step of steps) {
    await run(step);
  }
  console.log("\nDone. Optional next:");
  console.log("  npm run migrate:sql   # show DDL to apply via dtorch CLI");
  console.log("  npm run db:demo       # after migration");
  console.log("  npm run subscribe     # listen for notifications");
  console.log("  npm run cron          # local cron worker");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
