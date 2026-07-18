# dtorch-demo

Small TypeScript demo for **DT Orch** using project key + secret only.

Customer apps never use Keycloak. Studio JWT is only for migrations/DDL.

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
| `npm run cron` | Local `node-cron` every minute (platform Beat not ready) |
| `npm run db:demo` | Insert/list `demo_jobs` (after migration) |
| `npm run migrate:sql` | Print migration SQL |
| `npm run demo` | validate → storage → notify |

## Migrations (Studio JWT)

Project credentials cannot apply DDL. Use the Python CLI:

```powershell
py -m venv .venv
.\.venv\Scripts\pip install D:\python\etl-deployment\sdk\python D:\python\etl-deployment\cli
$env:DTORCH_ACCESS_TOKEN="<Keycloak access token from Studio>"
.\.venv\Scripts\dtorch.exe db push -y
```

Then:

```powershell
npm run db:demo
```

## Current host notes (`http://13.200.160.10`)

Validated with your project credentials: **ok**, workspace `1`.

Findings on that host today:

1. **No databases provisioned yet** (`has_databases: false`). Create a Postgres database in Studio for project 1, then set `DTORCH_DATABASE_ID`.
2. **Storage / notifications / runtime with project credentials** need the newer `etl-back` deploy (unified app scopes). Until then those routes still expect Studio JWT and will return 401 for `pk_`/`ps_`.
3. After you deploy the auth changes and provision DB + storage, run `npm run demo`, then `npm run subscribe` / `npm run cron`.
