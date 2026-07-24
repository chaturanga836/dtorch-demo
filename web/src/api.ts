export type DemoConfig = {
  queueName: string;
  channel: string;
  cronJobName: string;
  batch: number;
  workspaceId: number;
  orgId: number;
};

export type JobRow = {
  id: number;
  name: string;
  status: string;
  payload: string | null;
  created_at: string;
};

export type JobsResponse = {
  rows: JobRow[];
  total?: number;
};

export type RealtimeInfo = {
  token: string;
  wsUrl: string;
  channel: string;
  shortChannel: string;
};

export type CronResultEvent = {
  type?: string;
  status?: "success" | "failed" | string;
  requestId?: string;
  message?: string;
  batchId?: string;
  rows?: number;
  at?: string;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      (body as { error?: string }).error || res.statusText || "Request failed",
    );
    (err as Error & { detail?: unknown }).detail = (body as { detail?: unknown }).detail;
    (err as Error & { hint?: string }).hint = (body as { hint?: string }).hint;
    throw err;
  }
  return body as T;
}

export type CronJobStatus = {
  requestId: string;
  status: "success" | "failed" | "pending";
  message: string;
  at: string;
  batchId?: string;
  rows?: number;
};

export const demoApi = {
  config: () => api<DemoConfig>("/api/config"),
  listJobs: () => api<JobsResponse>("/api/jobs"),
  createJob: (body: { name?: string; status?: string; payload?: string }) =>
    api("/api/jobs", { method: "POST", body: JSON.stringify(body) }),
  updateJob: (id: number, body: { name?: string; status?: string; payload?: string }) =>
    api(`/api/jobs/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteJob: (id: number) => api(`/api/jobs/${id}`, { method: "DELETE" }),
  enqueueCron: () =>
    api<{ ok: boolean; requestId: string; queue: string }>("/api/cron/enqueue", {
      method: "POST",
      body: "{}",
    }),
  cronStatus: (requestId: string) => api<CronJobStatus>(`/api/cron/status/${requestId}`),
  cronEvents: () => api<{ items: CronJobStatus[] }>("/api/cron/events"),
  realtime: () => api<RealtimeInfo>("/api/realtime"),
};
