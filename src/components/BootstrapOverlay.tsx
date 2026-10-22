"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, Loader2, RotateCcw, WifiOff } from "lucide-react";
import { BootstrapDownloadIcon } from "@/components/BootstrapDownloadIcon";

export type BootstrapPhase = "idle" | "running" | "waiting_network" | "ready" | "error";

export type BootstrapProgress = {
  phase: BootstrapPhase;
  percent: number;
  label: string;
  detail: string;
  error?: string | null;
};

type ElectronBootstrapAPI = {
  getBootstrapStatus?: () => Promise<BootstrapProgress>;
  retryBootstrap?: () => Promise<BootstrapProgress>;
  onBootstrapProgress?: (callback: (data: BootstrapProgress) => void) => () => void;
};

export const BootstrapOverlay: React.FC = () => {
  const [progress, setProgress] = useState<BootstrapProgress | null>(null);
  const [visible, setVisible] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const applyProgress = useCallback((data: BootstrapProgress) => {
    setProgress(data);
    setVisible(data.phase === "running" || data.phase === "waiting_network" || data.phase === "error");
    if (data.phase === "ready") {
      setVisible(false);
    }
  }, []);

  useEffect(() => {
    const api = (window as unknown as { electronAPI?: ElectronBootstrapAPI }).electronAPI;
    if (!api?.getBootstrapStatus) return;

    let unsub: (() => void) | undefined;

    api.getBootstrapStatus().then((status) => {
      applyProgress(status);
    });

    if (api.onBootstrapProgress) {
      unsub = api.onBootstrapProgress(applyProgress);
    }

    return () => {
      unsub?.();
    };
  }, [applyProgress]);

  const handleRetry = async () => {
    const api = (window as unknown as { electronAPI?: ElectronBootstrapAPI }).electronAPI;
    if (!api?.retryBootstrap) return;
    setRetrying(true);
    try {
      const result = await api.retryBootstrap();
      applyProgress(result);
    } finally {
      setRetrying(false);
    }
  };

  if (!visible || !progress) return null;

  const isError = progress.phase === "error";
  const isWaitingNetwork = progress.phase === "waiting_network";
  const isActive = progress.phase === "running" || isWaitingNetwork;

  return (
    <div className="bootstrap-overlay" role="dialog" aria-modal="true" aria-labelledby="bootstrap-title">
      <div className="bootstrap-overlay-card glass-card">
        <div className="bootstrap-overlay-icon">
          {isError ? (
            <AlertCircle size={28} aria-hidden="true" />
          ) : isWaitingNetwork ? (
            <WifiOff size={28} aria-hidden="true" />
          ) : (
            <BootstrapDownloadIcon size={28} animate={isActive} />
          )}
        </div>
        <h2 id="bootstrap-title" className="bootstrap-overlay-title">
          {progress.label}
        </h2>
        <p className="bootstrap-overlay-detail">{progress.detail}</p>
        {isActive && (
          <div
            className="synthesis-progress-track bootstrap-overlay-track"
            role="progressbar"
            aria-valuenow={progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="synthesis-progress-fill"
              style={{ width: `${Math.max(0, Math.min(100, progress.percent))}%` }}
            />
          </div>
        )}
        {isActive && (
          <p className="bootstrap-overlay-percent" aria-live="polite">
            {isWaitingNetwork ? "Paused — waiting for network" : `${progress.percent}%`}
          </p>
        )}
        {isError && (
          <button
            type="button"
            className="btn-primary bootstrap-overlay-retry"
            onClick={handleRetry}
            disabled={retrying}
          >
            {retrying ? (
              <>
                <Loader2 size={16} className="spin" aria-hidden="true" />
                <span>Retrying…</span>
              </>
            ) : (
              <>
                <RotateCcw size={16} aria-hidden="true" />
                <span>Retry setup</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
