"""Read-only PromiseGraph context API for the local hackathon prototype."""
from __future__ import annotations

import os
import logging
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from falkordb import FalkorDB
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from backend.commitment_analysis import analyze_promises

load_dotenv()

FALKORDB_HOST = os.getenv("FALKORDB_HOST", "localhost")
FALKORDB_PORT = int(os.getenv("FALKORDB_PORT", "6379"))
GRAPH_NAME = os.getenv("FALKORDB_GRAPH", "promisegraph_demo")
logger = logging.getLogger(__name__)

app = FastAPI(title="PromiseGraph API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class AskRequest(BaseModel):
    question: str = Field(min_length=3, max_length=500)


def get_graph():
    """Open the graph connection on demand, so the app can start before DB checks."""
    try:
        return FalkorDB(host=FALKORDB_HOST, port=FALKORDB_PORT).select_graph(GRAPH_NAME)
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Cannot connect to FalkorDB at {FALKORDB_HOST}:{FALKORDB_PORT}: {exc}",
        ) from exc


def rows(query: str, params: dict[str, Any]) -> list[list[Any]]:
    try:
        return get_graph().ro_query(query, params=params).result_set
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"FalkorDB query failed: {exc}") from exc


@app.get("/health")
def health() -> dict[str, str]:
    result = rows("MATCH (n) RETURN count(n)", {})
    return {"status": "ok", "graph": GRAPH_NAME, "node_count": str(result[0][0] if result else 0)}


@app.get("/api/customers/{customer_id}/context")
def customer_context(customer_id: str) -> dict[str, Any]:
    """Return graph-connected support context; no writes or LLM calls are made."""
    customer_rows = rows(
        "MATCH (c:Customer {id: $customer_id}) RETURN c.id, c.name, c.segment",
        {"customer_id": customer_id},
    )
    if not customer_rows:
        raise HTTPException(status_code=404, detail=f"Customer not found: {customer_id}")

    ticket_rows = rows(
        """
        MATCH (c:Customer {id: $customer_id})-[:HAS_CASE]->(t:Ticket)
        RETURN DISTINCT t.id, t.summary, t.status, t.created_at
        ORDER BY t.created_at
        """,
        {"customer_id": customer_id},
    )

    bug_rows = rows(
        """
        MATCH (c:Customer {id: $customer_id})-[:HAS_CASE]->(t:Ticket)
              -[:RELATED_TO]->(b:Bug)-[:OWNED_BY]->(owner:Person)
        RETURN DISTINCT t.id, b.id, b.title, b.status, owner.id, owner.name
        ORDER BY t.id
        """,
        {"customer_id": customer_id},
    )

    promise_rows = rows(
        """
        MATCH (p:Promise)-[:MADE_TO]->(c:Customer {id: $customer_id})
        OPTIONAL MATCH (p)-[:MADE_BY]->(maker:Person)
        OPTIONAL MATCH (p)-[:RECORDED_IN]->(source)
        OPTIONAL MATCH (p)-[:DEPENDS_ON]->(bug:Bug)
        OPTIONAL MATCH (p)-[:CLOSES_LOOP]->(follow:FollowUp)
        RETURN p.id, p.text, p.created_at, p.due_at, p.status,
               p.evidence_excerpt, maker.name, source.id, bug.id, follow.status,
               p.confidence
        ORDER BY p.due_at
        """,
        {"customer_id": customer_id},
    )

    sla_rows = rows(
        """
        MATCH (c:Customer {id: $customer_id})-[:HAS_CASE]->(case:Case)
              -[:HAS_TICKET]->(t:Ticket)-[:TRIGGERED]->(sla:SLAEvent)
              -[:DEFINED_BY]->(contract:Document)
        RETURN DISTINCT case.id, t.id, sla.id, sla.kind, sla.occurred_at,
                        sla.target_at, contract.id, contract.title, contract.excerpt,
                        case.priority
        """,
        {"customer_id": customer_id},
    )

    customer = customer_rows[0]
    return {
        "customer": {"id": customer[0], "name": customer[1], "segment": customer[2]},
        "tickets": [
            {"id": r[0], "summary": r[1], "status": r[2], "created_at": r[3]}
            for r in ticket_rows
        ],
        "bug_paths": [
            {"ticket_id": r[0], "bug_id": r[1], "bug_title": r[2],
             "bug_status": r[3], "owner_id": r[4], "owner_name": r[5]}
            for r in bug_rows
        ],
        "promises": [
            {"id": r[0], "text": r[1], "created_at": r[2], "due_at": r[3],
             "status": r[4], "evidence_excerpt": r[5], "made_by": r[6],
             "source_id": r[7], "depends_on_bug_id": r[8], "follow_up_status": r[9],
             "confidence": r[10]}
            for r in promise_rows
        ],
        "sla_events": [
            {"case_id": r[0], "ticket_id": r[1], "id": r[2], "kind": r[3],
             "occurred_at": r[4], "target_at": r[5], "contract_id": r[6],
             "contract_title": r[7], "contract_excerpt": r[8], "case_priority": r[9]}
            for r in sla_rows
        ],
    }


@app.get("/api/customers/{customer_id}/analysis")
def customer_analysis(customer_id: str) -> dict[str, Any]:
    """Return deterministic commitment status and transparent debt ranking."""
    context = customer_context(customer_id)
    priority = next(
        (event.get("case_priority") for event in context["sla_events"] if event.get("case_priority")),
        "normal",
    )
    return {
        "customer": context["customer"],
        "analysis": analyze_promises(context["promises"], case_priority=priority),
        "sla_events": context["sla_events"],
        "bug_paths": context["bug_paths"],
    }


@app.post("/api/customers/{customer_id}/ask")
def ask_customer(customer_id: str, request: AskRequest) -> dict[str, Any]:
    """Answer a case question using a LangGraph tool-calling agent."""
    question = request.question.strip()
    if len(question) < 3:
        raise HTTPException(status_code=422, detail="Question must contain at least 3 non-space characters.")
    if not (os.getenv("RADOXAI_API_KEY") or os.getenv("OPENAI_API_KEY")):
        raise HTTPException(
            status_code=503,
            detail="Agent is not configured. Set RADOXAI_API_KEY (or OPENAI_API_KEY) locally.",
        )
    try:
        from backend.agent_workflow import invoke_case_agent

        return invoke_case_agent(
            customer_id=customer_id,
            question=question,
            context_loader=customer_context,
            analysis_loader=customer_analysis,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("LangGraph case analysis failed")
        raise HTTPException(
            status_code=502,
            detail="The agent request failed. Check the backend terminal for the error details.",
        ) from exc


def _sse(event: str, data: dict[str, Any]) -> str:
    """Format a single Server-Sent Event frame."""
    import json

    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"


@app.post("/api/customers/{customer_id}/ask/stream")
def ask_customer_stream(customer_id: str, request: AskRequest) -> StreamingResponse:
    """Stream safe progress, tool lifecycle names, then the verified answer."""
    question = request.question.strip()
    if len(question) < 3:
        raise HTTPException(status_code=422, detail="Question must contain at least 3 non-space characters.")
    if not (os.getenv("RADOXAI_API_KEY") or os.getenv("OPENAI_API_KEY")):
        raise HTTPException(
            status_code=503,
            detail="Agent is not configured. Set RADOXAI_API_KEY (or OPENAI_API_KEY) locally.",
        )

    def event_stream():
        from backend.agent_workflow import stream_case_agent

        try:
            for item in stream_case_agent(
                customer_id=customer_id,
                question=question,
                context_loader=customer_context,
                analysis_loader=customer_analysis,
            ):
                yield _sse(item["event"], item["data"])
        except Exception:
            logger.exception("LangGraph SSE stream failed")
            yield _sse("error", {"message": "Agent stream failed. Check the local backend terminal for details."})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/customers/{customer_id}/draft-reply/stream")
def draft_customer_reply_stream(customer_id: str) -> StreamingResponse:
    """Create an editable, unsent customer update with validated evidence."""
    if not (os.getenv("RADOXAI_API_KEY") or os.getenv("OPENAI_API_KEY")):
        raise HTTPException(
            status_code=503,
            detail="Agent is not configured. Set RADOXAI_API_KEY (or OPENAI_API_KEY) locally.",
        )

    def event_stream():
        from backend.agent_workflow import stream_reply_draft

        try:
            for item in stream_reply_draft(
                customer_id=customer_id,
                context_loader=customer_context,
                analysis_loader=customer_analysis,
            ):
                yield _sse(item["event"], item["data"])
        except Exception:
            logger.exception("LangGraph reply-draft stream failed")
            yield _sse("error", {"message": "Draft generation failed. Check the local backend terminal for details."})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
