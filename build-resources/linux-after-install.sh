#!/bin/bash
set +e

LOG_FILE="/var/log/clearvoice-studio-install.log"
APP_DIR="/opt/${sanitizedProductName}"
DESKTOP_FILE="/usr/share/applications/${executable}.desktop"

cv_log() {
  echo "[ClearVoice Studio] $1"
  {
    printf '%s %s\n' "$(date -Is 2>/dev/null || date)" "$1"
  } >> "$LOG_FILE" 2>/dev/null || true
}

if type update-alternatives >/dev/null 2>&1; then
    if [ -L '/usr/bin/${executable}' -a -e '/usr/bin/${executable}' -a "`readlink '/usr/bin/${executable}'`" != '/etc/alternatives/${executable}' ]; then
        rm -f '/usr/bin/${executable}'
    fi
    update-alternatives --install '/usr/bin/${executable}' '${executable}' '/opt/${sanitizedProductName}/${executable}' 100 || ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
else
    ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
fi

if ! { [[ -L /proc/self/ns/user ]] && unshare --user true; }; then
    chmod 4755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
else
    chmod 0755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
fi

if [ -f "$DESKTOP_FILE" ]; then
    chmod 0644 "$DESKTOP_FILE" || true
fi

rm -f \
  "/usr/share/applications/piper-tts-studio.desktop" \
  "/usr/share/applications/ClearVoice Studio.desktop" \
  "/usr/share/applications/ClearVoiceStudio.desktop" \
  "/usr/share/applications/clearvoicestudio.desktop" \
  2>/dev/null || true

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi

if hash gtk-update-icon-cache 2>/dev/null && [ -d /usr/share/icons/hicolor ]; then
    gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
fi

if apparmor_status --enabled > /dev/null 2>&1; then
  APPARMOR_PROFILE_SOURCE='/opt/${sanitizedProductName}/resources/apparmor-profile'
  APPARMOR_PROFILE_TARGET='/etc/apparmor.d/${executable}'
  if apparmor_parser --skip-kernel-load --debug "$APPARMOR_PROFILE_SOURCE" > /dev/null 2>&1; then
    cp -f "$APPARMOR_PROFILE_SOURCE" "$APPARMOR_PROFILE_TARGET"

    if ! { [ -x '/usr/bin/ischroot' ] && /usr/bin/ischroot; } && hash apparmor_parser 2>/dev/null; then
      apparmor_parser --replace --write-cache --skip-read-cache "$APPARMOR_PROFILE_TARGET"
    fi
  else
    echo "Skipping the installation of the AppArmor profile as this version of AppArmor does not seem to support the bundled profile"
  fi
fi

# Clean up any lingering legacy .venv or cache from older versions
LEGACY_VENV="/opt/${sanitizedProductName}/resources/piper-tts/.venv"
if [ -d "$LEGACY_VENV" ]; then
    rm -rf "$LEGACY_VENV" 2>/dev/null || true
fi

cv_log "Package installed. ClearVoice neural engine ready."

exit 0
