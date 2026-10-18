"""Offline integration test for the real LangGraph/ChatOpenAI tool cycle."""
import json
import os
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

from backend.agent_workflow import stream_case_agent


class MockChatHandler(BaseHTTPRequestHandler):
    request_count = 0

    def do_POST(self):
        size = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(size))
        messages = payload.get("messages", [])
        has_tool_output = any(message.get("role") == "tool" for message in messages)
        type(self).request_count += 1
        if not has_tool_output:
            message = {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {"id": "mock-context-call", "type": "function", "function": {"name": "get_customer_context", "arguments": "{}"}},
                    {"id": "mock-analysis-call", "type": "function", "function": {"name": "get_commitment_analysis", "arguments": "{}"}},
                ],
            }
            finish_reason = "tool_calls"
        else:
            message = {
                "role": "assistant",
                "content": "## Why the case escalated\n- The latest ticket repeats the export issue [TKT-251] [BUG-77].\n- Two commitments remain overdue [PROM-22].\n\n## Safe next step\nConfirm BUG-77 with its owner before offering an ETA [PERS-RIYA]. The SLA breach is documented [SLA-09] under the contract [BLUEPEAK-CONTRACT-1].",
            }
            finish_reason = "stop"
        response = {
            "id": f"mock-completion-{type(self).request_count}",
            "object": "chat.completion",
            "created": 1,
            "model": payload.get("model", "mock-model"),
            "choices": [{"index": 0, "message": message, "finish_reason": finish_reason}],
            "usage": {"prompt_tokens": 20, "completion_tokens": 20, "total_tokens": 40},
        }
        encoded = json.dumps(response).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, _format, *_args):
        pass


class AgentWorkflowMockIntegrationTests(unittest.TestCase):
    def test_langgraph_calls_both_real_tools_and_returns_validated_answer(self):
        MockChatHandler.request_count = 0
        server = ThreadingHTTPServer(("127.0.0.1", 0), MockChatHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        context = {
            "customer": {"id": "CUST-BLUEPEAK", "name": "Bluepeak Robotics"},
            "tickets": [{"id": "TKT-251", "summary": "Escalation"}],
            "bug_paths": [{"ticket_id": "TKT-251", "bug_id": "BUG-77", "owner_id": "PERS-RIYA"}],
            "sla_events": [{"id": "SLA-09", "case_id": "CASE-104", "ticket_id": "TKT-251", "contract_id": "BLUEPEAK-CONTRACT-1"}],
        }
        analysis = {"analysis": {"commitments": [{"id": "PROM-22", "source_id": "CALL-18"}]}}
        try:
            env = {
                "RADOXAI_API_KEY": "offline-test-key",
                "RADOXAI_BASE_URL": f"http://127.0.0.1:{server.server_port}/v1",
                "PROMISEGRAPH_MODEL": "mock-model",
                "LANGCHAIN_TRACING_V2": "false",
                "LANGSMITH_TRACING": "false",
            }
            with patch.dict(os.environ, env, clear=False):
                events = list(stream_case_agent(
                    "CUST-BLUEPEAK",
                    "Why did this escalate and what should we do?",
                    lambda _customer_id: context,
                    lambda _customer_id: analysis,
                ))
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

        names = [event["event"] for event in events]
        self.assertIn("tool_start", names)
        self.assertIn("tool_finish", names)
        answer = next(event["data"] for event in events if event["event"] == "answer")
        self.assertTrue(answer["grounded"], answer)
        self.assertEqual(set(answer["tools_used"]), {"get_customer_context", "get_commitment_analysis"})
        self.assertIn("BUG-77", answer["citations"])
        self.assertEqual(answer["unsupported_citations"], [])
        self.assertGreaterEqual(MockChatHandler.request_count, 2)


if __name__ == "__main__":
    unittest.main()
