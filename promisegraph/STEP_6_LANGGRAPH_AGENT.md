# Step 6 — LangGraph agent, tool calling, and live progress

PromiseGraph uses LangGraph for the agent/tool workflow, LangChain's `ChatOpenAI` adapter for the OpenAI-compatible RadoxAI endpoint, and FalkorDB as the case-data source. The agent has two read-only tools:

- `get_customer_context()` retrieves connected tickets, bugs, owners, promises, SLA records, and source references.
- `get_commitment_analysis()` retrieves deterministic promise status, follow-up state, and the transparent score.

The requested customer ID is bound server-side; the model cannot use a tool argument to select another customer. Tool arguments and raw graph payloads are not sent to the browser. The browser receives only safe progress labels, tool names, tool status, and the final answer with citation-validation results. The agent cannot write to FalkorDB or send customer messages.

## Install backend dependencies

Activate your project virtual environment and run:

```bash
pip install -r backend/requirements.txt
```

These requirements include LangChain, LangGraph, the LangChain OpenAI-compatible model adapter, and `python-dotenv`.

## Configure RadoxAI locally

Create a project-root `.env` file based on `.env.example`:

```dotenv
RADOXAI_BASE_URL=https://radoxai.com/v1
RADOXAI_API_KEY=your-provider-key
PROMISEGRAPH_MODEL=claude-opus-4.8
```

Keep `.env` out of Git and screenshots. If your existing setup uses `OPENAI_API_KEY` for RadoxAI, the backend accepts that as a fallback. Do not paste credentials into chat.

## Run the backend

From the PromiseGraph project root, with the virtual environment active:

```bash
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

`load_dotenv()` reads the project-root `.env` when the app starts. Keep FalkorDB running as before.

## Run and try the frontend

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`, ask **“Why is Bluepeak angry, and what should we do next?”**, and watch the live investigation panel. It begins with a progress state, then displays each tool as running and done, then renders the answer and verified citations.

## Streaming API

The React panel posts to:

```text
POST /api/customers/CUST-BLUEPEAK/ask/stream
Content-Type: application/json

{"question":"Why is Bluepeak angry, and what should we do next?"}
```

The response uses Server-Sent Events (`text/event-stream`):

- `progress`: high-level status such as investigation started.
- `tool_start`: safe tool name/label when the agent requests a tool.
- `tool_finish`: tool name/label and completion status; no tool output or arguments.
- `answer`: final response, tools used, validated citations, and grounded flag.
- `done`: end of stream.
- `error`: safe error summary if the stream fails.

The previous JSON `/ask` endpoint remains available for non-streaming tests. The streaming UI consumes the POST response body directly with the browser `fetch` reader.

## Safety / limitations

The loading message appears while the model decides which tool to call. A specific tool row appears as soon as LangGraph streams the model's tool call, before the tool is executed. The app reveals the tool label, not customer data or tool arguments. The cited IDs must belong to the graph evidence returned by the tools for the response to be labeled grounded.

This is request-scoped agent state; it does not preserve chat history across API restarts. FalkorDB remains the persistent customer/case memory. No message-sending or graph-write tool is registered.
