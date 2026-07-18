import { channelNamed } from "@dtorch/sdk";
import { createClient } from "./client";

async function main() {
  const client = createClient();
  const validation = await client.validate();
  const workspaceId = validation.workspaceId;
  const orgId = Number(process.env.DTORCH_ORG_ID || "1");
  const channelName = process.env.DTORCH_CHANNEL || "demo";
  const channel = channelNamed(orgId, workspaceId, channelName);

  console.log("connecting realtime…");
  await client.realtime.connect();
  console.log("subscribed to", channel);

  client.realtime.on("connected", () => console.log("centrifugo connected"));
  client.realtime.on("disconnected", () => console.log("centrifugo disconnected"));
  client.realtime.on("error", (err) => console.error("realtime error", err));

  client.realtime.subscribe(channel, (data) => {
    console.log("notification:", JSON.stringify(data, null, 2));
  });

  console.log("listening — run `npm run notify` in another terminal (Ctrl+C to stop)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
