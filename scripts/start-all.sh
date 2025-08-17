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
}
trap cleanup EXIT INT TERM

# 3) Build and launch desktop app (Electron)
echo "[start-all] Building desktop app..."
(
  cd "${DESKTOP_DIR}"
  npm run build:app
  echo "[start-all] Launching Electron..."
  npm run electron
)

