import unittest
from datetime import datetime

from backend.commitment_analysis import analyze_promises


class CommitmentAnalysisTests(unittest.TestCase):
    def setUp(self):
        self.as_of = datetime.fromisoformat("2026-10-16T03:00:00+05:30")
        self.promises = [
            {
                "id": "PROM-22", "text": "Deliver export fix", "due_at": "2026-10-14T18:00:00+05:30",
                "status": "overdue_unfulfilled", "confidence": 1.0,
                "follow_up_status": "not_created", "made_by": "Kavya Iyer", "source_id": "CALL-18",
            },
            {
                "id": "PROM-31", "text": "Provide engineering status", "due_at": "2026-10-15T12:00:00+05:30",
                "status": "overdue_unfulfilled", "confidence": 1.0,
                "follow_up_status": "not_completed", "made_by": "Arjun Mehta", "source_id": "TKT-228",
            },
        ]

    def test_two_missed_promises_ranked_with_explanations(self):
        result = analyze_promises(self.promises, case_priority="critical", as_of=self.as_of)
        self.assertEqual(result["overdue_commitment_count"], 2)
        self.assertEqual(result["unclosed_follow_up_count"], 2)
        self.assertEqual(result["commitments"][0]["id"], "PROM-22")
        self.assertEqual(result["commitments"][0]["status"], "overdue")
        self.assertEqual(result["commitments"][0]["score"]["impact_weight"], 3.0)
        self.assertGreater(result["commitments"][0]["score"]["value"], 0)
        self.assertEqual(result["score_formula"], "impact × overdue_days_weight × repetition × confidence")

    def test_missing_due_date_is_unclear_not_overdue(self):
        result = analyze_promises([{"id": "PROM-X", "due_at": None}], as_of=self.as_of)
        self.assertEqual(result["overdue_commitment_count"], 0)
        self.assertEqual(result["commitments"][0]["status"], "date_unclear")
        self.assertEqual(result["commitments"][0]["score"]["value"], 0)

    def test_fulfilled_commitment_has_no_debt_score(self):
        result = analyze_promises([
            {"id": "PROM-DONE", "due_at": "2026-10-14T18:00:00+05:30", "status": "fulfilled"}
        ], case_priority="critical", as_of=self.as_of)
        self.assertEqual(result["commitments"][0]["status"], "closed")
        self.assertEqual(result["commitments"][0]["score"]["value"], 0)


if __name__ == "__main__":
    unittest.main()
