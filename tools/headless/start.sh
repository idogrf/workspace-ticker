#!/bin/bash
# Start an isolated headless GNOME Shell with this extension and the driver.
# Usage: tools/headless/start.sh   (TICKER_DYNAMIC=true for dynamic workspaces)
set -e
HEADLESS_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HEADLESS_DIR/../.." && pwd)"
RUN_DIR="$HEADLESS_DIR/runs/current"

if [ -e "$RUN_DIR/shell.pid" ]; then
    echo "a run is already active — tools/headless/stop.sh first" >&2
    exit 1
fi
rm -rf "$RUN_DIR"
mkdir -p "$RUN_DIR"/{config,data/gnome-shell/extensions,cache,state}

glib-compile-schemas "$REPO/schemas"
ls "$XDG_RUNTIME_DIR" | grep -E '^wayland-[0-9]+$' | sort > "$RUN_DIR/wayland.before" || true
ln -s "$REPO" "$RUN_DIR/data/gnome-shell/extensions/workspace-ticker@idogr"

# Real-session guard: record the real extension list now, compare in stop.sh.
gsettings get org.gnome.shell enabled-extensions > "$RUN_DIR/real-enabled.before"

(
    . "$HEADLESS_DIR/env.sh"
    unset DBUS_SESSION_BUS_ADDRESS
    setsid dbus-run-session -- bash "$HEADLESS_DIR/inner.sh" > "$RUN_DIR/shell.log" 2>&1 &
    echo $! > "$RUN_DIR/shell.pid"
)

for _ in $(seq 100); do [ -s "$RUN_DIR/bus" ] && break; sleep 0.2; done
[ -s "$RUN_DIR/bus" ] || { echo "shell did not start; see $RUN_DIR/shell.log" >&2; exit 1; }
# Give the shell time to bring up DisplayConfig/RemoteDesktop before the driver connects.
sleep 4

# The socket that appeared since launch is the headless shell's.
ls "$XDG_RUNTIME_DIR" | grep -E '^wayland-[0-9]+$' | sort | comm -13 "$RUN_DIR/wayland.before" - | head -1 > "$RUN_DIR/wayland"
[ -s "$RUN_DIR/wayland" ] || { echo "could not find the headless shell's wayland socket" >&2; exit 1; }

RUN_DIR="$RUN_DIR" setsid /usr/bin/python3 "$HEADLESS_DIR/driver.py" > "$RUN_DIR/driver.out" 2>&1 &
echo $! > "$RUN_DIR/driver.pid"

for _ in $(seq 100); do grep -q ' ready$' "$RUN_DIR/driver.log" 2>/dev/null && break; sleep 0.2; done
grep -q ' ready$' "$RUN_DIR/driver.log" || { echo "driver not ready; see $RUN_DIR/driver.{log,out}" >&2; exit 1; }
echo "headless shell ready: $RUN_DIR"
