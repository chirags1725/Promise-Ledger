# Step 5 — Run the local case workspace UI

This is a local React/Vite frontend for the FastAPI service running on the same PC at `http://localhost:8000`. The Vite dev server uses `http://localhost:5173`.

## Files

Copy the `frontend/` folder into the PromiseGraph project root. Keep the existing `backend/` folder and `data/bluepeak_seed.json` alongside it.

## Run

First, make sure FalkorDB and the FastAPI backend are running. Then, in a new terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`.

## What the screen shows

The screen loads `/api/customers/CUST-BLUEPEAK/context` and `/analysis` from the API. It displays the support-history explanation, overdue commitment ranking with its transparent formula factors, SLA evidence, owner paths, and source references. It uses no hardcoded sample response: if the API is unavailable, the screen reports that rather than showing fabricated findings.

The page is a local prototype. It does not send customer messages or change records. Any recommendation is informational; an actual draft/send workflow will be implemented separately.

## Troubleshooting

- If the page reports an API connection error, verify the backend is running at `http://localhost:8000` and check `/health`.
- If the browser reports a CORS error, confirm that the updated `backend/main.py` has the Vite origins `http://localhost:5173` and `http://127.0.0.1:5173` in its allowlist, then restart FastAPI.
- If npm reports a Node version problem, use a current supported Node.js LTS release and rerun `npm install`.
