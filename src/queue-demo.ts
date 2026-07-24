import { createClient, envSummary } from "./client";

function usage(): never {
  console.error("Usage: npm run queue -- --queue-id <name>");
  console.error("   or: dtorch run queue --queue-id <name>");
  process.exit(1);
}

function parseQueueId(argv: string[]): string {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--queue-id" || arg === "--name") {
      const value = argv[i + 1]?.trim();
      if (!value || value.startsWith("-")) usage();
      return value;
    }
    if (arg.startsWith("--queue-id=")) {
      const value = arg.slice("--queue-id=".length).trim();
      if (!value) usage();
      return value;
    }
  }
  usage();
}

async function main() {
  const queueName = parseQueueId(process.argv.slice(2));
  const client = createClient();

  console.log("env:", envSummary());
  console.log("queue-id:", queueName);

  const validation = await client.validate();
  console.log("validate:", {
    ok: validation.ok,
    workspaceId: validation.workspaceId,
    scopes: validation.scopes,
  });

  const payload = {
    type: "demo.queue",
    at: new Date().toISOString(),
    message: "hello from dtorch-demo queue",
  };

  const pushed = await client.runtime.queuePush(queueName, payload);
  console.log("push:", pushed);

  const peeked = await client.runtime.queuePeek(queueName);
  console.log("peek:", peeked);

  const popped = await client.runtime.queuePop(queueName);
  console.log("pop:", popped);

  const empty = await client.runtime.queuePeek(queueName);
  console.log("peek after pop (expect null):", empty);
}

main().catch((err) => {
  console.error(err);
  console.error(
    "\nIf 404 Queue not found: create the queue in Studio → Queues, then:",
  );
  console.error("  dtorch run queue --queue-id <name>");
  process.exit(1);
});
