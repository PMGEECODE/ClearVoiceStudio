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
} from "lucide-react";
import { CatalogVoice } from "@/app/api/catalog/route";

interface VoiceCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectVoice: (voiceId: string) => void;
  currentVoiceId: string;
  onVoiceDownloaded: () => void;
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
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Audio Preview State
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const stopPreview = useCallback(() => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
    }
    setPreviewingVoiceId(null);
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

  useEffect(() => {
    if (isOpen) {
      fetchCatalog();
    } else {
      stopPreview();
    }
  }, [isOpen, fetchCatalog, stopPreview]);

  const handleTogglePreview = (voice: CatalogVoice) => {
    if (previewingVoiceId === voice.id) {
      stopPreview();
      return;
    }

    if (!previewAudioRef.current) {
      previewAudioRef.current = new Audio();
      previewAudioRef.current.onended = () => setPreviewingVoiceId(null);
      previewAudioRef.current.onerror = () => {
        setPreviewingVoiceId(null);
      };
    }

    previewAudioRef.current.src = voice.sampleUrl;
    previewAudioRef.current.play().then(() => {
      setPreviewingVoiceId(voice.id);
    }).catch(() => {
      setPreviewingVoiceId(null);
    });
  };

  const handleDownloadVoice = async (voiceId: string) => {
    setDownloadingVoiceId(voiceId);
    setDownloadError(null);
    try {
      const res = await fetch("/api/download-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice: voiceId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Download failed");
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
    } finally {
      setDownloadingVoiceId(null);
    }
  };

  if (!isOpen) return null;

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

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(3, 7, 18, 0.82)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: "1.5rem",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          stopPreview();
          onClose();
        }
      }}
    >
      <div
        className="glass-card"
        style={{
          width: "100%",
          maxWidth: "880px",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          backgroundColor: "#0d1322",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
        }}
      >
        {/* Modal Header */}
        <div className="card-header" style={{ padding: "1.25rem 1.5rem" }}>
          <div className="card-title-group">
            <Globe size={20} style={{ color: "var(--accent-primary)" }} />
            <div>
              <h2 className="card-title" style={{ fontSize: "1.15rem" }}>
                ClearVoice Catalog & Stream Preview
              </h2>
              <p className="card-desc">
                Listen to voice samples and install neural models locally
              </p>
            </div>
          </div>

          <button
            type="button"
            className="icon-btn-ghost"
            onClick={() => {
              stopPreview();
              onClose();
            }}
            style={{ width: 34, height: 34, justifyContent: "center" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div
          style={{
            padding: "1rem 1.5rem",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            background: "rgba(0, 0, 0, 0.2)",
          }}
        >
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
                fontSize: "0.9rem",
                backgroundColor: "rgba(18, 26, 44, 0.8)",
              }}
            />
          </div>

          {/* Filter Pills */}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {[
              { id: "all", label: "All Voices" },
              { id: "en_us", label: "🇺🇸 English (US)" },
              { id: "en_gb", label: "🇬🇧 English (UK)" },
              { id: "installed", label: "✓ Installed Locally" },
              { id: "high_quality", label: "⭐ High Quality" },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                className={`tab-btn ${selectedFilter === f.id ? "active" : ""}`}
                onClick={() => setSelectedFilter(f.id)}
                style={{ fontSize: "0.75rem", padding: "0.3rem 0.65rem" }}
              >
                {f.label}
              </button>
            ))}
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
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "1.25rem 1.5rem",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
            gap: "1rem",
          }}
        >
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

              return (
                <div
                  key={voice.id}
                  style={{
                    borderRadius: "var(--radius-md)",
                    padding: "1rem",
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
                    gap: "0.85rem",
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
                    {/* Stream Sample Preview Button */}
                    <button
                      type="button"
                      onClick={() => handleTogglePreview(voice)}
                      style={{
                        flex: 1,
                        background: isPlayingSample
                          ? "var(--accent-primary)"
                          : "rgba(255, 255, 255, 0.06)",
                        color: isPlayingSample ? "#fff" : "var(--text-main)",
                        border: "1px solid var(--border-subtle)",
                        padding: "0.45rem 0.6rem",
                        borderRadius: "var(--radius-sm)",
                        fontSize: "0.75rem",
                        fontWeight: 500,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.4rem",
                        cursor: "pointer",
                        transition: "var(--transition)",
                      }}
                      title="Stream voice audio sample"
                    >
                      {isPlayingSample ? (
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
                          onClose();
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
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
