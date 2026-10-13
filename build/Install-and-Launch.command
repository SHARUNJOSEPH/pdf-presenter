#!/bin/bash
# ==============================================================================
# PDF Presenter Suite — 1-Click macOS Automated Setup & Launcher
# ==============================================================================

clear
echo "=========================================================="
echo "  🎬 PDF Presenter Suite — Automated macOS Setup"
echo "=========================================================="
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="PDF Presenter Suite.app"
APP_SRC="$SCRIPT_DIR/$APP_NAME"
APP_DEST="/Applications/$APP_NAME"

echo "1. Locating PDF Presenter Suite..."
if [ -d "$APP_SRC" ]; then
    echo "   --> Found $APP_NAME in installer image."
    echo "2. Installing to /Applications..."
    rm -rf "$APP_DEST" 2>/dev/null
    cp -R "$APP_SRC" "/Applications/"
    echo "   ✅ Successfully installed to /Applications"
else
    echo "   ℹ️ Application already in /Applications or run from outside DMG."
fi

if [ -d "$APP_DEST" ]; then
    echo ""
    echo "3. Removing macOS Gatekeeper quarantine flag..."
    xattr -cr "$APP_DEST" 2>/dev/null
    echo "   ✅ Gatekeeper quarantine cleared!"

    echo ""
    echo "4. Launching PDF Presenter Suite..."
    open "$APP_DEST"
    echo "   ✅ Launched successfully!"
    echo ""
    echo "=========================================================="
    echo "  Setup complete! You can now close this Terminal window."
    echo "=========================================================="
else
    echo "❌ Error: Could not locate $APP_NAME."
    echo "Please drag the app manually into the Applications folder."
fi

exit 0
