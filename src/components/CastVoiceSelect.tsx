"use client";

import React, { useCallback, useRef, useState } from "react";
import { ChevronDown, Loader2, Play, Square } from "lucide-react";
import { VoiceModelInfo } from "@/app/api/voices/route";

const PREVIEW_TEXT = "Hello! This is a preview of the selected voice.";

interface CastVoiceSelectProps {
  speakerKey: string;
  voices: VoiceModelInfo[];
  value: string;
  disabled?: boolean;
  onChange: (voiceId: string) => void;
}

type PreviewState = "idle" | "loading" | "playing";

export const CastVoiceSelect: React.FC<CastVoiceSelectProps> = ({
  speakerKey,
  voices,
  value,
  disabled = false,
  onChange,
}) => {
  const [open, setOpen] = useState(false);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<PreviewState>("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const selectedVoice = voices.find((v) => v.id === value) ?? voices[0];

  // ── Close on outside click ─────────────────────────────────────
  const handleBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    if (!rootRef.current?.contains(e.relatedTarget as Node)) {
      setOpen(false);
    }
  }, []);

  // ── Stop current playback ──────────────────────────────────────
  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setPreviewState("idle");
    setPreviewingId(null);
  }, []);

  // ── Preview a voice (does NOT select it) ──────────────────────
  const handlePreview = useCallback(
    async (e: React.MouseEvent, voiceId: string) => {
      e.stopPropagation();

      // If already previewing this voice, stop it
      if (previewingId === voiceId && previewState !== "idle") {
        stopAudio();
        return;
      }

      // Stop any other previewing voice first
      stopAudio();

      setPreviewingId(voiceId);
      setPreviewState("loading");

      try {
        const res = await fetch("/api/synthesize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: PREVIEW_TEXT,
            voice: voiceId,
            speaker_id: 0,
            length_scale: 1.0,
            noise_scale: 0.667,
            noise_w_scale: 0.8,
            sentence_silence: 0.1,
            prosody_enabled: false,
          }),
        });

        if (!res.ok) throw new Error(`${res.status}`);

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;

        audio.onended = () => {
          URL.revokeObjectURL(url);
          setPreviewState("idle");
          setPreviewingId(null);
          audioRef.current = null;
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          setPreviewState("idle");
          setPreviewingId(null);
          audioRef.current = null;
        };

        await audio.play();
        setPreviewState("playing");
      } catch {
        setPreviewState("idle");
        setPreviewingId(null);
      }
    },
    [previewingId, previewState, stopAudio]
  );

  // ── Select a voice (stops preview, closes dropdown) ───────────
  const handleSelect = useCallback(
    (voiceId: string) => {
      stopAudio();
      onChange(voiceId);
      setOpen(false);
    },
    [onChange, stopAudio]
  );

  return (
    <div
      className="cvo-root"
      ref={rootRef}
      onBlur={handleBlur}
      tabIndex={-1}
    >
      {/* Trigger */}
      <button
        type="button"
        id={`cast-voice-select-${speakerKey}`}
        className={`cvo-trigger ${open ? "cvo-trigger--open" : ""}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((p) => !p)}
      >
        <span className="cvo-trigger-name">{selectedVoice?.id ?? value}</span>
        <ChevronDown size={12} className={`cvo-chevron ${open ? "cvo-chevron--open" : ""}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="cvo-dropdown" role="listbox" aria-label="Select voice">
          {voices.map((voice) => {
            const isSelected = voice.id === value;
            const isPreviewing = previewingId === voice.id;
            const isLoading = isPreviewing && previewState === "loading";
            const isPlaying = isPreviewing && previewState === "playing";

            return (
              <div
                key={voice.id}
                className={`cvo-option ${isSelected ? "cvo-option--selected" : ""}`}
                role="option"
                aria-selected={isSelected}
              >
                {/* Clicking the text/label area selects the voice */}
                <button
                  type="button"
                  className="cvo-option-label"
                  onClick={() => handleSelect(voice.id)}
                  tabIndex={0}
                >
                  <span className="cvo-option-name">{voice.id}</span>
                  <span className="cvo-option-meta">
                    {voice.quality} · {voice.language ?? "en"} · {voice.sampleRate}Hz
                  </span>
                </button>

                {/* Play/stop preview — does not select */}
                <button
                  type="button"
                  className={`cvo-play-btn ${isPreviewing && previewState !== "idle" ? "cvo-play-btn--active" : ""}`}
                  onClick={(e) => handlePreview(e, voice.id)}
                  title={isPlaying ? "Stop preview" : "Preview voice"}
                  aria-label={isPlaying ? `Stop preview of ${voice.id}` : `Preview ${voice.id}`}
                >
                  {isLoading ? (
                    <Loader2 size={11} className="cvo-spin" />
                  ) : isPlaying ? (
                    <Square size={10} />
                  ) : (
                    <Play size={10} />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
