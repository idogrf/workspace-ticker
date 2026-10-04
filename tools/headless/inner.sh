#!/bin/bash
# Runs inside dbus-run-session: record the private bus, seed the private dconf,
# then become the headless shell. Everything here sees only throwaway XDG dirs.
set -e
HEADLESS_ALLOW_NO_BUS=1 . "$(dirname "$0")/env.sh"
echo "$DBUS_SESSION_BUS_ADDRESS" > "$RUN_DIR/bus"

gsettings set org.gnome.shell disable-user-extensions false
if [ -n "$TICKER_WITH_DOCK" ]; then
    gsettings set org.gnome.shell enabled-extensions "['workspace-ticker@idogr', 'dash-to-dock-ido@idogr']"
    # Private dconf only; the dock's schemas dir is read, never written.
    DOCK_SCHEMAS="$HOME/.local/share/gnome-shell/extensions/dash-to-dock-ido@idogr/schemas"
    for kv in "dock-position 'BOTTOM'" "dock-fixed false" "autohide true" "intellihide true"; do
        eval "GSETTINGS_SCHEMA_DIR=\"$DOCK_SCHEMAS\" gsettings set org.gnome.shell.extensions.dash-to-dock $kv"
    done
else
    gsettings set org.gnome.shell enabled-extensions "['workspace-ticker@idogr']"
fi
# Suppress the first-run "Welcome to Fedora" tour dialog: it is modal and swallows Escape.
gsettings set org.gnome.shell welcome-dialog-last-shown-version '999'
gsettings set org.gnome.mutter dynamic-workspaces "${TICKER_DYNAMIC:-false}"
gsettings set org.gnome.desktop.wm.preferences num-workspaces 4
gsettings set org.gnome.desktop.wm.preferences workspace-names "['Main', 'Private', 'Gantry']"

exec gnome-shell --headless --wayland --virtual-monitor 1280x800
