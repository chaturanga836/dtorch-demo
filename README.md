# dtorch-demo

Small TypeScript demo for **DT Orch** using project key + secret only.

Customer apps never use Keycloak. Project key + secret cover runtime **and** migrations.

## Setup

```powershell
cd D:\dtorch-demo
copy .env.example .env   # or use the existing .env
npm install
```

`.env` (gitignored):

```env
DTORCH_API_URL=http://13.200.160.10
DTORCH_WORKSPACE_ID=1
DTORCH_DATABASE_ID=1
DTORCH_PROJECT_KEY=pk_...
DTORCH_PROJECT_SECRET=ps_...
```

Optional: `DTORCH_ORG_ID` if your org id is not `1` (used for channel name helpers).

## Scripts

| Command | What it does |
|---------|----------------|
| `npm run validate` | Check pk/ps and list databases + scopes |
| `npm run storage` | Upload + list MinIO objects via platform API |
| `npm run notify` | Publish a realtime notification |
| `npm run subscribe` | Subscribe with Centrifugo (project realtime token) |
| `npm run cron` | Interactive local cron → loop-insert into `demo_jobs` + `runtime.cronPushLogs` (platform Beat not ready) |
| `npm run db:demo` | Insert/list `demo_jobs` (after migration) |
| `npm run migrate:sql` | Print migration SQL |
| `npm run demo` | validate → storage → notify |

### Cron history (Studio monitor)

1. In Studio → Cron, create a job named `demo-jobs` (or set `CRON_JOB_NAME`) with **History log** on.
2. Run `npm run cron` (or `CRON_AUTO_START=1`).
3. Each tick pushes a log via `client.runtime.cronPushLogs`; it appears in the Monitor panel when history is enabled.

## Migrations (project key / secret)

Same credentials as the app SDK. Put them in `.env` — the CLI loads it automatically:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install dtorch-cli
# Until PyPI: pip install ..\python\etl-deployment\sdk\python ..\python\etl-deployment\cli

dtorch init
dtorch link --api-url http://13.200.160.10 --workspace 1 --database 1
dtorch db push -y
```

Then:

```powershell
npm run db:demo
```

Requires an API build that accepts project credentials on `/migrations` and `/migrations/apply`.

## Current host notes (`http://13.200.160.10`)

Validated with your project credentials: **ok**, workspace `1`.

Findings on that host today:

1. **No databases provisioned yet** (`has_databases: false`). Create a Postgres database in Studio for project 1, then set `DTORCH_DATABASE_ID`.
2. **Storage / notifications / runtime with project credentials** need the newer `etl-back` deploy (unified app scopes). Until then those routes still expect Studio JWT and will return 401 for `pk_`/`ps_`.
3. After you deploy the auth changes and provision DB + storage, run `npm run demo`, then `npm run subscribe` / `npm run cron`.
