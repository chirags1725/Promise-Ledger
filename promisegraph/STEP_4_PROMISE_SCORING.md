# Step 4 — Deterministic Promise Ledger scoring

Step 4 adds a pure Python analysis function and a read-only endpoint. It classifies each promise as `overdue`, `open`, `closed`, or `date_unclear`, ranks overdue commitments, and exposes every factor used in the score. It makes no LLM call and writes nothing to FalkorDB.

## Files to add/update

- Add `backend/commitment_analysis.py`.
- Add `backend/test_commitment_analysis.py`.
- Replace `backend/main.py` with the updated file from this project bundle.

## Install and run tests

With the project's virtual environment active, from the project root:

```bash
python -m unittest backend.test_commitment_analysis
```

All three tests should pass. Restart the API if it was already running:

```bash
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

## Test the score endpoint

```bash
curl http://127.0.0.1:8000/api/customers/CUST-BLUEPEAK/analysis
```

PowerShell alternative:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/customers/CUST-BLUEPEAK/analysis
```

The JSON should show two overdue commitments and their source, owner, follow-up status, overdue age, and score breakdown. `PROM-22` should rank above `PROM-31` because it has been overdue longer. The score is a demonstrable triage heuristic, not a calibrated prediction.

## Formula

`debt = impact_weight × overdue_days_weight × repetition_weight × confidence_weight`

- Priority maps to impact weights: critical 3.0, high 2.0, medium 1.5, normal/low 1.0.
- `overdue_days_weight = min(1 + overdue_days / 7, 3)`.
- `repetition_weight = 1 + 0.25 × other_overdue_promises` for the same customer context.
- Confidence is clamped between 0.5 and 1.0.
- A promise with no due date is `date_unclear`, not overdue. Closed statuses have a score of zero.

The response includes all these factors so the interface can explain why items were ranked. The number must not be presented as a probability of churn, severity prediction, or objective measurement of anger.

## If the result differs

The endpoint derives case impact from `case.priority` returned with SLA evidence. Confirm the seed graph's `CASE-104` node has `priority: "critical"`. If status or scores differ, share the response JSON (omit credentials) and we can debug before building the UI.
