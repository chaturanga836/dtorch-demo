import { channelNamed } from "@dtorch/sdk";
import { createClient } from "./client";

async function main() {
  const client = createClient();
  const validation = await client.validate();
  const workspaceId = validation.workspaceId;
  const orgId = Number(process.env.DTORCH_ORG_ID || "1");

  const channel = "demo";
  const published = await client.runtime.notificationPublish(channel, {
    type: "demo.ping",
    at: new Date().toISOString(),
    message: "hello from dtorch-demo",
  });
  console.log("published:", published);

  const fullChannel = channelNamed(orgId, workspaceId, channel);
  console.log("subscribe channel name (for subscribe script):", fullChannel);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
