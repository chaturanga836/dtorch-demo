import { createClient } from "./client";

async function main() {
  const client = createClient();
  await client.validate();

  const status = await client.storage.getStatus();
  console.log("storage status:", status);

  const key = `demo/hello-${Date.now()}.txt`;
  const uploaded = await client.storage.uploadObject(
    new Blob([`hello from dtorch-demo at ${new Date().toISOString()}`], {
      type: "text/plain",
    }),
    { key, fileName: "hello.txt" },
  );
  console.log("uploaded:", uploaded);

  const listed = await client.storage.listObjects("demo/");
  console.log("objects under demo/:", listed.items.slice(0, 10));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
