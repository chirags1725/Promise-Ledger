# Step 3 — Run the read-only graph API

The backend exposes the first graph-backed product endpoint. It performs read-only Cypher queries and returns customer context as JSON. It does not yet calculate a commitment score, call an LLM, or modify any records.

## Files

- `backend/main.py` — FastAPI app and parameterized FalkorDB read queries.
- `backend/requirements.txt` — Python dependencies.

Place these under the existing PromiseGraph project folder, alongside `data/bluepeak_seed.json`.

## Install

Run from the project root. Keep FalkorDB running in Docker on `localhost:6379`.

**Windows PowerShell**

```powershell
py -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r backend/requirements.txt
```

**macOS/Linux**

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r backend/requirements.txt
```

If you already created and activated `.venv` during seed loading, reuse it; only install the requirements.

## Start the API

```bash
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Open the interactive API page at `http://127.0.0.1:8000/docs`.

## Test it

In a second terminal, request the health endpoint:

```bash
curl http://127.0.0.1:8000/health
```

Then request Bluepeak's connected context:

```bash
curl http://127.0.0.1:8000/api/customers/CUST-BLUEPEAK/context
```

On Windows PowerShell, `curl` can be an alias. If needed, use:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/customers/CUST-BLUEPEAK/context
```

Expected result: JSON containing the Bluepeak customer, three tickets, bug-to-owner paths including **Riya Kulkarni**, two promises and their source/follow-up details, and the SLA/contract evidence. If a section is empty, verify the corresponding relationships exist in FalkorDB and that the database and graph names match `promisegraph_demo`.

## What to send me next

Tell me whether `/health` works and whether `/api/customers/CUST-BLUEPEAK/context` returns those sections. If either fails, paste the error text (remove any secrets). Once this works, Step 4 is deterministic commitment status and ranking based on this returned evidence.
