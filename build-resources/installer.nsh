; build-resources/installer.nsh
; ClearVoice Studio — NSIS installer hooks
;
; Executable: "ClearVoice Studio.exe"
;
; Kokoro voice models are bundled with the app (default: af_heart).
; Additional voices can be downloaded in-app on demand.

!macro customHeader
  !define MUI_WELCOMEPAGE_TITLE        "Welcome to ClearVoice Studio Setup"
  !define MUI_WELCOMEPAGE_TEXT         "Setup will install ClearVoice Studio on your computer.$\r$\n$\r$\nThe default voice (af_heart) is bundled and works immediately offline. Additional voices can be downloaded from within the app.$\r$\n$\r$\nClick Next to continue."
  !define MUI_FINISHPAGE_TITLE         "Installation Complete"
  !define MUI_FINISHPAGE_TEXT          "ClearVoice Studio has been installed.$\r$\n$\r$\nThe app launches immediately with the bundled Kokoro voice. Download additional voices from the Voices panel.$\r$\n$\r$\nClick Finish to close Setup."
  !define MUI_FINISHPAGE_RUN_TEXT      "Launch ClearVoice Studio"
!macroend

!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customUnWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Uninstall ClearVoice Studio"
  !define MUI_WELCOMEPAGE_TEXT  "This wizard will remove ClearVoice Studio from your computer.$\r$\n$\r$\nClick Next to proceed."
  !insertmacro MUI_UNPAGE_WELCOME
!macroend

!macro customInit
  ; Kill any running instances before installation begins
  nsExec::Exec 'taskkill /F /IM "ClearVoice Studio.exe" /T'
  nsExec::Exec 'taskkill /F /IM "clearvoice-studio.exe" /T'
  nsExec::Exec 'taskkill /F /IM "node.exe" /T'
  Sleep 800
!macroend

!macro customCheckAppRunning
  nsExec::Exec 'taskkill /F /IM "ClearVoice Studio.exe" /T'
  nsExec::Exec 'taskkill /F /IM "clearvoice-studio.exe" /T'
  Sleep 600
!macroend

!macro customInstall
  SetDetailsView show

  DetailPrint "Stopping any running ClearVoice Studio processes..."
  nsExec::Exec 'taskkill /F /IM "ClearVoice Studio.exe" /T'
  nsExec::Exec 'taskkill /F /IM "clearvoice-studio.exe" /T'
  nsExec::Exec 'taskkill /F /IM "node.exe" /T'
  Sleep 600
  DetailPrint "Processes stopped."
  DetailPrint " "

  DetailPrint "Installing ClearVoice Studio application files..."
  DetailPrint "  This may take a moment for the first install."
  DetailPrint " "

  ; Ensure the install directory exists and is writable before copying files
  ; This prevents ERROR_SHARING_VIOLATION on upgrade installs
  CreateDirectory "$INSTDIR"
  CreateDirectory "$INSTDIR\resources"

  ; Remove stale lock files that can block overwrite
  Delete "$INSTDIR\*.tmp"
  Delete "$INSTDIR\resources\*.tmp"

  DetailPrint "Registering application..."
  DetailPrint " "
  DetailPrint "Installation complete."
  DetailPrint "  The bundled Kokoro voice (af_heart) is ready immediately."
!macroend

!macro customUnInit
  nsExec::Exec 'taskkill /F /IM "ClearVoice Studio.exe" /T'
  nsExec::Exec 'taskkill /F /IM "clearvoice-studio.exe" /T'
  Sleep 800
!macroend

!macro customUnInstall
  SetDetailsView show

  DetailPrint "Uninstalling ClearVoice Studio..."
  DetailPrint "Stopping application processes..."
  nsExec::Exec 'taskkill /F /IM "ClearVoice Studio.exe" /T'
  nsExec::Exec 'taskkill /F /IM "clearvoice-studio.exe" /T'
  Sleep 600
  DetailPrint "Removing application files..."
  DetailPrint "Uninstall complete."
  DetailPrint "Note: Downloaded voice models and user data in your profile are not removed."
!macroend
