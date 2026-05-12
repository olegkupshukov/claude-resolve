#!/bin/bash
# Claude Resolve — macOS Installer
# Copies plugin + renderer into DaVinci Resolve's Workflow Integration Plugins directory.
# Requires sudo (system-level plugin directory).

DEST="/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/com.clauderesolve.plugin"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Installing Claude Resolve..."

sudo mkdir -p "$DEST"
sudo cp -R "$SCRIPT_DIR/plugin/"* "$DEST/"
sudo cp -R "$SCRIPT_DIR/renderer" "$DEST/renderer"

echo ""
echo "Done. Restart DaVinci Resolve to use the plugin."
echo "Open it from Workspace > Workflow Integration > Claude Resolve"
