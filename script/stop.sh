#!/usr/bin/env sh
# Stop a running service/process by PID file or process name.
# Usage:
#   ./script/stop.sh [-p PID_FILE] [-n NAME] [-f]
#
# Options:
#   -p PID_FILE : Path to PID file (default: ./.pid)
#   -n NAME     : Process name to stop if PID file is not present/valid
#   -f          : Force kill (SIGKILL) if graceful stop fails

set -eu

PID_FILE="./.pid"
NAME=""
FORCE=0

while getopts "p:n:f" opt; do
  case "$opt" in
    p) PID_FILE="$OPTARG" ;;
    n) NAME="$OPTARG" ;;
    f) FORCE=1 ;;
    *) echo "Usage: $0 [-p PID_FILE] [-n NAME] [-f]" >&2; exit 1 ;;
  esac
done

stop_by_pid() {
  pid="$1"
  if kill -0 "$pid" 2>/dev/null; then
    # Try graceful TERM first
    kill -TERM "$pid" 2>/dev/null || true
    sleep 2
    if kill -0 "$pid" 2>/dev/null; then
      if [ "$FORCE" -eq 1 ]; then
        echo "Process $pid still running. Forcing kill..."
        kill -KILL "$pid" 2>/dev/null || true
      else
        echo "Process $pid did not exit after SIGTERM. Re-run with -f to SIGKILL." >&2
        return 1
      fi
    fi
    echo "Stopped process with PID $pid"
  else
    echo "No running process with PID $pid"
  fi
}

stop_by_name() {
  name="$1"
  # shellcheck disable=SC2009
  pids=$(ps -eo pid,comm | awk -v n="$name" '$2==n {print $1}')
  if [ -z "$pids" ]; then
    # Try using pgrep as a fallback
    if command -v pgrep >/dev/null 2>&1; then
      pids=$(pgrep -x "$name" || true)
    fi
  fi
  if [ -z "$pids" ]; then
    echo "No processes found with name '$name'"
    return 0
  fi
  for pid in $pids; do
    if ! stop_by_pid "$pid"; then
      if [ "$FORCE" -eq 1 ]; then
        kill -KILL "$pid" 2>/dev/null || true
        echo "Force-stopped '$name' (PID $pid)"
      else
        echo "Failed to stop PID $pid" >&2
      fi
    else
      echo "Stopped '$name' (PID $pid)"
    fi
  done
}

PID=""
if [ -f "$PID_FILE" ]; then
  if pid=$(head -n1 "$PID_FILE" 2>/dev/null); then
    case "$pid" in
      ''|*[!0-9]*) PID="" ;;
      *) PID="$pid" ;;
    esac
  fi
fi

if [ -n "$PID" ]; then
  stop_by_pid "$PID"
  exit $?
fi

if [ -n "$NAME" ]; then
  stop_by_name "$NAME"
  exit $?
fi

echo "No PID file found or valid PID, and no -n NAME provided. Specify -p or -n." >&2
exit 1

