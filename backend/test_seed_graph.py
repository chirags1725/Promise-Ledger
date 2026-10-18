import json
import unittest
from pathlib import Path

from scripts.seed_graph import DEFAULT_SEED, load_seed, validate_seed


class SeedGraphValidationTests(unittest.TestCase):
    def test_checked_in_seed_is_valid_and_complete(self):
        data = load_seed(DEFAULT_SEED)
        self.assertGreater(len(data["nodes"]), 10)
        self.assertGreater(len(data["edges"]), 20)

    def test_rejects_unknown_edge_endpoints(self):
        with self.assertRaisesRegex(ValueError, "unknown node"):
            validate_seed({
                "graph_name": "demo",
                "nodes": [{"label": "Customer", "id": "C1"}],
                "edges": [{"from": "C1", "type": "HAS_CASE", "to": "MISSING"}],
            })

    def test_rejects_unsafe_relationship_identifier(self):
        with self.assertRaisesRegex(ValueError, "Unsafe"):
            validate_seed({
                "graph_name": "demo",
                "nodes": [{"label": "Customer", "id": "C1"}],
                "edges": [{"from": "C1", "type": "X` MATCH (n) DELETE n //", "to": "C1"}],
            })

    def test_rejects_duplicate_node_ids(self):
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            validate_seed({
                "graph_name": "demo",
                "nodes": [{"label": "Customer", "id": "C1"}, {"label": "Ticket", "id": "C1"}],
                "edges": [],
            })


class FakeGraph:
    def __init__(self):
        self.calls = []

    def query(self, query, params=None):
        self.calls.append((query, params or {}))
        return object()


class SeedGraphExecutionTests(unittest.TestCase):
    def test_seed_uses_merge_and_parameterized_properties_without_deleting(self):
        from scripts.seed_graph import seed_graph
        data = load_seed(DEFAULT_SEED)
        graph = FakeGraph()
        node_count, edge_count = seed_graph(graph, data)
        self.assertEqual(node_count, len(data["nodes"]))
        self.assertEqual(edge_count, len(data["edges"]))
        self.assertEqual(len(graph.calls), node_count + edge_count)
        self.assertTrue(all("MERGE" in query for query, _ in graph.calls))
        self.assertTrue(all("DELETE" not in query.upper() for query, _ in graph.calls))
        self.assertTrue(all(params for _, params in graph.calls))


if __name__ == "__main__":
    unittest.main()
