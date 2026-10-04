#!/bin/bash
# Stop only what start.sh started, then check the real session was not touched.
RUN_DIR="$(cd "$(dirname "$0")" && pwd)/runs/current"
[ -f "$RUN_DIR/window.pid" ] && kill "$(cat "$RUN_DIR/window.pid")" 2>/dev/null
[ -f "$RUN_DIR/driver.pid" ] && { echo quit >> "$RUN_DIR/cmds"; sleep 0.5; kill "$(cat "$RUN_DIR/driver.pid")" 2>/dev/null; }
[ -f "$RUN_DIR/shell.pid" ] && kill -- -"$(cat "$RUN_DIR/shell.pid")" 2>/dev/null
rm -f "$RUN_DIR/shell.pid" "$RUN_DIR/driver.pid" "$RUN_DIR/window.pid"

gsettings get org.gnome.shell enabled-extensions > "$RUN_DIR/real-enabled.after"
if ! cmp -s "$RUN_DIR/real-enabled.before" "$RUN_DIR/real-enabled.after" ||
   grep -q workspace-ticker "$RUN_DIR/real-enabled.after" ||
   [ -e "$HOME/.local/share/gnome-shell/extensions/workspace-ticker@idogr" ]; then
    echo "REAL SESSION TOUCHED — investigate before continuing" >&2
    exit 1
fi
echo "stopped; real session untouched"
