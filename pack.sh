#!/bin/sh
# Build the installable zip in dist/: runtime files only, no tests or tools.
set -e
cd "$(dirname "$0")"
mkdir -p dist
gnome-extensions pack --force --out-dir=dist \
    --extra-source=ticker.js \
    --extra-source=layout.js \
    --extra-source=labels.js \
    --extra-source=LICENSE \
    .
echo "dist/workspace-ticker@idogr.shell-extension.zip"
