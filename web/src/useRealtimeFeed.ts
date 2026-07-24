import { useEffect, useRef, useState } from "react";
import { Centrifuge } from "centrifuge";
import { demoApi, type CronJobStatus, type CronResultEvent } from "./api";

export type FeedItem = {
  id: string;
  at: string;
  status: "success" | "failed" | "info";
  message: string;
  raw?: unknown;
};

function toFeedItem(data: CronResultEvent | CronJobStatus, id?: string): FeedItem {
  const status =
    data.status === "success" || data.status === "failed" ? data.status : "info";
  return {
    id: id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: data.at || new Date().toISOString(),
    status,
    message: data.message || JSON.stringify(data),
    raw: data,
  };
}

export function useRealtimeFeed() {
  const [connected, setConnected] = useState(false);
  const [mode, setMode] = useState<"realtime" | "poll" | "connecting">("connecting");
  const [channel, setChannel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const centrifugeRef = useRef<Centrifuge | null>(null);
  const seenRef = useRef(new Set<string>());

  const pushFeed = (item: FeedItem) => {
    const key =
      item.raw && typeof item.raw === "object" && "requestId" in item.raw
        ? String((item.raw as { requestId?: string }).requestId || item.id)
        : item.id;
    if (seenRef.current.has(key) && item.status !== "info") {
      // Allow overwrite of pending → success/failed by replacing in list.
      setFeed((prev) => {
        const without = prev.filter((f) => {
          const rid =
            f.raw && typeof f.raw === "object" && "requestId" in f.raw
              ? String((f.raw as { requestId?: string }).requestId)
              : f.id;
          return rid !== key;
        });
        return [item, ...without].slice(0, 40);
      });
      return;
    }
    seenRef.current.add(key);
    setFeed((prev) => [item, ...prev].slice(0, 40));
  };

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | undefined;

    const startPolling = (reason: string) => {
      if (cancelled) return;
      setMode("poll");
      setConnected(false);
      setError(reason);
      const poll = async () => {
        try {
          const { items } = await demoApi.cronEvents();
          if (cancelled) return;
          for (const item of [...items].reverse()) {
            if (item.status === "pending") continue;
            pushFeed(toFeedItem(item, item.requestId));
          }
        } catch {
          /* ignore transient poll errors */
        }
      };
      void poll();
      pollTimer = setInterval(() => {
        void poll();
      }, 2000);
    };

    (async () => {
      try {
        const info = await demoApi.realtime();
        if (cancelled) return;
        setChannel(info.channel);
        setMode("realtime");
        setError(null);

        const centrifuge = new Centrifuge(info.wsUrl, { token: info.token });
        centrifugeRef.current = centrifuge;

        centrifuge.on("connected", () => {
          if (!cancelled) setConnected(true);
        });
        centrifuge.on("disconnected", () => {
          if (!cancelled) setConnected(false);
        });
        centrifuge.on("error", (ctx) => {
          if (!cancelled) setError(String(ctx.error || "realtime error"));
        });

        const sub = centrifuge.newSubscription(info.channel);
        sub.on("publication", (ctx) => {
          const data = (ctx.data || {}) as CronResultEvent;
          pushFeed(toFeedItem(data));
        });
        sub.subscribe();
        centrifuge.connect();
      } catch (err) {
        const e = err as Error & { hint?: string };
        const reason = e.hint ? `${e.message} — ${e.hint}` : e.message;
        startPolling(reason);
      }
    })();

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      centrifugeRef.current?.disconnect();
      centrifugeRef.current = null;
    };
  }, []);

  return { connected, mode, channel, error, feed };
}
