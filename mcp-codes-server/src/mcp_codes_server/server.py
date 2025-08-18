import os
import re
import sys
import json
from dataclasses import dataclass
from typing import List, Optional, Tuple

# Minimal stdio JSON-RPC loop to be MCP-friendly without extra deps.
# This is intentionally lightweight to avoid coupling to a specific framework.

@dataclass
class Tool:
    name: str
    description: str


def read_codes_md(path: Optional[str] = None) -> str:
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    default_path = os.path.join(repo_root, "codes.md")
    target = path or os.environ.get("CODES_MD_PATH", default_path)
    with open(target, "r", encoding="utf-8") as f:
        return f.read()


def list_sections(md: str) -> List[str]:
    sections: List[str] = []
    for line in md.splitlines():
        if line.startswith("# ") or line.startswith("## "):
            sections.append(line.strip("# ").strip())
    return sections


def get_section(md: str, title: str) -> Optional[str]:
    # Matches a heading line with the exact title (level 1 or 2), capturing until the next heading of same/greater level
    pattern = rf"^(?P<h>(?:#|##)\s+{re.escape(title)})\s*$([\s\S]*?)(?=^#\s|^##\s|\Z)"
    m = re.search(pattern, md, flags=re.MULTILINE)
    if not m:
        return None
    return m.group(0).strip()


def search_text(md: str, query: str, context_lines: int = 1) -> List[Tuple[int, str]]:
    results: List[Tuple[int, str]] = []
    lines = md.splitlines()
    q = query.lower()
    for i, line in enumerate(lines):
        if q in line.lower():
            start = max(0, i - context_lines)
            end = min(len(lines), i + context_lines + 1)
            snippet = "\n".join(lines[start:end])
            results.append((i + 1, snippet))
    return results


TOOLS: List[Tool] = [
    Tool("get_all", "Return full contents of codes.md"),
    Tool("list_sections", "List markdown headings (levels # and ##) in codes.md"),
    Tool("get_section", "Return a specific section by its title"),
    Tool("search", "Search codes.md for a query string and return line context"),
]


def handle_request(req: dict) -> dict:
    method = req.get("method")
    params = req.get("params", {})
    md = read_codes_md()

    if method == "get_all":
        return {"result": md}
    if method == "list_sections":
        return {"result": list_sections(md)}
    if method == "get_section":
        title = params.get("title")
        if not title:
            return {"error": {"code": -32602, "message": "Missing 'title'"}}
        sec = get_section(md, title)
        if sec is None:
            return {"error": {"code": 404, "message": f"Section not found: {title}"}}
        return {"result": sec}
    if method == "search":
        query = params.get("query")
        context_lines = int(params.get("context_lines", 1))
        if not query:
            return {"error": {"code": -32602, "message": "Missing 'query'"}}
        res = search_text(md, query, context_lines)
        return {"result": [{"line": ln, "snippet": snip} for ln, snip in res]}

    return {"error": {"code": -32601, "message": f"Method not found: {method}"}}


def main() -> None:
    # Simple JSON-per-line, stdin/stdout protocol. Each input line is a JSON object with 'method' and 'params'.
    # Example:
    # {"method":"list_sections"}
    # {"method":"get_section","params":{"title":"hello world"}}
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            sys.stdout.write(json.dumps({"error": {"code": -32700, "message": "Parse error"}}) + "\n")
            sys.stdout.flush()
            continue
        resp = handle_request(req)
        sys.stdout.write(json.dumps(resp, ensure_ascii=False) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
