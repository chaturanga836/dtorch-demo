import { useCallback, useEffect, useState, type FormEvent } from "react";
import { demoApi, type DemoConfig, type JobRow } from "./api";
import { useRealtimeFeed } from "./useRealtimeFeed";

export default function App() {
  const [config, setConfig] = useState<DemoConfig | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);

  const { connected, mode, channel, error: realtimeError, feed } = useRealtimeFeed();

  const flash = (kind: "ok" | "err", text: string) => {
    setBanner({ kind, text });
    window.setTimeout(() => setBanner(null), 5000);
  };

  const refreshJobs = useCallback(async () => {
    const data = await demoApi.listJobs();
    setJobs((data.rows || []) as JobRow[]);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await demoApi.config();
        setConfig(cfg);
        await refreshJobs();
      } catch (err) {
        flash("err", (err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshJobs]);

  // When a cron.result arrives for our pending enqueue, surface banner + refresh jobs.
  useEffect(() => {
    if (!pendingRequestId || feed.length === 0) return;
    const match = feed.find(
      (f) =>
        f.raw &&
        typeof f.raw === "object" &&
        (f.raw as { requestId?: string }).requestId === pendingRequestId &&
        (f.status === "success" || f.status === "failed"),
    );
    if (!match) return;
    setPendingRequestId(null);
    flash(match.status === "success" ? "ok" : "err", match.message);
    void refreshJobs();
  }, [feed, pendingRequestId, refreshJobs]);

  // Poll status endpoint as backup when waiting (works even if feed is empty).
  useEffect(() => {
    if (!pendingRequestId) return;
    const timer = setInterval(() => {
      void (async () => {
        try {
          const status = await demoApi.cronStatus(pendingRequestId);
          if (status.status === "pending") return;
          setPendingRequestId(null);
          flash(status.status === "success" ? "ok" : "err", status.message);
          void refreshJobs();
        } catch {
          /* still pending / unknown */
        }
      })();
    }, 1500);
    return () => clearInterval(timer);
  }, [pendingRequestId, refreshJobs]);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await demoApi.createJob({
        name: newName.trim() || undefined,
        status: "pending",
        payload: JSON.stringify({ source: "web-ui", at: new Date().toISOString() }),
      });
      setNewName("");
      await refreshJobs();
      flash("ok", "Job created");
    } catch (err) {
      flash("err", (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onStatus = async (job: JobRow, status: string) => {
    setBusy(true);
    try {
      await demoApi.updateJob(job.id, { status });
      await refreshJobs();
    } catch (err) {
      flash("err", (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (job: JobRow) => {
    setBusy(true);
    try {
      await demoApi.deleteJob(job.id);
      await refreshJobs();
      flash("ok", `Deleted #${job.id}`);
    } catch (err) {
      flash("err", (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onEnqueueCron = async () => {
    setBusy(true);
    try {
      const res = await demoApi.enqueueCron();
      setPendingRequestId(res.requestId);
      flash("ok", `Enqueued cron tick → queue "${res.queue}" (${res.requestId.slice(0, 8)}…)`);
    } catch (err) {
      const e = err as Error & { hint?: string };
      flash("err", e.hint ? `${e.message} — ${e.hint}` : e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="hero">
        <p className="brand">DT Orch</p>
        <h1>Demo console</h1>
        <p className="lede">
          CRUD on <code>demo_jobs</code>, run cron work through a Studio queue, and watch
          success/fail notifications live.
        </p>
        <div className="meta">
          <span>queue: <code>{config?.queueName}</code></span>
          <span>cron job: <code>{config?.cronJobName}</code></span>
          <span>
            realtime:{" "}
            <strong className={connected ? "ok" : mode === "poll" ? "warn" : "warn"}>
              {connected
                ? "connected"
                : mode === "poll"
                  ? "poll fallback"
                  : "connecting…"}
            </strong>
          </span>
        </div>
        {realtimeError && (
          <p className="err-inline">
            {mode === "poll" ? "Realtime unavailable — using poll fallback. " : "Realtime: "}
            {realtimeError}
          </p>
        )}
        {channel && <p className="muted tiny">channel <code>{channel}</code></p>}
      </header>

      {banner && <div className={`banner ${banner.kind}`}>{banner.text}</div>}

      <section className="panel">
        <div className="panel-head">
          <h2>Cron via queue</h2>
          <button type="button" className="primary" disabled={busy} onClick={() => void onEnqueueCron()}>
            {pendingRequestId ? "Waiting for worker…" : "Enqueue cron tick"}
          </button>
        </div>
        <p className="muted">
          Pushes a <code>cron.tick</code> message. The API worker pops it, inserts rows, calls{" "}
          <code>cronPushLogs</code>, then publishes a notification.
        </p>
        {pendingRequestId && (
          <p className="pending">Pending request <code>{pendingRequestId}</code> — waiting for result…</p>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Live notifications</h2>
          <span className="muted tiny">{feed.length} events</span>
        </div>
        {feed.length === 0 ? (
          <p className="muted">No events yet. Enqueue a cron tick or publish from Studio.</p>
        ) : (
          <ul className="feed">
            {feed.map((item) => (
              <li key={item.id} className={`feed-item ${item.status}`}>
                <span className="badge">{item.status}</span>
                <div>
                  <p>{item.message}</p>
                  <time>{new Date(item.at).toLocaleString()}</time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>demo_jobs</h2>
          <button type="button" disabled={busy} onClick={() => void refreshJobs()}>
            Refresh
          </button>
        </div>

        <form className="row-form" onSubmit={(e) => void onCreate(e)}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Job name (optional)"
            disabled={busy}
          />
          <button type="submit" className="primary" disabled={busy}>
            Create
          </button>
        </form>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Status</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    No rows — create one or enqueue a cron tick.
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <tr key={job.id}>
                    <td className="mono">{job.id}</td>
                    <td>{job.name}</td>
                    <td>
                      <select
                        value={job.status}
                        disabled={busy}
                        onChange={(e) => void onStatus(job, e.target.value)}
                      >
                        <option value="pending">pending</option>
                        <option value="queued">queued</option>
                        <option value="done">done</option>
                        <option value="failed">failed</option>
                      </select>
                    </td>
                    <td className="muted tiny">
                      {job.created_at ? new Date(job.created_at).toLocaleString() : "—"}
                    </td>
                    <td>
                      <button type="button" className="danger" disabled={busy} onClick={() => void onDelete(job)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
