-- Demo jobs table for SDK + local cron exercises.
-- Apply with Studio JWT: dtorch db push -y
-- Project key/secret cannot run DDL.

CREATE TABLE IF NOT EXISTS demo_jobs (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payload TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demo_jobs_status ON demo_jobs (status);
