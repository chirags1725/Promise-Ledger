#!/usr/bin/env python3
"""Idempotently load PromiseGraph's synthetic seed data into FalkorDB."""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from falkordb import FalkorDB

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SEED = ROOT / "data" / "bluepeak_seed.json"
SAFE_IDENTIFIER = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")


def load_seed(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"Could not read seed JSON at {path}: {exc}") from exc
    validate_seed(data)
    return data


def validate_seed(data: Any) -> None:
    if not isinstance(data, dict):
        raise ValueError("Seed root must be a JSON object.")
    nodes, edges = data.get("nodes"), data.get("edges")
    if not isinstance(nodes, list) or not isinstance(edges, list):
        raise ValueError("Seed must contain 'nodes' and 'edges' arrays.")
    ids: set[str] = set()
    for index, node in enumerate(nodes):
        if not isinstance(node, dict):
            raise ValueError(f"Node at index {index} must be an object.")
        label, node_id = node.get("label"), node.get("id")
        if not isinstance(label, str) or not SAFE_IDENTIFIER.fullmatch(label):
            raise ValueError(f"Unsafe or missing node label at index {index}: {label!r}")
        if not isinstance(node_id, str) or not node_id.strip():
            raise ValueError(f"Missing node id at index {index}.")
        if node_id in ids:
            raise ValueError(f"Duplicate node id: {node_id}")
        ids.add(node_id)
    for index, edge in enumerate(edges):
        if not isinstance(edge, dict):
            raise ValueError(f"Edge at index {index} must be an object.")
        rel_type = edge.get("type")
        if not isinstance(rel_type, str) or not SAFE_IDENTIFIER.fullmatch(rel_type):
            raise ValueError(f"Unsafe or missing relationship type at index {index}: {rel_type!r}")
        if edge.get("from") not in ids or edge.get("to") not in ids:
            raise ValueError(f"Edge at index {index} refers to an unknown node: {edge!r}")
    graph_name = data.get("graph_name")
    if not isinstance(graph_name, str) or not graph_name.strip():
        raise ValueError("Seed must include a non-empty graph_name.")


def seed_graph(graph: Any, data: dict[str, Any]) -> tuple[int, int]:
    """MERGE nodes/edges and refresh supplied properties; never deletes data."""
    for node in data["nodes"]:
        label = node["label"]  # Safe: validated against SAFE_IDENTIFIER.
        properties = {key: value for key, value in node.items() if key != "label"}
        graph.query(
            f"MERGE (n:`{label}` {{id: $id}}) SET n += $properties",
            {"id": node["id"], "properties": properties},
        )
    for edge in data["edges"]:
        rel_type = edge["type"]  # Safe: validated against SAFE_IDENTIFIER.
        graph.query(
            f"MATCH (a {{id: $from_id}}), (b {{id: $to_id}}) "
            f"MERGE (a)-[:`{rel_type}`]->(b)",
            {"from_id": edge["from"], "to_id": edge["to"]},
        )
    return len(data["nodes"]), len(data["edges"])


def main() -> int:
    load_dotenv(ROOT / ".env")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=Path, default=Path(os.getenv("PROMISEGRAPH_SEED_PATH", DEFAULT_SEED)))
    parser.add_argument("--dry-run", action="store_true", help="Validate and report counts without connecting to FalkorDB.")
    args = parser.parse_args()
    try:
        data = load_seed(args.seed)
        if args.dry_run:
            print(f"Valid seed: graph={data['graph_name']}, nodes={len(data['nodes'])}, edges={len(data['edges'])}")
            return 0
        host = os.getenv("FALKORDB_HOST", "localhost")
        port = int(os.getenv("FALKORDB_PORT", "6379"))
        graph_name = os.getenv("FALKORDB_GRAPH", data["graph_name"])
        if graph_name != data["graph_name"]:
            print(f"Warning: .env graph {graph_name!r} differs from seed graph {data['graph_name']!r}; loading into .env graph.", file=sys.stderr)
        graph = FalkorDB(host=host, port=port).select_graph(graph_name)
        node_count, edge_count = seed_graph(graph, data)
        print(f"Loaded idempotently into {graph_name!r} at {host}:{port}: {node_count} nodes, {edge_count} relationships.")
        print("No existing graph records were deleted. Review the synthetic data before using this database for any other purpose.")
        return 0
    except Exception as exc:
        print(f"Seed failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
