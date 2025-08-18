#!/usr/bin/env bash
set -euo pipefail

# Usage: ./start-all.sh [PORT]
PORT="${1:-3000}"

# Resolve repo root relative to this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TOOLS_DIR="${REPO_ROOT}/pxt-zoombit/tools"
SERVER_JS="${TOOLS_DIR}/dist/server.js"
DESKTOP_DIR="${REPO_ROOT}/zoombit-desktop"
MCP_DIR="${REPO_ROOT}/mcp-codes-server"
PID_TOOLS="${REPO_ROOT}/.pid.tools-server"
PID_MCP="${REPO_ROOT}/.pid.mcp-server"

echo "[start-all] Installing tools Node dependencies..."
(
  cd "${TOOLS_DIR}"
  if [ -f package-lock.json ]; then npm ci; else npm install; fi
)

# 1) Compile tools server (TypeScript)
echo "[start-all] Compiling tools server..."
(
  cd "${TOOLS_DIR}"
  npx -y tsc -p .
)

if [[ ! -f "${SERVER_JS}" ]]; then
  echo "[start-all] ERROR: Server output not found: ${SERVER_JS}" >&2
  exit 1
fi

# 2) Start the tools server
export PORT
echo "[start-all] Starting tools server on port ${PORT}..."
node "${SERVER_JS}" &
SERVER_PID=$!
echo "${SERVER_PID}" > "${PID_TOOLS}" || true

echo "[start-all] Tools server PID=${SERVER_PID}"

cleanup() {
  echo "[start-all] Cleaning up..."
  if kill -0 "${SERVER_PID}" 2>/dev/null; then
    echo "[start-all] Stopping tools server (PID=${SERVER_PID})"
    kill "${SERVER_PID}" 2>/dev/null || true
    # give it a moment, then force if needed
    sleep 1
    kill -9 "${SERVER_PID}" 2>/dev/null || true
  fi
  if [ -n "${MCP_PID:-}" ] && kill -0 "${MCP_PID}" 2>/dev/null; then
    echo "[start-all] Stopping MCP server (PID=${MCP_PID})"
    kill "${MCP_PID}" 2>/dev/null || true
    sleep 1
    kill -9 "${MCP_PID}" 2>/dev/null || true
  fi
  rm -f "${PID_TOOLS}" "${PID_MCP}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# 2b) Start MCP server in background
echo "[start-all] Preparing MCP codes server environment..."
export CODES_MD_PATH="${REPO_ROOT}/codes.md"
PY_EXE="${PYTHON_EXE:-}"
if [ -z "$PY_EXE" ]; then
  if command -v python >/dev/null 2>&1; then PY_EXE=python; elif command -v py >/dev/null 2>&1; then PY_EXE=py; fi
fi
VENV_DIR="${MCP_DIR}/.venv"
VENV_PY="${VENV_DIR}/bin/python"
if [ -n "$PY_EXE" ] && [ ! -x "$VENV_PY" ]; then
  echo "[start-all] Creating venv at ${VENV_DIR}..."
  "$PY_EXE" -m venv "$VENV_DIR"
fi
if [ -x "$VENV_PY" ] && [ -f "${MCP_DIR}/requirements.txt" ]; then
  echo "[start-all] Installing MCP requirements..."
  "$VENV_PY" -m pip install -r "${MCP_DIR}/requirements.txt"
fi
echo "[start-all] Starting MCP codes server..."
if [ -n "$PY_EXE" ]; then
  (
    cd "${MCP_DIR}"
    PY_TO_USE="$VENV_PY"; if [ ! -x "$PY_TO_USE" ]; then PY_TO_USE="$PY_EXE"; fi
    "$PY_TO_USE" -m mcp_codes_server.server &
    MCP_PID=$!
    echo "${MCP_PID}" > "${PID_MCP}" || true
    echo "[start-all] MCP server PID=${MCP_PID}"
  )
else
  echo "[start-all] WARNING: Python not found. Set PYTHON_EXE to start MCP server." >&2
fi

# 3) Build and launch desktop app (Electron)
echo "[start-all] Building desktop app..."
(
  cd "${DESKTOP_DIR}"
  npm run build:app
  echo "[start-all] Launching Electron..."
  npm run electron
)

