import { DtorchApiError, DtorchAuthError } from "@dtorch/sdk";
import { createClient } from "./client";

function explainAuthFailure(err: unknown): never {
  if (err instanceof DtorchAuthError || err instanceof DtorchApiError) {
    const detail =
      typeof err.detail === "object" && err.detail && "detail" in err.detail
        ? String((err.detail as { detail: unknown }).detail)
        : String(err.detail ?? err.message);

    if (
      err.statusCode === 401 &&
      /invalid token signature or claims/i.test(detail)
    ) {
      console.error(`
Storage rejected project credentials (401: Invalid token signature or claims).

This means the API at DTORCH_API_URL is still treating Authorization as a
Keycloak JWT. Project key/secret storage support exists in local etl-back but
is not deployed to that host yet.

Fix:
  1. Deploy the updated etl-back image (storage dual-auth + expanded scopes)
  2. Re-run: npm run storage

Your pk_/ps_ are fine for database routes; storage needs the new API build.
`);
      process.exit(1);
    }
  }
  throw err;
}

async function main() {
  const client = createClient();
  await client.validate();

  let status;
  try {
    status = await client.storage.getStatus();
  } catch (err) {
    explainAuthFailure(err);
  }
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
