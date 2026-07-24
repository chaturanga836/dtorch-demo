# dtorch-demo

Small **DT Orch** demo: Node scripts **and** a React console using project key + secret.

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
DTORCH_QUEUE_NAME=test_queue
DTORCH_CHANNEL=demo
CRON_JOB_NAME=demo-jobs
```

Create the Studio queue (`DTORCH_QUEUE_NAME`) and enable **Queues** on the account. For cron history, create Studio cron job `demo-jobs` with History log on.

## React console (recommended)

Runs an Express API (holds secrets + queue worker) and a Vite React UI:

```powershell
npm run app
```

- UI: http://localhost:5173  
- API: http://localhost:5174  

What you can do in the UI:

| Area | Action |
|------|--------|
| **demo_jobs** | Create / update status / delete (CRUD via SDK) |
| **Cron via queue** | Enqueue a `cron.tick` → worker inserts rows + `cronPushLogs` |
| **Live notifications** | Centrifugo feed shows **success** / **failed** when the worker finishes |

Secrets never go to the browser — only a short-lived realtime token is minted by the API.

## CLI scripts

| Command | What it does |
|---------|----------------|
| `npm run validate` | Check pk/ps and list databases + scopes |
| `npm run storage` | Upload + list MinIO objects via platform API |
| `npm run notify` | Publish a realtime notification |
| `npm run subscribe` | Subscribe with Centrifugo (project realtime token) |
| `npm run queue -- --queue-id <name>` | Optional TS wrapper (same as `dtorch run queue`) |
| `dtorch run queue --queue-id <name>` | **Preferred:** push → peek → pop via CLI |
| `npm run cron` | Interactive local cron (node-cron) — inserts + `cronPushLogs` |
| `npm run db:demo` | Insert/list `demo_jobs` (after migration) |
| `npm run demo` | validate → storage → notify |
| `npm run server` | API + queue worker only |
| `npm run web` | Vite UI only (needs server) |

### Queue demo

```powershell
dtorch run queue --queue-id test_queue
# or: npm run queue -- --queue-id test_queue
```

### Migrations

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install ..\python\etl-deployment\sdk\python ..\python\etl-deployment\cli

dtorch init
dtorch link --api-url http://13.200.160.10 --workspace 1 --database 1
dtorch db push -y
```

Then `npm run db:demo` or open the React console.
