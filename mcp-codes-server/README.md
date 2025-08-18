# mcp-codes-server

A minimal Model Context Protocol (MCP) server in Python that reads `codes.md` from the repository root and exposes simple tools to query it.

## Features

- get_all: return the entire `codes.md`
- list_sections: list markdown headings (levels `#` and `##`)
- get_section(title): return a specific section by title
- search(query, context_lines): search text with line context

## Requirements

- Python 3.9+
- pip

Install dependencies:

```powershell
# from repo root
cd mcp-codes-server
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Run (as an MCP server over stdio)

Most MCP-compatible clients (e.g. Claude Desktop) can launch the server via a command. Example client config:

```json
{
  "mcpServers": {
    "codes-md": {
      "command": "python",
      "args": ["-m", "mcp_codes_server.server"],
      "env": {
        "CODES_MD_PATH": "..\\codes.md"
      }
    }
  }
}
```

Notes

- By default, the server attempts to locate `codes.md` in the repo root. You can override with the `CODES_MD_PATH` environment variable.
- Tools are named `get_all`, `list_sections`, `get_section`, and `search`.

## Local quick test (optional)

You can also run the module directly to verify it imports and starts the stdio server:

```powershell
python -m mcp_codes_server.server
```

Then connect using any MCP client that speaks stdio.

## Project layout

- `requirements.txt` – Python dependencies
- `src/mcp_codes_server/server.py` – MCP server exposing tools that read `codes.md`
