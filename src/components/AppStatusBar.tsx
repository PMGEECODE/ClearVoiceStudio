"use client";

import React, { useEffect, useState } from "react";
import {
  DownloadCloud,
  CheckCircle2,
  RefreshCw,
  Cpu,
  Radio,
  ExternalLink,
} from "lucide-react";

interface AppStatusBarProps {
  engineStatus: "online" | "offline" | "loading";
  latencyMs?: number;
  activeVoice?: string;
}

interface UpdateStatusInfo {
  status: "checking" | "available" | "up-to-date" | "downloading" | "downloaded" | "error" | "dev";
  version?: string;
  percent?: number;
  message?: string;
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

  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI?.isElectron) {
      setIsElectron(true);
      window.electronAPI.getVersion?.().then((v) => {
        if (v) setAppVersion(`v${v}`);
      });

      // Hook auto-updater events
      const updaterAPI = (window as unknown as { electronAPI: { onUpdateStatus?: (cb: (data: UpdateStatusInfo) => void) => () => void } }).electronAPI;
      if (updaterAPI?.onUpdateStatus) {
        const unsub = updaterAPI.onUpdateStatus((data: UpdateStatusInfo) => {
          setUpdateStatus(data);
          setIsChecking(false);
        });
        return () => {
          unsub?.();
        };
      }
    }
  }, []);

  const handleCheckUpdate = async () => {
    if (isChecking) return;
    setIsChecking(true);
    setUpdateStatus({ status: "checking" });

    const updaterAPI = (window as unknown as { electronAPI?: { checkForUpdates?: () => Promise<UpdateStatusInfo> } }).electronAPI;
    if (updaterAPI?.checkForUpdates) {
      try {
        const res = await updaterAPI.checkForUpdates();
        if (res?.status === "dev") {
          setUpdateStatus({ status: "dev", message: "In dev mode" });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to check update";
        setUpdateStatus({ status: "error", message: msg });
      } finally {
        setIsChecking(false);
      }
    } else {
      setTimeout(() => {
        setUpdateStatus({ status: "up-to-date" });
        setIsChecking(false);
      }, 800);
    }
  };

  const handleInstallUpdate = () => {
    const updaterAPI = (window as unknown as { electronAPI?: { quitAndInstall?: () => void } }).electronAPI;
    updaterAPI?.quitAndInstall?.();
  };

  const handleDownloadUpdate = () => {
    const updaterAPI = (window as unknown as { electronAPI?: { downloadUpdate?: () => void } }).electronAPI;
    updaterAPI?.downloadUpdate?.();
  };

  if (!isElectron) {
    return null;
  }

  return (
    <footer className="desktop-statusbar" role="contentinfo">
      {/* Left section: App name, Version & Engine */}
      <div className="statusbar-left">
        <div className="statusbar-item brand-badge">
          <span className="font-semibold text-slate-200">ClearVoice Studio</span>
          <span className="statusbar-version">{appVersion}</span>
        </div>

        <div className="statusbar-divider" />

        <div className="statusbar-item engine-indicator">
          <Cpu size={12} className="text-teal-400" />
          <span className="text-slate-300">
            Neural Engine
          </span>
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

      {/* Right section: Auto-Updater status & Github links */}
      <div className="statusbar-right">
        {/* Update pill */}
        <div className="statusbar-item update-section">
          {updateStatus.status === "available" ? (
            <button
              type="button"
              className="update-action-btn update-available"
              onClick={handleDownloadUpdate}
              title="Click to download the latest update"
            >
              <DownloadCloud size={12} className="animate-bounce" />
              <span>Update available: {updateStatus.version}</span>
            </button>
          ) : updateStatus.status === "downloading" ? (
            <div className="update-progress-pill">
              <RefreshCw size={11} className="spin text-teal-400" />
              <span>Downloading ({updateStatus.percent ?? 0}%)</span>
            </div>
          ) : updateStatus.status === "downloaded" ? (
            <button
              type="button"
              className="update-action-btn update-ready"
              onClick={handleInstallUpdate}
              title="Restart ClearVoice Studio to install the update"
            >
              <CheckCircle2 size={12} />
              <span>Install & Restart</span>
            </button>
          ) : (
            <button
              type="button"
              className="update-check-btn"
              onClick={handleCheckUpdate}
              disabled={isChecking}
              title="Check for application updates"
            >
              <RefreshCw size={11} className={isChecking ? "spin text-teal-400" : "text-slate-400"} />
              <span>
                {isChecking
                  ? "Checking…"
                  : updateStatus.status === "dev"
                  ? "Dev Mode"
                  : "Up to date"}
              </span>
            </button>
          )}
        </div>

        <div className="statusbar-divider" />

        <a
          href="https://github.com/livecodetech/ClearVoiceStudio"
          target="_blank"
          rel="noreferrer"
          className="statusbar-link"
          title="Open ClearVoice Studio Repository"
        >
          <span>GitHub</span>
          <ExternalLink size={10} />
        </a>
      </div>
    </footer>
  );
};
