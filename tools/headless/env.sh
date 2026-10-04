# Source this to act on the headless shell instead of the real session:
# private bus, private dconf, private extension directory.
HEADLESS_DIR="$(cd "$(dirname "${BASH_SOURCE:-$0}")" && pwd)"
RUN_DIR="$HEADLESS_DIR/runs/current"
export RUN_DIR
export XDG_CONFIG_HOME="$RUN_DIR/config"
export XDG_DATA_HOME="$RUN_DIR/data"
export XDG_CACHE_HOME="$RUN_DIR/cache"
export XDG_STATE_HOME="$RUN_DIR/state"
if [ -f "$RUN_DIR/bus" ]; then
    DBUS_SESSION_BUS_ADDRESS="$(cat "$RUN_DIR/bus")"
    export DBUS_SESSION_BUS_ADDRESS
fi
# The headless shell's own Wayland socket, recorded by start.sh, so apps
# started from here open inside it rather than on the real desktop.
if [ -f "$RUN_DIR/wayland" ]; then
    WAYLAND_DISPLAY="$(cat "$RUN_DIR/wayland")"
    export WAYLAND_DISPLAY
    unset DISPLAY
fi
