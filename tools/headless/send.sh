#!/bin/bash
# Queue driver commands and wait for each to be logged as done.
# Usage: tools/headless/send.sh 'key ff56 ffeb' 'shot /abs/a.png'
set -e
RUN_DIR="$(cd "$(dirname "$0")" && pwd)/runs/current"
for cmd in "$@"; do
    before=$(grep -c ' done ' "$RUN_DIR/driver.log" || true)
    echo "$cmd" >> "$RUN_DIR/cmds"
    for _ in $(seq 150); do
        now=$(grep -c ' done ' "$RUN_DIR/driver.log" || true)
        [ "$now" -gt "$before" ] && break
        sleep 0.02
    done
done
