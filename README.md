# PromiseGraph

**A commitment-aware customer escalation workspace powered by FalkorDB and a LangGraph tool-calling agent.** PromiseGraph connects repeat tickets, customer promises, product bugs, owners, follow-ups, and SLA evidence so an operator can see why an account escalated and what to verify next.

This repository contains a synthetic Bluepeak Robotics demo, designed to demonstrate connected-data agents, persistent customer memory, and an evidence-linked company brain in one coherent workflow.

For a submission-ready pitch, track mapping, and timed demo walkthrough, see [HACKATHON_SUBMISSION.md](HACKATHON_SUBMISSION.md). For the product rationale and implementation roadmap, see [PROJECT_PLAN.md](PROJECT_PLAN.md).

## What the demo does

The workspace shows a chronological case timeline built from tickets, commitment deadlines, and SLA events. Operators can search and filter the timeline, click source IDs to inspect records and graph edges, and review a deterministic commitment-debt ranking.

A LangGraph agent uses two server-bound, read-only LangChain tools. The UI streams tool progress, displays formatted answers, and validates cited IDs against graph evidence. It also creates an editable customer-update draft with safety checks, but the draft remains unsent. One-click prompt suggestions, a browser-local follow-up checklist, and a downloadable Markdown case brief help present the operator workflow.

## Run locally

Requirements: Docker with Compose, Python 3.11+, Node.js 20+, and a key for an OpenAI-compatible model endpoint that supports tool calling. FalkorDB's official Docker image includes the database and browser UI; see the [official FalkorDB Docker documentation](https://docs.falkordb.com/operations/docker).

### 1. Start FalkorDB

From the project root:

```bash
docker compose up -d
```

The Compose file binds FalkorDB on `127.0.0.1:6379` and its browser on `127.0.0.1:3000`, with a persistent local volume. Open [http://localhost:3000](http://localhost:3000) to inspect the graph. This development setup has no database password; keep it bound to loopback and do not expose these ports to a public network.

### 2. Prepare Python and provider configuration

Create and activate a virtual environment, then install backend requirements:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r backend/requirements.txt
```

On Windows PowerShell, use `py -m venv .venv` and `.venv\Scripts\Activate.ps1` instead of the first two commands above.

Copy `.env.example` to `.env`. Add your own `RADOXAI_API_KEY` and check `RADOXAI_BASE_URL` and `PROMISEGRAPH_MODEL` against your provider's current tool-calling configuration. Never commit `.env` or put the provider key in the frontend.

The graph dashboard and deterministic analysis work without an LLM key. The Ask Agent and Draft actions need the provider key.

### 3. Validate and seed the synthetic graph

```bash
python scripts/seed_graph.py --dry-run
python scripts/seed_graph.py
```

The loader validates node labels, relationship types, unique IDs, and edge endpoints, then uses parameterized `MERGE` operations. It is idempotent and does not delete graph data. Review the synthetic seed before loading it into a graph that contains other data.

### 4. Start the API

In a terminal with the virtual environment active, from the project root:

```bash
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Check [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health) and the interactive docs at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

### 5. Start the frontend

In another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open the local Vite URL printed in the terminal (normally [http://127.0.0.1:5173](http://127.0.0.1:5173)). The API and Vite development server are configured for local-only use.

## Suggested demo flow

1. Show the Bluepeak escalation, graph connection indicator, commitment debt, and SLA evidence.
2. Walk the case timeline; filter to commitments or search `PROM-22`. Open `PROM-22`, `CALL-18`, `BUG-77`, or `SLA-09` to inspect its source record and relationships.
3. Explain that the contract requires an initial response but does not guarantee a bug-fix date.
4. Use a suggested question, such as **Why is Bluepeak escalating?** Show the two streamed read-only tool calls, grounded answer, and clickable source citations.
5. Generate a customer response draft. Review the warnings and internal evidence. Show that it remains editable and unsent.
6. Toggle an operator checklist item and export the Markdown case brief. Explain that the checklist is stored only in this browser and the brief is a downloaded snapshot, not an authoritative record.

## Verify the project

From the project root, with the virtual environment active:

```bash
python scripts/seed_graph.py --dry-run
python -m py_compile backend/main.py backend/agent_workflow.py scripts/seed_graph.py
python -m unittest discover -s backend -p 'test_*.py' -v
cd frontend && npm ci && npm run build
```

The offline agent integration test runs the real LangGraph workflow against a local OpenAI-compatible mock server; it does not contact RadoxAI. A real-provider smoke test requires your own configured key and a model that supports tool calling.

## Architecture and safety

`frontend/` is a React/Vite operator workspace. `backend/main.py` is the FastAPI boundary and executes fixed, parameterized FalkorDB queries. `backend/commitment_analysis.py` calculates deterministic promise status and scores. `backend/agent_workflow.py` uses LangGraph with LangChain tools and an OpenAI-compatible chat model configured through the backend environment. `scripts/seed_graph.py` initializes the synthetic demo graph.

The model cannot choose a customer ID, write Cypher, alter graph records, or send email. The read-only tools are bound to the requested customer by the server. Citations are validated against returned records. The source inspector resolves only IDs in the customer-specific evidence allowlist. Draft checks are a review aid, not a guarantee; a human must verify current status and wording before using a message.

The checklist is browser-local, and case-brief export is a Markdown snapshot. Neither is an audit log or write-back integration. All supplied Bluepeak records are synthetic.
