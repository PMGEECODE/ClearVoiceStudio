"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  DownloadCloud,
  CheckCircle2,
  RefreshCw,
  Cpu,
  Radio,
  ExternalLink,
  X,
  AlertCircle,
  Clock,
} from "lucide-react";

interface AppStatusBarProps {
  engineStatus: "online" | "offline" | "loading";
  latencyMs?: number;
  activeVoice?: string;
}

interface UpdateStatusInfo {
  status:
    | "checking"
    | "available"
    | "available-pending"
    | "available-manual"
    | "up-to-date"
    | "downloading"
    | "downloaded"
    | "scheduled"
    | "dismissed"
    | "error"
    | "dev";
  version?: string;
  percent?: number;
  message?: string;
  releaseUrl?: string;
  downloadName?: string;
  autoInstallSupported?: boolean;
  installAt?: number;
}

type ElectronUpdaterAPI = {
  getVersion?: () => Promise<string>;
  checkForUpdates?: () => Promise<UpdateStatusInfo>;
  downloadUpdate?: () => void | Promise<unknown>;
  deferUpdateInstall?: (minutes?: number) => void | Promise<unknown>;
  installUpdateNow?: () => void;
  onUpdateStatus?: (callback: (data: UpdateStatusInfo) => void) => () => void;
};

function formatInstallCountdown(installAt?: number): string {
  if (!installAt) return "30 minutes";
  const remainingMs = Math.max(0, installAt - Date.now());
  const minutes = Math.ceil(remainingMs / 60000);
  if (minutes <= 1) return "about 1 minute";
  return `about ${minutes} minutes`;
}

export const AppStatusBar: React.FC<AppStatusBarProps> = ({
  engineStatus,
  latencyMs,
  activeVoice,
}) => {
  const [appVersion, setAppVersion] = useState<string>("v0.1.0");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatusInfo>({ status: "up-to-date" });
  const [isElectron, setIsElectron] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [updatePanelOpen, setUpdatePanelOpen] = useState<boolean>(false);

  const userCheckRef = useRef(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getUpdaterAPI = useCallback((): ElectronUpdaterAPI | undefined => {
    if (typeof window === "undefined") return undefined;
    return (window as unknown as { electronAPI?: ElectronUpdaterAPI }).electronAPI;
  }, []);

  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const scheduleDismiss = useCallback(
    (ms = 4500) => {
      clearDismissTimer();
      dismissTimerRef.current = setTimeout(() => {
        setUpdatePanelOpen(false);
      }, ms);
    },
    [clearDismissTimer]
  );

  const handleDownloadUpdate = useCallback(() => {
    getUpdaterAPI()?.downloadUpdate?.();
  }, [getUpdaterAPI]);

  const handleInstallUpdate = useCallback(() => {
    getUpdaterAPI()?.installUpdateNow?.();
  }, [getUpdaterAPI]);

  const handleDeferInstall = useCallback(() => {
    getUpdaterAPI()?.deferUpdateInstall?.(30);
    setUpdatePanelOpen(true);
  }, [getUpdaterAPI]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.electronAPI?.isElectron) return;

    setIsElectron(true);
    window.electronAPI.getVersion?.().then((v) => {
      if (v) setAppVersion(`v${v}`);
    });

    const updaterAPI = getUpdaterAPI();
    if (!updaterAPI?.onUpdateStatus) return;

    const unsub = updaterAPI.onUpdateStatus((data: UpdateStatusInfo) => {
      setUpdateStatus(data);
      setIsChecking(data.status === "checking");

      if (data.status === "checking" && userCheckRef.current) {
        setUpdatePanelOpen(true);
      }

      if (data.status === "up-to-date" && userCheckRef.current) {
        userCheckRef.current = false;
        scheduleDismiss();
      }

      if (
        data.status === "available" ||
        data.status === "available-pending" ||
        data.status === "available-manual"
      ) {
        if (userCheckRef.current) {
          setUpdatePanelOpen(true);
        }
      }

      if (data.status === "downloading") {
        setUpdatePanelOpen(true);
        clearDismissTimer();
      }

      if (data.status === "downloaded" || data.status === "scheduled") {
        setUpdatePanelOpen(true);
        clearDismissTimer();
      }

      if (data.status === "error" && userCheckRef.current) {
        setUpdatePanelOpen(true);
        clearDismissTimer();
      }
    });

    return () => {
      unsub?.();
      clearDismissTimer();
    };
  }, [getUpdaterAPI, scheduleDismiss, clearDismissTimer]);

  const handleCheckUpdate = async () => {
    if (isChecking) return;

    userCheckRef.current = true;
    clearDismissTimer();
    setUpdatePanelOpen(true);
    setIsChecking(true);
    setUpdateStatus({ status: "checking" });

    const updaterAPI = getUpdaterAPI();
    if (updaterAPI?.checkForUpdates) {
      try {
        const res = await updaterAPI.checkForUpdates();
        if (res?.status === "dev") {
          setUpdateStatus({ status: "dev", message: "In dev mode" });
          scheduleDismiss(3500);
        } else if (res?.status) {
          setUpdateStatus(
            res.status === "available"
              ? { ...res, status: "available-pending" }
              : res
          );
          if (res.status === "up-to-date") {
            scheduleDismiss();
          } else if (res.status === "error") {
            clearDismissTimer();
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to check update";
        setUpdateStatus({ status: "error", message: msg });
      } finally {
        setIsChecking(false);
      }
      return;
    }

    setTimeout(() => {
      setUpdateStatus({ status: "up-to-date" });
      setIsChecking(false);
      scheduleDismiss();
    }, 800);
  };

  const closeUpdatePanel = () => {
    clearDismissTimer();
    setUpdatePanelOpen(false);
    userCheckRef.current = false;
  };

  if (!isElectron) {
    return null;
  }

  const renderUpdatePanelContent = () => {
    switch (updateStatus.status) {
      case "checking":
        return (
          <>
            <RefreshCw size={16} className="spin text-teal-400" aria-hidden="true" />
            <div className="update-popover-body">
              <p className="update-popover-title">Checking for updates</p>
              <p className="update-popover-detail">Contacting GitHub Releases…</p>
            </div>
          </>
        );
      case "available":
      case "available-pending":
        return (
          <>
            <DownloadCloud size={16} className="text-sky-400" aria-hidden="true" />
            <div className="update-popover-body">
              <p className="update-popover-title">Update {updateStatus.version} available</p>
              <p className="update-popover-detail">
                Download in the background? You can keep working while it downloads.
              </p>
              <div className="update-popover-actions">
                <button type="button" className="update-popover-action" onClick={handleDownloadUpdate}>
                  Download update
                </button>
                <button type="button" className="update-popover-action secondary" onClick={closeUpdatePanel}>
                  Not now
                </button>
              </div>
            </div>
          </>
        );
      case "available-manual":
        return (
          <>
            <DownloadCloud size={16} className="text-sky-400" aria-hidden="true" />
            <div className="update-popover-body">
              <p className="update-popover-title">Update {updateStatus.version} available</p>
              <p className="update-popover-detail">
                {updateStatus.autoInstallSupported === false
                  ? "This install type uses manual updates. On Linux .deb, use the AppImage for in-app updates, or open Releases for the new .deb."
                  : updateStatus.downloadName
                    ? `Open ${updateStatus.downloadName} on GitHub.`
                    : "Open the release download on GitHub."}
              </p>
              <button type="button" className="update-popover-action" onClick={handleDownloadUpdate}>
                Open download
              </button>
            </div>
          </>
        );
      case "downloading":
        return (
          <>
            <RefreshCw size={16} className="spin text-teal-400" aria-hidden="true" />
            <div className="update-popover-body">
              <p className="update-popover-title">Downloading update</p>
              <p className="update-popover-detail">{updateStatus.percent ?? 0}% complete — keep working</p>
              <div className="update-popover-progress" role="progressbar" aria-valuenow={updateStatus.percent ?? 0}>
                <div
                  className="update-popover-progress-fill"
                  style={{ width: `${Math.max(0, Math.min(100, updateStatus.percent ?? 0))}%` }}
                />
              </div>
            </div>
          </>
        );
      case "downloaded":
        return (
          <>
            <CheckCircle2 size={16} className="text-emerald-400" aria-hidden="true" />
            <div className="update-popover-body">
              <p className="update-popover-title">Update ready</p>
              <p className="update-popover-detail">
                Version {updateStatus.version} downloaded. Restart to install, or wait 30 minutes.
              </p>
              <div className="update-popover-actions">
                <button type="button" className="update-popover-action" onClick={handleInstallUpdate}>
                  Install now
                </button>
                <button type="button" className="update-popover-action secondary" onClick={handleDeferInstall}>
                  Install in 30 minutes
                </button>
              </div>
            </div>
          </>
        );
      case "scheduled":
        return (
          <>
            <Clock size={16} className="text-amber-300" aria-hidden="true" />
            <div className="update-popover-body">
              <p className="update-popover-title">Install scheduled</p>
              <p className="update-popover-detail">
                Version {updateStatus.version} will prompt again in {formatInstallCountdown(updateStatus.installAt)}.
              </p>
              <div className="update-popover-actions">
                <button type="button" className="update-popover-action" onClick={handleInstallUpdate}>
                  Install now
                </button>
                <button type="button" className="update-popover-action secondary" onClick={closeUpdatePanel}>
                  Close
                </button>
              </div>
            </div>
          </>
        );
      case "error":
        return (
          <>
            <AlertCircle size={16} className="text-amber-400" aria-hidden="true" />
            <div className="update-popover-body">
              <p className="update-popover-title">Could not check updates</p>
              <p className="update-popover-detail">{updateStatus.message || "Please try again later."}</p>
              <button type="button" className="update-popover-action secondary" onClick={handleCheckUpdate}>
                Retry
              </button>
            </div>
          </>
        );
      case "dev":
        return (
          <>
            <AlertCircle size={16} className="text-slate-400" aria-hidden="true" />
            <div className="update-popover-body">
              <p className="update-popover-title">Development mode</p>
              <p className="update-popover-detail">Auto-update is disabled while running from source.</p>
            </div>
          </>
        );
      case "up-to-date":
      default:
        return (
          <>
            <CheckCircle2 size={16} className="text-emerald-400" aria-hidden="true" />
            <div className="update-popover-body">
              <p className="update-popover-title">You&apos;re up to date</p>
              <p className="update-popover-detail">
                ClearVoice Studio {appVersion} is the latest release we found.
              </p>
            </div>
          </>
        );
    }
  };

  const checkButtonLabel =
    updateStatus.status === "downloading"
      ? `Downloading ${updateStatus.percent ?? 0}%`
      : updateStatus.status === "downloaded"
        ? "Update ready"
        : updateStatus.status === "scheduled"
          ? "Update scheduled"
          : isChecking
            ? "Checking…"
            : "Check updates";

  return (
    <footer className="desktop-statusbar" role="contentinfo">
      <div className="statusbar-left">
        <div className="statusbar-item brand-badge">
          <span className="font-semibold text-slate-200">ClearVoice Studio</span>
          <span className="statusbar-version">{appVersion}</span>
        </div>

        <div className="statusbar-divider" />

        <div className="statusbar-item engine-indicator">
          <Cpu size={12} className="text-teal-400" />
          <span className="text-slate-300">Neural Engine</span>
          <span
            className={`engine-status-tag ${
              engineStatus === "online" ? "online" : engineStatus === "offline" ? "offline" : "loading"
            }`}
          >
            {engineStatus === "online" ? (
              <>
                <span className="engine-ping-dot" />
                <span>Online{latencyMs ? ` (${latencyMs}ms)` : ""}</span>
              </>
            ) : engineStatus === "loading" ? (
              "Connecting..."
            ) : (
              "Offline"
            )}
          </span>
        </div>

        {activeVoice && (
          <>
            <div className="statusbar-divider" />
            <div className="statusbar-item voice-indicator" title={`Selected Voice: ${activeVoice}`}>
              <Radio size={11} className="text-cyan-400" />
              <span className="text-slate-400 max-w-[160px] truncate">{activeVoice}</span>
            </div>
          </>
        )}
      </div>

      <div className="statusbar-right">
        <div className="statusbar-item update-section-anchor">
          {updatePanelOpen && (
            <div className="update-popover" role="status" aria-live="polite">
              <button
                type="button"
                className="update-popover-close"
                onClick={closeUpdatePanel}
                aria-label="Close update panel"
              >
                <X size={14} />
              </button>
              <div className="update-popover-content">{renderUpdatePanelContent()}</div>
            </div>
          )}

          <button
            type="button"
            className="update-check-btn"
            onClick={handleCheckUpdate}
            disabled={isChecking || updateStatus.status === "downloading"}
            title="Check for application updates"
          >
            <RefreshCw
              size={11}
              className={
                isChecking || updateStatus.status === "downloading" ? "spin text-teal-400" : "text-slate-400"
              }
            />
            <span>{checkButtonLabel}</span>
          </button>
        </div>

        <div className="statusbar-divider" />

        <a
          href="https://github.com/PMGEECODE/ClearVoiceStudio/releases/latest"
          target="_blank"
          rel="noreferrer"
          className="statusbar-link"
          title="Open ClearVoice Studio Releases"
        >
          <span>GitHub</span>
          <ExternalLink size={10} />
        </a>
      </div>
    </footer>
  );
};
