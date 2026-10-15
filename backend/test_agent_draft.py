import unittest

from backend.agent_workflow import _parse_reply_draft


class DraftSafetyTests(unittest.TestCase):
    def test_clean_grounded_draft_passes_checks_but_is_never_sendable(self):
        result = _parse_reply_draft({
            "answer": (
                "CUSTOMER DRAFT:\nHello Bluepeak team,\n\n"
                "I’m sorry we missed our commitments and did not keep you updated. "
                "We are checking the current export issue with engineering and will share verified information.\n\n"
                "INTERNAL EVIDENCE:\n[BUG-77] [PROM-22] [TKT-251]\n"
                "INTERNAL NOTE:\nNo confirmed fix ETA is recorded."
            ),
            "grounded": True,
            "citations": ["BUG-77", "PROM-22", "TKT-251"],
            "tools_used": ["get_customer_context", "get_commitment_analysis"],
        })
        self.assertTrue(result["checks_passed"])
        self.assertFalse(result["send_enabled"])
        self.assertNotIn("BUG-77", result["draft"])
        self.assertIn("No confirmed fix ETA", result["internal_note"])

    def test_date_or_internal_ids_in_customer_text_fail_checks(self):
        result = _parse_reply_draft({
            "answer": (
                "CUSTOMER DRAFT:\nWe will deliver the fix by 20 October 2026. See BUG-77.\n"
                "INTERNAL EVIDENCE:\n[BUG-77] [PROM-22]\n"
                "INTERNAL NOTE:\nETA is unconfirmed."
            ),
            "grounded": True,
            "citations": ["BUG-77", "PROM-22"],
            "tools_used": ["get_customer_context", "get_commitment_analysis"],
        })
        self.assertFalse(result["checks_passed"])
        self.assertTrue(any("date" in warning.lower() for warning in result["warnings"]))
        self.assertTrue(any("record IDs" in warning for warning in result["warnings"]))

    def test_unverified_or_unstructured_response_does_not_pass(self):
        result = _parse_reply_draft({
            "answer": "Here is a possible customer response.",
            "grounded": False,
            "citations": [],
            "tools_used": [],
        })
        self.assertFalse(result["checks_passed"])
        self.assertFalse(result["send_enabled"])
        self.assertGreaterEqual(len(result["warnings"]), 3)


if __name__ == "__main__":
    unittest.main()
