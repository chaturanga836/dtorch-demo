import "dotenv/config";
import { DtorchPlatformClient } from "@dtorch/sdk";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

export function createClient(): DtorchPlatformClient {
  return new DtorchPlatformClient({
    baseUrl: required("DTORCH_API_URL"),
    projectKey: required("DTORCH_PROJECT_KEY"),
    projectSecret: required("DTORCH_PROJECT_SECRET"),
    workspaceId: Number(required("DTORCH_WORKSPACE_ID")),
    databaseId: Number(process.env.DTORCH_DATABASE_ID || "1"),
  });
}

export function envSummary() {
  return {
    apiUrl: process.env.DTORCH_API_URL,
    workspaceId: process.env.DTORCH_WORKSPACE_ID,
    databaseId: process.env.DTORCH_DATABASE_ID || "1",
    projectKey: process.env.DTORCH_PROJECT_KEY?.slice(0, 8) + "…",
  };
}
