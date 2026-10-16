# PromiseGraph Frontend

Standalone React + Vite + TypeScript case workspace. This folder is complete: it contains the application source, Vite configuration, TypeScript config, dependency manifest, and lockfile.

## Requirements

- Node.js 20.19+ or 22.12+ (Node 22 LTS recommended)
- PromiseGraph FastAPI backend running at `http://localhost:8000`
- FalkorDB running for graph reads; RadoxAI model credentials configured in the backend's project-root `.env` for agent questions

## Install and run

From this folder:

```bash
npm install
npm run dev
```

Open the URL printed by Vite, usually `http://localhost:5173`.

## API connection

The frontend defaults to `http://localhost:8000` and uses:

- `GET /api/customers/CUST-BLUEPEAK/context`
- `GET /api/customers/CUST-BLUEPEAK/analysis`
- `GET /api/customers/CUST-BLUEPEAK/sources/{source_id}` for a customer-scoped record and its graph provenance
- `POST /api/customers/CUST-BLUEPEAK/ask/stream` for live SSE tool progress and the evidence-checked answer
- `POST /api/customers/CUST-BLUEPEAK/draft-reply/stream` for an editable, source-backed draft that is never sent automatically

To use another API address, create a frontend `.env.local` file with:

```dotenv
VITE_API_BASE_URL=http://localhost:8000
```

Do not put provider API keys in this frontend folder. Keep model credentials in the backend environment only.
