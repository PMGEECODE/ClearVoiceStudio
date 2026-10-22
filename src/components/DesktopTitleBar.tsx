"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import {
  Minus,
  Square,
  Copy,
  X,
  Radio,
  Sparkles,
} from "lucide-react";
import cvsLogo from "@/assets/icon/cvs.png";

interface DesktopTitleBarProps {
  status: "online" | "offline" | "loading";
  latencyMs?: number;
  activeVoice?: string;
}

interface ElectronAPI {
  isElectron: boolean;
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  onMaximizedChange: (cb: (isMax: boolean) => void) => () => void;
  startDragging?: () => Promise<void>;
  startResizeDragging?: (direction: string) => Promise<void>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export const DesktopTitleBar: React.FC<DesktopTitleBarProps> = ({
  status,
  latencyMs,
  activeVoice,
}) => {
  const [isElectron, setIsElectron] = useState<boolean>(false);
  const [platform, setPlatform] = useState<string>("linux");
  const [isMaximized, setIsMaximized] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI?.isElectron) {
      setIsElectron(true);
      window.electronAPI.getPlatform().then((p) => {
        if (p) setPlatform(p);
      });
      window.electronAPI.isMaximized().then((max) => {
        setIsMaximized(max);
      });

      const unsub = window.electronAPI.onMaximizedChange((max) => {
        setIsMaximized(max);
      });
      return () => {
        unsub?.();
      };
    }
  }, []);

  const handleMinimize = () => {
    window.electronAPI?.minimize();
  };

  const handleMaximize = () => {
    window.electronAPI?.maximize();
  };

  const handleClose = () => {
    window.electronAPI?.close();
  };

  const isMac = platform === "darwin";
  const isWin = platform === "win32";

  const handleDragMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      window.electronAPI?.startDragging?.();
    }
  };

  return (
    <div
      className={`desktop-titlebar platform-${platform} ${
        isElectron ? "is-electron" : "is-web"
      }`}
      role="banner"
    >
      {/* Left zone: Traffic lights space for macOS, or Logo for Win/Linux */}
      <div className="titlebar-left">
        {isMac && isElectron ? (
          <div className="titlebar-mac-spacer" />
        ) : (
          <div className="titlebar-brand no-drag">
            <div
              className="titlebar-icon-box"
              style={{
                width: 26,
                height: 26,
                minWidth: 26,
                minHeight: 26,
                maxWidth: 26,
                maxHeight: 26,
                overflow: "hidden",
              }}
            >
              <Image
                src={cvsLogo}
                alt="ClearVoice Studio"
                width={26}
                height={26}
                priority
                className="titlebar-logo-img"
                style={{
                  width: 26,
                  height: 26,
                  maxWidth: 26,
                  maxHeight: 26,
                  objectFit: "contain",
                }}
              />
            </div>
            <div className="titlebar-titles">
              <span className="titlebar-app-name">ClearVoice Studio</span>
              <span className="titlebar-tagline">Neural TTS</span>
            </div>
          </div>
        )}
      </div>

      {/* Center Draggable Zone: Title & Status pill */}
      <div
        className="titlebar-center titlebar-drag-region"
        onMouseDown={handleDragMouseDown}
        onDoubleClick={handleMaximize}
      >
        {isMac && (
          <div className="titlebar-mac-title no-drag">
            <span className="titlebar-app-name">ClearVoice Studio</span>
          </div>
        )}

        <div className="titlebar-indicators no-drag">
          {activeVoice && (
            <div className="titlebar-pill voice-pill" title={`Active Voice: ${activeVoice}`}>
              <Radio size={11} className="text-cyan-400" />
              <span className="truncate max-w-[140px]">{activeVoice}</span>
            </div>
          )}

          <div
            className={`titlebar-pill status-pill ${
              status === "online" ? "online" : status === "offline" ? "offline" : "loading"
            }`}
            title={`Engine Status: ${status}`}
          >
            <span className="status-bullet" />
            <span>
              {status === "online"
                ? `Active ${latencyMs ? `· ${latencyMs}ms` : ""}`
                : status === "loading"
                ? "Connecting…"
                : "Offline"}
            </span>
          </div>
        </div>
      </div>

      {/* Right zone: Window Controls (Windows / Linux) or Brand for Mac */}
      <div className="titlebar-right">
        {isElectron && !isMac ? (
          <div className="titlebar-window-controls no-drag">
            <button
              type="button"
              className={`window-control-btn minimize-btn ${isWin ? "win-btn" : "linux-btn"}`}
              onClick={handleMinimize}
              title="Minimize"
              aria-label="Minimize"
            >
              <Minus size={13} strokeWidth={2} />
            </button>

            <button
              type="button"
              className={`window-control-btn maximize-btn ${isWin ? "win-btn" : "linux-btn"}`}
              onClick={handleMaximize}
              title={isMaximized ? "Restore" : "Maximize"}
              aria-label={isMaximized ? "Restore" : "Maximize"}
            >
              {isMaximized ? (
                <Copy size={11} strokeWidth={2} className="rotate-180" />
              ) : (
                <Square size={11} strokeWidth={2} />
              )}
            </button>

            <button
              type="button"
              className={`window-control-btn close-btn ${isWin ? "win-btn" : "linux-btn"}`}
              onClick={handleClose}
              title="Close"
              aria-label="Close"
            >
              <X size={13} strokeWidth={2} />
            </button>
          </div>
        ) : isMac ? (
          <div className="titlebar-mac-badge no-drag">
            <Sparkles size={13} className="text-teal-400 opacity-70" />
          </div>
        ) : (
          /* Web fallback status right */
          <div className="titlebar-web-tag no-drag">Desktop Mode Available</div>
        )}
      </div>
    </div>
  );
};
