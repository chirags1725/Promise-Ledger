# Step 7 — Human-reviewed customer update draft

This step activates **Prepare response** in the case workspace. The LangGraph agent retrieves both read-only evidence sets, then drafts an empathetic customer update. The text remains editable in the browser and is not written to FalkorDB, a ticketing system, or email. There is no send action.

The implementation asks the agent to acknowledge the missed commitments and communication gap, say the export issue remains under investigation, and avoid an unconfirmed fix claim, new ETA, date, relative timeframe, or customer-visible internal record ID. Internal source IDs and uncertainty appear in a separate panel.

## Apply and run

Use the updated Step 7 bundle over your current project. Keep the RadoxAI `.env` setup from Step 6. With the backend virtual environment active, from the project root:

```bash
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`, confirm Bluepeak graph data loads, then click **Prepare response**. The same live tool loader should show the context and commitment-analysis calls. After the draft arrives, review the customer copy, evidence IDs, internal note, and any warnings. You can edit it or copy it to the clipboard.

## API and safety checks

The browser calls:

```text
POST /api/customers/CUST-BLUEPEAK/draft-reply/stream
```

The SSE stream reports progress, tool lifecycle, and a final `draft` object. The backend checks whether both evidence tools ran, the response includes validated source IDs, and the customer-facing text contains a date/time reference or internal record ID. Any failed check is surfaced as a warning; passing checks still do **not** replace a human review.

The app does not send or save the draft. The draft is only in browser state and is lost on refresh. Do not promise a fix date until engineering confirms one and a human authorizes the wording.
