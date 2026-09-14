"use client";

import React, { useEffect, useState } from "react";
import { Mic2, Radio } from "lucide-react";
import { DesktopTitleBar } from "./DesktopTitleBar";

interface HeaderProps {
  status: "online" | "offline" | "loading";
  latencyMs?: number;
  activeVoice?: string;
}

export const Header: React.FC<HeaderProps> = ({ status, latencyMs, activeVoice }) => {
  const [isElectron, setIsElectron] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI?.isElectron) {
      setIsElectron(true);
    }
  }, []);

  // When running inside our custom frameless Electron window, show the DesktopTitleBar
  if (isElectron) {
    return (
      <DesktopTitleBar
        status={status}
        latencyMs={latencyMs}
        activeVoice={activeVoice}
      />
    );
  }

  // Web Browser fallback
  return (
    <>
      <header className="top-nav">
        <div className="container nav-content">
          <div className="brand-wrapper">
            <div className="brand-icon-box">
              <Mic2 size={22} />
            </div>
            <div className="brand-text">
              <h1>ClearVoice Studio</h1>
              <p className="brand-subtitle">Local AI · Neural Speech Synthesis</p>
            </div>
          </div>

          <div className="nav-status-group">
            {activeVoice && (
              <div className="status-badge" style={{ color: "#cbd5e1" }}>
                <Radio size={13} style={{ color: "var(--accent-secondary)" }} />
                <span>{activeVoice}</span>
              </div>
            )}

            <div
              className={`status-badge ${
                status === "online" ? "online" : status === "offline" ? "offline" : ""
              }`}
            >
              <div className="status-dot" />
              <span>
                {status === "online"
                  ? `Engine Active ${latencyMs ? `(${latencyMs}ms)` : ""}`
                  : status === "loading"
                  ? "Connecting..."
                  : "Engine Offline"}
              </span>
            </div>
          </div>
        </div>
      </header>
    </>
  );
};
