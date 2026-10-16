import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend import main


class CustomerSourceDetailTests(unittest.TestCase):
    def setUp(self):
        self.context = {
            "customer": {"id": "CUST-BLUEPEAK", "name": "Bluepeak Robotics", "segment": "Enterprise"},
            "tickets": [{"id": "TKT-251", "summary": "Escalation", "status": "open", "created_at": "2026-10-15"}],
            "bug_paths": [{"ticket_id": "TKT-251", "bug_id": "BUG-77", "owner_id": "PERS-RIYA"}],
            "promises": [{"id": "PROM-22", "source_id": "CALL-18", "depends_on_bug_id": "BUG-77"}],
            "sla_events": [{"id": "SLA-09", "case_id": "CASE-104", "ticket_id": "TKT-251", "contract_id": "BLUEPEAK-CONTRACT-1"}],
        }

    def test_returns_record_excerpt_and_allowed_provenance(self):
        source_row = [["Document"], "CALL-18", None, "Bluepeak escalation call", None, None,
                      "Kavya committed to a custom-field export fix by 14 Oct.", None,
                      "call_note", None, "call://CALL-18", "2026-10-08T11:45:00+05:30",
                      None, None, None, None, None, None, None, None, None, None]
        def fake_rows(query, params):
            if "RETURN n.id, type(r), m.id" in query:
                return []
            if "RETURN m.id, type(r), n.id" in query:
                return [["PROM-22", "RECORDED_IN", "CALL-18"]]
            return [source_row]

        with patch.object(main, "customer_context", return_value=self.context), \
             patch.object(main, "analyze_promises", return_value={"commitments": []}), \
             patch.object(main, "rows", side_effect=fake_rows):
            with TestClient(main.app) as client:
                response = client.get("/api/customers/CUST-BLUEPEAK/sources/CALL-18")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["source"]["label"], "Document")
        self.assertIn("14 Oct", payload["source"]["excerpt"])
        self.assertEqual(payload["relationships"][0]["type"], "RECORDED_IN")
        self.assertEqual(payload["relationships"][0]["from_id"], "PROM-22")

    def test_rejects_source_ids_outside_customer_allowlist(self):
        with patch.object(main, "customer_context", return_value=self.context), \
             patch.object(main, "analyze_promises", return_value={"commitments": []}), \
             patch.object(main, "rows") as query:
            with TestClient(main.app) as client:
                response = client.get("/api/customers/CUST-BLUEPEAK/sources/TKT-999")
        self.assertEqual(response.status_code, 404)
        query.assert_not_called()

    def test_rejects_cypher_like_identifier_as_unlisted(self):
        with patch.object(main, "customer_context", return_value=self.context), \
             patch.object(main, "analyze_promises", return_value={"commitments": []}), \
             patch.object(main, "rows") as query:
            with TestClient(main.app) as client:
                response = client.get("/api/customers/CUST-BLUEPEAK/sources/NOPE%27%20MATCH%20(n)")
        self.assertEqual(response.status_code, 404)
        query.assert_not_called()


if __name__ == "__main__":
    unittest.main()
