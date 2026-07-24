export type CronJobResult = {
  requestId: string;
  status: "success" | "failed" | "pending";
  message: string;
  at: string;
  batchId?: string;
  rows?: number;
};

const results = new Map<string, CronJobResult>();
const recent: CronJobResult[] = [];
const MAX_RECENT = 50;

export function markPending(requestId: string): void {
  const item: CronJobResult = {
    requestId,
    status: "pending",
    message: "Queued — waiting for worker",
    at: new Date().toISOString(),
  };
  results.set(requestId, item);
}

export function markResult(item: CronJobResult): void {
  results.set(item.requestId, item);
  recent.unshift(item);
  if (recent.length > MAX_RECENT) recent.length = MAX_RECENT;
}

export function getResult(requestId: string): CronJobResult | undefined {
  return results.get(requestId);
}

export function listRecent(limit = 40): CronJobResult[] {
  return recent.slice(0, limit);
}
