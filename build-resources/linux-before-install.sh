#!/bin/bash
set +e

# Pre-installation cleanup for upgrades:
# Remove any runtime-generated files (.pyc, cache, venv) from previous versions
# before dpkg unpacks the new version, to avoid "Directory not empty" errors.
# NOTE: ${sanitizedProductName} is NOT interpolated here — use the hardcoded path.

APP_DIR="/opt/ClearVoice Studio"
LEGACY_VENV="${APP_DIR}/resources/piper-tts/.venv"

if [ -d "$LEGACY_VENV" ]; then
    rm -rf "$LEGACY_VENV" 2>/dev/null || true
fi

# Clean up any obsolete __pycache__ folders in piper-tts
if [ -d "${APP_DIR}/resources/piper-tts" ]; then
    find "${APP_DIR}/resources/piper-tts" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
fi

exit 0
