"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Search,
  Download,
  Play,
  Pause,
  Check,
  Loader2,
  Globe,
  Sparkles,
  Layers,
  AppWindow,
  PanelRight,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { CatalogVoice } from "@/app/api/catalog/route";

interface VoiceCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectVoice: (voiceId: string) => void;
  currentVoiceId: string;
  onVoiceDownloaded: () => void;
}

interface VoiceDownloadProgress {
  file?: string;
  message?: string;
  downloaded?: number;
  total?: number | null;
  remaining?: number | null;
  percent?: number | null;
}

interface VoiceDownloadEvent extends VoiceDownloadProgress {
  type: "status" | "progress" | "success" | "error";
  voice?: string;
  isInstalled?: boolean;
}

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

export const VoiceCatalogModal: React.FC<VoiceCatalogModalProps> = ({
  isOpen,
  onClose,
  onSelectVoice,
  currentVoiceId,
  onVoiceDownloaded,
}) => {
  const [catalog, setCatalog] = useState<CatalogVoice[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedFilter, setSelectedFilter] = useState<string>("all");
  const [downloadingVoiceId, setDownloadingVoiceId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, VoiceDownloadProgress>>({});
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Audio Preview State
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);
  const [previewLoadingVoiceId, setPreviewLoadingVoiceId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeBlobUrlRef = useRef<string | null>(null);

  const stopPreview = useCallback(() => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
    }
    if (activeBlobUrlRef.current) {
      URL.revokeObjectURL(activeBlobUrlRef.current);
      activeBlobUrlRef.current = null;
    }
    setPreviewingVoiceId(null);
    setPreviewLoadingVoiceId(null);
  }, []);

  const fetchCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      const res = await fetch("/api/catalog");
      if (res.ok) {
        const data = await res.json();
        setCatalog(data.voices || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  const [isVisible, setIsVisible] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const prevIsOpenRef = useRef(isOpen);

  // Desktop Floating Window vs Web Side Pane Type
  const [isDesktop, setIsDesktop] = useState(false);
  const [mode, setMode] = useState<"sidepane" | "window">("sidepane");
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const isElectronEnv = typeof window !== "undefined" && Boolean(window.electronAPI?.isElectron);
    setIsDesktop(isElectronEnv);
    // On desktop, default to floating window style; on web, default to sidepane style
    setMode(isElectronEnv ? "window" : "sidepane");
  }, []);

  const handleRequestClose = useCallback(() => {
    if (isClosing) return;
    stopPreview();
    setIsClosing(true);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setIsVisible(false);
      setIsClosing(false);
      onClose();
    }, 200);
  }, [isClosing, stopPreview, onClose]);

  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setIsClosing(false);
      setIsVisible(true);
      fetchCatalog();
    } else if (!isOpen && prevIsOpenRef.current) {
      if (isVisible && !isClosing) {
        setIsClosing(true);
        if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
        closeTimerRef.current = setTimeout(() => {
          setIsVisible(false);
          setIsClosing(false);
          stopPreview();
        }, 200);
      }
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, fetchCatalog, isVisible, isClosing, stopPreview]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isVisible || isClosing) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleRequestClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isVisible, isClosing, handleRequestClose]);

  const handleTogglePreview = async (voice: CatalogVoice) => {
    if (previewingVoiceId === voice.id) {
      stopPreview();
      return;
    }

    stopPreview();

    // If a static remote audio sample exists, play it
    if (voice.sampleUrl) {
      if (!previewAudioRef.current) {
        previewAudioRef.current = new Audio();
      }
      previewAudioRef.current.src = voice.sampleUrl;
      previewAudioRef.current.onended = () => setPreviewingVoiceId(null);
      previewAudioRef.current.onerror = () => setPreviewingVoiceId(null);
      previewAudioRef.current.play().then(() => {
        setPreviewingVoiceId(voice.id);
      }).catch(() => {
        setPreviewingVoiceId(null);
      });
      return;
    }

    // For installed voices without static URLs, synthesize a quick authentic sample
    if (voice.isInstalled) {
      try {
        setPreviewLoadingVoiceId(voice.id);
        const res = await fetch("/api/synthesize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `Hello! This is ${voice.name}. ClearVoice neural speech synthesis is ready.`,
            voice: voice.id,
          }),
        });
        if (!res.ok) {
          throw new Error("Preview generation failed");
        }
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        activeBlobUrlRef.current = blobUrl;

        if (!previewAudioRef.current) {
          previewAudioRef.current = new Audio();
        }
        previewAudioRef.current.src = blobUrl;
        previewAudioRef.current.onended = () => {
          setPreviewingVoiceId(null);
          if (activeBlobUrlRef.current) {
            URL.revokeObjectURL(activeBlobUrlRef.current);
            activeBlobUrlRef.current = null;
          }
        };
        previewAudioRef.current.onerror = () => {
          setPreviewingVoiceId(null);
          if (activeBlobUrlRef.current) {
            URL.revokeObjectURL(activeBlobUrlRef.current);
            activeBlobUrlRef.current = null;
          }
        };
        await previewAudioRef.current.play();
        setPreviewingVoiceId(voice.id);
      } catch {
        setPreviewingVoiceId(null);
      } finally {
        setPreviewLoadingVoiceId(null);
      }
    }
  };

  const handleDownloadVoice = async (voiceId: string) => {
    setDownloadingVoiceId(voiceId);
    setDownloadError(null);
    setDownloadProgress((prev) => ({
      ...prev,
      [voiceId]: { message: "Preparing download", percent: 0 },
    }));
    try {
      const res = await fetch("/api/download-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice: voiceId }),
      });

      if (!res.body) {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) {
          throw new Error(data.error || "Download failed");
        }
      } else {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let completed = false;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as VoiceDownloadEvent;
            if (event.type === "error") {
              throw new Error(event.message || "Download failed");
            }
            if (event.type === "success") {
              completed = true;
              setDownloadProgress((prev) => ({
                ...prev,
                [voiceId]: { message: event.message || "Installed", percent: 100, remaining: 0 },
              }));
            } else {
              setDownloadProgress((prev) => ({
                ...prev,
                [voiceId]: {
                  file: event.file,
                  message: event.message,
                  downloaded: event.downloaded,
                  total: event.total,
                  remaining: event.remaining,
                  percent: event.percent,
                },
              }));
            }
          }
        }

        if (buffer.trim()) {
          const event = JSON.parse(buffer) as VoiceDownloadEvent;
          if (event.type === "error") {
            throw new Error(event.message || "Download failed");
          }
          completed = completed || event.type === "success";
        }

        if (!completed && !res.ok) {
          throw new Error("Download failed");
        }
      }

      // Mark as installed in state
      setCatalog((prev) =>
        prev.map((v) => (v.id === voiceId ? { ...v, isInstalled: true } : v))
      );
      onVoiceDownloaded();
      onSelectVoice(voiceId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to download voice";
      setDownloadError(msg);
      setDownloadProgress((prev) => ({
        ...prev,
        [voiceId]: { message: msg },
      }));
    } finally {
      setDownloadingVoiceId(null);
    }
  };

  if (!isVisible) return null;

  // Filtering
  const filteredVoices = catalog.filter((v) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      v.id.toLowerCase().includes(q) ||
      v.name.toLowerCase().includes(q) ||
      v.languageName.toLowerCase().includes(q) ||
      v.countryName.toLowerCase().includes(q);

    if (!matchesSearch) return false;

    if (selectedFilter === "en_us") return v.languageCode === "en_US";
    if (selectedFilter === "en_gb") return v.languageCode === "en_GB";
    if (selectedFilter === "installed") return v.isInstalled;
    if (selectedFilter === "high_quality") return v.quality === "high";

    return true;
  });

  const isWindowMode = mode === "window";
  const overlayClass = isWindowMode
    ? `desktop-window-overlay ${isClosing ? "closing" : ""}`
    : `sidepane-overlay ${isClosing ? "closing" : ""}`;
  const containerClass = isWindowMode
    ? `desktop-window-frame ${isMaximized ? "maximized" : ""} ${isClosing ? "closing" : ""}`
    : `sidepane-drawer ${isClosing ? "closing" : ""}`;

  return (
    <div className={overlayClass}>
      <div
        className={containerClass}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sidepane-header">
          <div className="card-title-group" style={{ gap: "0.85rem" }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "var(--radius-md)",
                background: "linear-gradient(135deg, rgba(45, 212, 191, 0.22), rgba(56, 189, 248, 0.12))",
                border: "1px solid rgba(45, 212, 191, 0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--accent-primary)",
                flexShrink: 0,
                boxShadow: "0 0 16px rgba(45, 212, 191, 0.2)",
              }}
            >
              <Globe size={22} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                <h2 className="card-title" style={{ fontSize: "1.15rem", margin: 0, fontWeight: 700 }}>
                  ClearVoice Voice Catalog
                </h2>
                <span
                  style={{
                    fontSize: "0.72rem",
                    padding: "0.18rem 0.6rem",
                    borderRadius: "999px",
                    background: "rgba(45, 212, 191, 0.15)",
                    border: "1px solid rgba(45, 212, 191, 0.3)",
                    color: "var(--accent-primary)",
                    fontWeight: 600,
                  }}
                >
                  {catalog.length > 0 ? `${catalog.length} Available` : "Catalog"}
                </span>
                {isDesktop && (
                  <span
                    style={{
                      fontSize: "0.68rem",
                      padding: "0.15rem 0.5rem",
                      borderRadius: "var(--radius-sm)",
                      background: "rgba(255, 255, 255, 0.06)",
                      color: "var(--text-muted)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    {isWindowMode ? "Window" : "Pane"}
                  </span>
                )}
              </div>
              <p className="card-desc" style={{ marginTop: "0.2rem", fontSize: "0.8rem" }}>
                Browse neural voices, preview speech audio, and manage offline models
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            {/* Mode Toggle: Floating Window vs Side Pane */}
            <button
              type="button"
              className="icon-btn-ghost"
              onClick={() => {
                setMode((prev) => (prev === "window" ? "sidepane" : "window"));
                setIsMaximized(false);
              }}
              title={isWindowMode ? "Dock as right side pane" : "Pop out as floating window"}
              aria-label={isWindowMode ? "Dock as side pane" : "Pop out as floating window"}
              style={{
                width: 34,
                height: 34,
                justifyContent: "center",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                color: "var(--text-muted)",
              }}
            >
              {isWindowMode ? <PanelRight size={16} /> : <AppWindow size={16} />}
            </button>

            {/* Maximize / Restore (Window Mode Only) */}
            {isWindowMode && (
              <button
                type="button"
                className="icon-btn-ghost"
                onClick={() => setIsMaximized((prev) => !prev)}
                title={isMaximized ? "Restore window size" : "Maximize window"}
                aria-label={isMaximized ? "Restore window size" : "Maximize window"}
                style={{
                  width: 34,
                  height: 34,
                  justifyContent: "center",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                }}
              >
                {isMaximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
            )}

            {/* Close Button */}
            <button
              type="button"
              className="icon-btn-ghost"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleRequestClose();
              }}
              title="Close (Esc)"
              aria-label="Close voice catalog"
              style={{
                width: 34,
                height: 34,
                justifyContent: "center",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                zIndex: 10,
                flexShrink: 0,
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="sidepane-search-filter">
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
            }}
          >
            <Search
              size={16}
              style={{
                position: "absolute",
                left: "1rem",
                color: "var(--text-dim)",
              }}
            />
            <input
              type="text"
              placeholder="Search by voice name (e.g. bryce, ryan), language, or country..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="select-input"
              style={{
                paddingLeft: "2.5rem",
                paddingRight: searchQuery ? "2.5rem" : "1rem",
                fontSize: "0.9rem",
                backgroundColor: "rgba(18, 26, 44, 0.8)",
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="icon-btn-ghost"
                style={{
                  position: "absolute",
                  right: "0.5rem",
                  width: 26,
                  height: 26,
                  padding: 0,
                  justifyContent: "center",
                }}
                title="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {[
              { id: "all", label: "All Voices", icon: Layers },
              { id: "en_us", label: "English (US)", icon: Globe },
              { id: "en_gb", label: "English (UK)", icon: Globe },
              { id: "installed", label: "Installed Locally", icon: Check },
              { id: "high_quality", label: "High Quality", icon: Sparkles },
            ].map((f) => {
              const Icon = f.icon;
              return (
                <button
                  key={f.id}
                  type="button"
                  className={`tab-btn ${selectedFilter === f.id ? "active" : ""}`}
                  onClick={() => setSelectedFilter(f.id)}
                  style={{
                    fontSize: "0.75rem",
                    padding: "0.3rem 0.65rem",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                  }}
                >
                  <Icon size={12} />
                  <span>{f.label}</span>
                </button>
              );
            })}
          </div>

          {downloadError && (
            <div
              style={{
                padding: "0.5rem 0.75rem",
                borderRadius: "var(--radius-sm)",
                background: "rgba(244, 63, 94, 0.15)",
                color: "var(--accent-rose)",
                fontSize: "0.8rem",
              }}
            >
              {downloadError}
            </div>
          )}
        </div>

        {/* Voices List Body */}
        <div className="sidepane-grid">
          {loadingCatalog ? (
            <div
              style={{
                gridColumn: "1 / -1",
                textAlign: "center",
                padding: "3rem",
                color: "var(--text-muted)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.75rem",
              }}
            >
              <Loader2 size={28} className="spin" style={{ color: "var(--accent-primary)" }} />
              <span>Loading voice directory...</span>
            </div>
          ) : filteredVoices.length === 0 ? (
            <div
              style={{
                gridColumn: "1 / -1",
                textAlign: "center",
                padding: "3rem",
                color: "var(--text-dim)",
              }}
            >
              No voices found matching &quot;{searchQuery}&quot;
            </div>
          ) : (
            filteredVoices.map((voice) => {
              const isPlayingSample = previewingVoiceId === voice.id;
              const isCurrent = currentVoiceId === voice.id;
              const isDownloading = downloadingVoiceId === voice.id;
              const progress = downloadProgress[voice.id];
              const percent = typeof progress?.percent === "number" ? progress.percent : null;

              return (
                <div
                  key={voice.id}
                  style={{
                    borderRadius: "var(--radius-md)",
                    padding: "0.75rem 0.85rem",
                    border: `1px solid ${
                      isCurrent
                        ? "var(--accent-primary)"
                        : voice.isInstalled
                        ? "rgba(16, 185, 129, 0.3)"
                        : "var(--border-subtle)"
                    }`,
                    background: isCurrent
                      ? "var(--accent-primary-light)"
                      : "rgba(255, 255, 255, 0.02)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: "0.65rem",
                    transition: "var(--transition)",
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: "0.5rem",
                      }}
                    >
                      <div>
                        <h4
                          style={{
                            fontSize: "0.95rem",
                            fontWeight: 600,
                            color: "var(--text-main)",
                            textTransform: "capitalize",
                          }}
                        >
                          {voice.name}
                        </h4>
                        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          {voice.languageName}{" "}
                          {voice.countryName ? `(${voice.countryName})` : ""}
                        </p>
                      </div>

                      <span
                        style={{
                          fontSize: "0.68rem",
                          padding: "0.15rem 0.4rem",
                          borderRadius: "var(--radius-sm)",
                          background:
                            voice.quality === "high"
                              ? "rgba(168, 85, 247, 0.15)"
                              : "rgba(255, 255, 255, 0.05)",
                          color:
                            voice.quality === "high"
                              ? "var(--accent-secondary)"
                              : "var(--text-dim)",
                          textTransform: "uppercase",
                          fontWeight: 600,
                        }}
                      >
                        {voice.quality}
                      </span>
                    </div>

                    <div
                      style={{
                        fontSize: "0.72rem",
                        color: "var(--text-dim)",
                        marginTop: "0.5rem",
                        fontFamily: "monospace",
                      }}
                    >
                      {voice.id}
                    </div>
                  </div>

                  {/* Actions: Stream Sample + Download/Select */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    {/* Voice Audio Preview Button */}
                    <button
                      type="button"
                      onClick={() => handleTogglePreview(voice)}
                      disabled={previewLoadingVoiceId === voice.id || (!voice.isInstalled && !voice.sampleUrl)}
                      style={{
                        flex: 1,
                        background: isPlayingSample
                          ? "var(--accent-primary)"
                          : "rgba(255, 255, 255, 0.06)",
                        color: isPlayingSample
                          ? "#fff"
                          : !voice.isInstalled && !voice.sampleUrl
                          ? "var(--text-dim)"
                          : "var(--text-main)",
                        border: "1px solid var(--border-subtle)",
                        padding: "0.45rem 0.6rem",
                        borderRadius: "var(--radius-sm)",
                        fontSize: "0.75rem",
                        fontWeight: 500,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.4rem",
                        cursor: !voice.isInstalled && !voice.sampleUrl ? "not-allowed" : "pointer",
                        opacity: !voice.isInstalled && !voice.sampleUrl ? 0.6 : 1,
                        transition: "var(--transition)",
                      }}
                      title={
                        !voice.isInstalled && !voice.sampleUrl
                          ? "Download voice model to preview audio"
                          : "Play speech preview sample"
                      }
                    >
                      {previewLoadingVoiceId === voice.id ? (
                        <>
                          <Loader2 size={13} className="spin" />
                          <span>Generating…</span>
                        </>
                      ) : isPlayingSample ? (
                        <>
                          <Pause size={13} />
                          <span>Stop</span>
                        </>
                      ) : (
                        <>
                          <Play size={13} />
                          <span>Preview</span>
                        </>
                      )}
                    </button>

                    {/* Download or Select Button */}
                    {voice.isInstalled ? (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectVoice(voice.id);
                          handleRequestClose();
                        }}
                        style={{
                          flex: 1,
                          background: isCurrent
                            ? "var(--accent-primary)"
                            : "rgba(16, 185, 129, 0.15)",
                          color: isCurrent ? "#fff" : "var(--accent-emerald)",
                          border: `1px solid ${
                            isCurrent
                              ? "var(--accent-primary)"
                              : "rgba(16, 185, 129, 0.3)"
                          }`,
                          padding: "0.45rem 0.6rem",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "0.3rem",
                          cursor: "pointer",
                        }}
                      >
                        {isCurrent ? (
                          <>
                            <Check size={13} />
                            <span>Active</span>
                          </>
                        ) : (
                          <>
                            <Check size={13} />
                            <span>Use Voice</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isDownloading}
                        onClick={() => handleDownloadVoice(voice.id)}
                        style={{
                          flex: 1,
                          background: "var(--accent-primary-light)",
                          color: "var(--accent-primary)",
                          border: "1px solid var(--border-active)",
                          padding: "0.45rem 0.6rem",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "0.3rem",
                          cursor: isDownloading ? "not-allowed" : "pointer",
                        }}
                      >
                        {isDownloading ? (
                          <>
                            <Loader2 size={13} className="spin" />
                            <span>Downloading...</span>
                          </>
                        ) : (
                          <>
                            <Download size={13} />
                            <span>Install</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {isDownloading && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.35rem",
                      }}
                    >
                      <div
                        style={{
                          height: 6,
                          borderRadius: 999,
                          background: "rgba(255, 255, 255, 0.08)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: percent === null ? "42%" : `${percent}%`,
                            height: "100%",
                            borderRadius: 999,
                            background: "var(--accent-primary)",
                            transition: "width 180ms ease",
                          }}
                        />
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "0.5rem",
                          color: "var(--text-dim)",
                          fontSize: "0.68rem",
                          minHeight: 16,
                        }}
                      >
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {progress?.file || progress?.message || "Downloading"}
                        </span>
                        <span style={{ flexShrink: 0 }}>
                          {percent === null ? "Working" : `${percent}%`}
                        </span>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "0.5rem",
                          color: "var(--text-muted)",
                          fontSize: "0.66rem",
                        }}
                      >
                        <span>
                          {formatBytes(progress?.downloaded)}
                          {progress?.total ? ` / ${formatBytes(progress.total)}` : ""}
                        </span>
                        <span>
                          {progress?.remaining ? `${formatBytes(progress.remaining)} left` : "Finishing"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export const VoiceCatalogPane = VoiceCatalogModal;
