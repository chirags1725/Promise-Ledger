import json
import re
import sys
from pathlib import Path
from falkordb import FalkorDB


def cypher_value(value):
    if value is None or isinstance(value, (str, int, float, bool)):
        return json.dumps(value, ensure_ascii=False)
    raise ValueError(f"Unsupported property value: {value!r}")


def main(seed_path):
    data = json.loads(Path(seed_path).read_text(encoding="utf-8"))
    db = FalkorDB(host="localhost", port=6379)
    graph = db.select_graph(data.get("graph_name", "promisegraph_demo"))

    for node in data["nodes"]:
        label = node["label"]
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", label):
            raise ValueError(f"Invalid node label: {label}")

        node_id = cypher_value(node["id"])
        props = ", ".join(
            f"{key}: {cypher_value(value)}"
            for key, value in node.items()
            if key != "label"
        )
        graph.query(
            f"MERGE (n:{label} {{id: {node_id}}}) SET n += {{{props}}}"
        )

    for edge in data["edges"]:
        rel_type = edge["type"]
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", rel_type):
            raise ValueError(f"Invalid relationship type: {rel_type}")

        start_id = cypher_value(edge["from"])
        end_id = cypher_value(edge["to"])
        graph.query(
            f"MATCH (a {{id: {start_id}}}), (b {{id: {end_id}}}) "
            f"MERGE (a)-[:{rel_type}]->(b)"
        )

    result = graph.query("MATCH (n) RETURN count(n)")
    print(f"Loaded graph '{data.get('graph_name', 'promisegraph_demo')}'.")
    print(f"Node count: {result.result_set[0][0]}")


if __name__ == "__main__":
    seed_file = sys.argv[1] if len(sys.argv) > 1 else "data/bluepeak_seed.json"
    main(seed_file)
