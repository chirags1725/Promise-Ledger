"""Deterministic Promise Ledger scoring; no LLM or database calls."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


PRIORITY_IMPACT = {"critical": 3.0, "high": 2.0, "medium": 1.5, "normal": 1.0, "low": 1.0}
CLOSED_PROMISE_STATUSES = {"fulfilled", "completed", "cancelled", "canceled", "superseded"}
CLOSED_FOLLOWUP_STATUSES = {"completed", "done", "closed", "sent", "fulfilled"}


def _parse_time(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        result = value
    else:
        text = str(value).strip()
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            result = datetime.fromisoformat(text)
        except ValueError:
            return None
    if result.tzinfo is None:
        result = result.replace(tzinfo=timezone.utc)
    return result


def _clamp_confidence(value: Any) -> float:
    try:
        confidence = float(value)
    except (TypeError, ValueError):
        confidence = 0.5
    return max(0.5, min(1.0, confidence))


def analyze_promises(
    promises: list[dict[str, Any]],
    case_priority: str = "normal",
    as_of: datetime | None = None,
) -> dict[str, Any]:
    """Classify commitments and rank them using the documented transparent formula.

    overdue_days_weight = min(1 + overdue_days / 7, 3)
    repetition_weight = 1 + 0.25 * other_overdue_promises
    debt = impact_weight * overdue_days_weight * repetition_weight * confidence_weight

    This heuristic is for demo triage only; it is not a calibrated risk prediction.
    """
    now = as_of or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    now = now.astimezone(timezone.utc)

    prepared: list[dict[str, Any]] = []
    for promise in promises:
        original = str(promise.get("status") or "").strip().lower()
        due = _parse_time(promise.get("due_at"))
        if original in CLOSED_PROMISE_STATUSES:
            status = "closed"
        elif due is None:
            status = "date_unclear"
        elif due.astimezone(timezone.utc) <= now:
            status = "overdue"
        else:
            status = "open"
        overdue_days = (
            max(0.0, (now - due.astimezone(timezone.utc)).total_seconds() / 86400)
            if status == "overdue" and due
            else 0.0
        )
        follow_status = str(promise.get("follow_up_status") or "").strip().lower()
        follow_up_open = follow_status not in CLOSED_FOLLOWUP_STATUSES
        prepared.append({
            "promise": promise,
            "status": status,
            "overdue_days": overdue_days,
            "follow_up_open": follow_up_open,
        })

    unresolved_overdue_count = sum(item["status"] == "overdue" for item in prepared)
    impact_weight = PRIORITY_IMPACT.get(str(case_priority or "normal").lower(), 1.0)
    ranked: list[dict[str, Any]] = []
    for item in prepared:
        promise = item["promise"]
        confidence_weight = _clamp_confidence(promise.get("confidence"))
        overdue_days_weight = min(1.0 + item["overdue_days"] / 7.0, 3.0) if item["status"] == "overdue" else 0.0
        prior_misses = max(0, unresolved_overdue_count - 1) if item["status"] == "overdue" else 0
        repetition_weight = 1.0 + 0.25 * prior_misses
        debt_score = (
            impact_weight * overdue_days_weight * repetition_weight * confidence_weight
            if item["status"] == "overdue"
            else 0.0
        )
        ranked.append({
            "id": promise.get("id"),
            "text": promise.get("text"),
            "status": item["status"],
            "due_at": promise.get("due_at"),
            "overdue_days": round(item["overdue_days"], 2),
            "made_by": promise.get("made_by"),
            "source_id": promise.get("source_id"),
            "evidence_excerpt": promise.get("evidence_excerpt"),
            "follow_up_status": promise.get("follow_up_status"),
            "follow_up_open": item["follow_up_open"],
            "score": {
                "value": round(debt_score, 2),
                "impact_weight": impact_weight,
                "overdue_days_weight": round(overdue_days_weight, 2),
                "repetition_weight": round(repetition_weight, 2),
                "confidence_weight": round(confidence_weight, 2),
                "prior_overdue_promises": prior_misses,
            },
        })

    ranked.sort(key=lambda row: row["score"]["value"], reverse=True)
    open_count = sum(row["status"] in {"overdue", "open", "date_unclear"} for row in ranked)
    return {
        "as_of": now.isoformat(),
        "case_priority": str(case_priority or "normal").lower(),
        "impact_weight": impact_weight,
        "open_commitment_count": open_count,
        "overdue_commitment_count": unresolved_overdue_count,
        "unclosed_follow_up_count": sum(row["follow_up_open"] for row in ranked),
        "score_formula": "impact × overdue_days_weight × repetition × confidence",
        "score_note": "Transparent demo triage heuristic; not a calibrated prediction.",
        "commitments": ranked,
    }
