# Step 8 — Click-through evidence inspector

This step makes source IDs in the case workspace clickable. Selecting a citation, promise source, ticket, bug, SLA event, or contract opens a side drawer with the underlying record summary, relevant excerpt, selected metadata, and its connected graph relationships.

## Apply and run

Use the Step 8 update bundle over your current project. It builds on Step 7 and keeps the existing local `.env` configuration. Install/update the backend dependencies if needed:

```bash
pip install -r backend/requirements.txt
```

Restart FastAPI and Vite. In the workspace, click any source chip (for example `PROM-22`, `CALL-18`, `TKT-251`, `BUG-77`, or `BLUEPEAK-CONTRACT-1`) to inspect its detail and neighboring relationship edges. Click a linked ID inside the drawer to navigate to another customer-linked record.

## API behavior

```text
GET /api/customers/{customer_id}/sources/{source_id}
```

Before reading a node, the backend assembles an allowlist from that customer's context and deterministic analysis. IDs outside that allowlist return `404`, and the query uses parameters instead of inserting the ID into Cypher. The endpoint uses read-only graph queries and returns only selected fields and relationship IDs—never arbitrary node properties or writes.

This inspector improves provenance review; it does not change the agent's claims or alter the customer graph.
