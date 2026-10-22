"use client";

import React, { useMemo, useState } from "react";
import {
  Sliders,
  RotateCcw,
  Gauge,
  Sparkles,
  DownloadCloud,
  Waves,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
} from "lucide-react";
import { VoiceModelInfo } from "../app/api/voices/route";
import { PROSODY_PROFILES, ProsodyProfileId } from "@/lib/prosody";
import { CustomSelect, SelectOption } from "./CustomSelect";

export interface VoiceConfigState {
  voice: string;
  speakerId: number;
  lengthScale: number; // Speed: smaller = faster, 1.0 = normal, larger = slower
  noiseScale: number;
  noiseWScale: number;
  sentenceSilence: number;
  prosodyEnabled: boolean;
  prosodyProfile: ProsodyProfileId;
  prosodyDebug: boolean;
  emotionEnabled: boolean;
  emotionIntensity: number;
}

interface VoiceSettingsProps {
  voices: VoiceModelInfo[];
  config: VoiceConfigState;
  onChange: (newConfig: VoiceConfigState) => void;
  onOpenCatalog: () => void;
  disabled?: boolean;
}

export const VoiceSettings: React.FC<VoiceSettingsProps> = ({
  voices,
  config,
  onChange,
  onOpenCatalog,
  disabled = false,
}) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const currentVoice = voices.find((v) => v.id === config.voice) || voices[0];

  const voiceOptions = useMemo<SelectOption<string>[]>(() => {
    return voices.map((v) => ({
      value: v.id,
      label: v.id,
      sublabel: `${v.quality} • ${v.sampleRate}Hz`,
      badge: v.quality,
    }));
  }, [voices]);

  const speakerOptions = useMemo<SelectOption<number>[]>(() => {
    if (!currentVoice || currentVoice.numSpeakers <= 1) return [];
    return Array.from({ length: currentVoice.numSpeakers }, (_, i) => ({
      value: i,
      label: `Speaker #${i}`,
    }));
  }, [currentVoice]);

  const prosodyOptions = useMemo<SelectOption<ProsodyProfileId>[]>(() => {
    return Object.values(PROSODY_PROFILES).map((profile) => ({
      value: profile.id,
      label: profile.label,
      badge: profile.emphasis,
    }));
  }, []);

  const handleReset = () => {
    onChange({
      voice: config.voice,
      speakerId: 0,
      lengthScale: 1.0,
      noiseScale: 0.667,
      noiseWScale: 0.8,
      sentenceSilence: 0.2,
      prosodyEnabled: true,
      prosodyProfile: "conversational",
      prosodyDebug: false,
      emotionEnabled: true,
      emotionIntensity: 0.7,
    });
  };

  const handleNaturalPreset = () => {
    onChange({
      ...config,
      lengthScale: 1.08,
      noiseScale: 0.72,
      noiseWScale: 0.85,
      sentenceSilence: 0.28,
      prosodyEnabled: true,
      prosodyProfile: "conversational",
      emotionEnabled: true,
      emotionIntensity: 0.7,
    });
  };

  return (
    <div className="glass-card">
      <div className="card-header">
        <div className="card-title-group">
          <Sliders size={18} style={{ color: "var(--accent-primary)" }} />
          <div>
            <h3 className="card-title">Voice &amp; Tuning</h3>
            <p className="card-desc">Neural voice model &amp; acoustic settings</p>
          </div>
        </div>

        <button
          type="button"
          className="icon-btn-ghost"
          onClick={handleReset}
          disabled={disabled}
          title="Reset to default synthesis settings"
        >
          <RotateCcw size={14} />
          <span>Reset</span>
        </button>

        <button
          type="button"
          className="icon-btn-ghost"
          onClick={handleNaturalPreset}
          disabled={disabled}
          title="Apply a warmer conversational tuning preset"
        >
          <Sparkles size={14} />
          <span>Natural</span>
        </button>
      </div>

      <div className="card-body">
        {/* Voice Model Selector with Quick Add */}
        <div className="settings-group">
          <div className="setting-header">
            <span className="setting-title">Voice Model</span>
            <span className="setting-value">{currentVoice?.language || "English"}</span>
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <CustomSelect<string>
                value={config.voice}
                options={voiceOptions}
                disabled={disabled}
                onChange={(newVoice) =>
                  onChange({
                    ...config,
                    voice: newVoice,
                    speakerId: 0,
                  })
                }
                title="Select active neural TTS voice model"
              />
            </div>

            <button
              type="button"
              className="tab-btn active"
              onClick={onOpenCatalog}
              style={{
                background: "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                fontSize: "0.8rem",
                padding: "0.4rem 0.75rem",
                whiteSpace: "nowrap",
                borderRadius: "var(--radius-sm)",
              }}
              title="Browse and download neural voices from the catalog"
            >
              <DownloadCloud size={15} />
              <span>Catalog</span>
            </button>
          </div>
        </div>

        {/* Multi-speaker selector if available */}
        {currentVoice && currentVoice.numSpeakers > 1 && (
          <div className="settings-group">
            <div className="setting-header">
              <span className="setting-title">Speaker ID</span>
              <span className="setting-value">Speaker #{config.speakerId}</span>
            </div>
            <CustomSelect<number>
              value={config.speakerId}
              options={speakerOptions}
              disabled={disabled}
              onChange={(newSpeakerId) =>
                onChange({
                  ...config,
                  speakerId: newSpeakerId,
                })
              }
              title="Select speaker voice persona"
            />
          </div>
        )}

        {/* Prosody Profile */}
        <div className="settings-group">
          <div className="setting-header">
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <Waves size={14} style={{ color: "var(--text-muted)" }} />
              <span className="setting-title">Prosody Profile</span>
            </div>
            <label className="toggle-switch" title="Enable natural speech preprocessing">
              <input
                type="checkbox"
                checked={config.prosodyEnabled}
                disabled={disabled}
                onChange={(e) => onChange({ ...config, prosodyEnabled: e.target.checked })}
              />
              <span className="slider-toggle" />
            </label>
          </div>
          <CustomSelect<ProsodyProfileId>
            value={config.prosodyProfile}
            options={prosodyOptions}
            disabled={disabled || !config.prosodyEnabled}
            onChange={(newProfile) =>
              onChange({ ...config, prosodyProfile: newProfile })
            }
            title="Select expressive speech prosody contour"
          />
        </div>

        <div className="settings-group">
          <div className="setting-header">
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <Sparkles size={14} style={{ color: "var(--accent-primary)" }} />
              <span className="setting-title">Emotion-aware delivery</span>
            </div>
            <label className="toggle-switch" title="Adapt pacing and pauses to each sentence while keeping the selected voice">
              <input
                type="checkbox"
                checked={config.emotionEnabled}
                disabled={disabled}
                onChange={(e) => onChange({ ...config, emotionEnabled: e.target.checked })}
              />
              <span className="slider-toggle" />
            </label>
          </div>
          <input
            type="range"
            min="0"
            max="1.5"
            step="0.05"
            disabled={disabled || !config.emotionEnabled}
            className="range-slider"
            value={config.emotionIntensity}
            onChange={(e) => onChange({ ...config, emotionIntensity: parseFloat(e.target.value) })}
            aria-label="Emotion delivery intensity"
          />
          <p style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginTop: "0.2rem" }}>
            {config.emotionIntensity.toFixed(2)}× — set to 0 for the fastest standard Kokoro path; your selected voice never changes.
          </p>
        </div>

        {/* Speech Rate / Length Scale */}
        <div className="settings-group">
          <div className="setting-header">
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <Gauge size={14} style={{ color: "var(--text-muted)" }} />
              <span className="setting-title">Speech Rate</span>
            </div>
            <span className="setting-value">{config.lengthScale.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="1.8"
            step="0.05"
            disabled={disabled}
            className="range-slider"
            value={config.lengthScale}
            onChange={(e) =>
              onChange({ ...config, lengthScale: parseFloat(e.target.value) })
            }
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.72rem",
              color: "var(--text-dim)",
              marginTop: "0.25rem",
            }}
          >
            <span>Faster (0.5x)</span>
            <span>Normal (1.0x)</span>
            <span>Slower (1.8x)</span>
          </div>
        </div>

        {/* Pause Between Sentences */}
        <div className="settings-group">
          <div className="setting-header">
            <span className="setting-title">Pause Between Sentences</span>
            <span className="setting-value">{config.sentenceSilence.toFixed(2)}s</span>
          </div>
          <input
            type="range"
            min="0"
            max="0.8"
            step="0.05"
            disabled={disabled}
            className="range-slider"
            value={config.sentenceSilence}
            onChange={(e) =>
              onChange({ ...config, sentenceSilence: parseFloat(e.target.value) })
            }
          />
        </div>

        {/* Advanced Acoustic Controls — progressively disclosed */}
        <div className="settings-group" style={{ padding: 0, border: "none" }}>
          <button
            type="button"
            onClick={() => setAdvancedOpen((prev) => !prev)}
            disabled={disabled}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              width: "100%",
              background: "transparent",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              padding: "0.4rem 0.65rem",
              fontSize: "0.78rem",
              color: "var(--text-muted)",
              cursor: disabled ? "not-allowed" : "pointer",
              transition: "var(--transition)",
            }}
            title="Toggle advanced acoustic noise parameters"
          >
            <SlidersHorizontal size={13} style={{ color: "var(--accent-primary)" }} />
            <span style={{ flex: 1, textAlign: "left", fontWeight: 500 }}>Advanced Acoustic</span>
            {advancedOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          {advancedOpen && (
            <div
              style={{
                marginTop: "0.75rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.85rem",
                padding: "0.75rem",
                background: "rgba(10, 14, 23, 0.5)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              {/* Noise Scale */}
              <div>
                <div className="setting-header" style={{ marginBottom: "0.4rem" }}>
                  <span className="setting-title" style={{ fontSize: "0.78rem" }}>
                    Noise Scale
                  </span>
                  <span className="setting-value">{config.noiseScale.toFixed(3)}</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.01"
                  disabled={disabled}
                  className="range-slider"
                  value={config.noiseScale}
                  onChange={(e) =>
                    onChange({ ...config, noiseScale: parseFloat(e.target.value) })
                  }
                />
                <p style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginTop: "0.2rem" }}>
                  Controls phoneme-level variability. Lower = more stable, higher = more expressive.
                </p>
              </div>

              {/* Noise W Scale */}
              <div>
                <div className="setting-header" style={{ marginBottom: "0.4rem" }}>
                  <span className="setting-title" style={{ fontSize: "0.78rem" }}>
                    Noise W Scale
                  </span>
                  <span className="setting-value">{config.noiseWScale.toFixed(3)}</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.01"
                  disabled={disabled}
                  className="range-slider"
                  value={config.noiseWScale}
                  onChange={(e) =>
                    onChange({ ...config, noiseWScale: parseFloat(e.target.value) })
                  }
                />
                <p style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginTop: "0.2rem" }}>
                  Controls duration-level variability. Higher = more natural rhythm variation.
                </p>
              </div>

              {/* Prosody Debug — dev only */}
              {process.env.NODE_ENV !== "production" && (
                <div>
                  <div className="setting-header">
                    <span className="setting-title" style={{ fontSize: "0.78rem" }}>
                      Prosody Debug Headers
                    </span>
                    <label className="toggle-switch" title="Attach development-only prosody metadata headers">
                      <input
                        type="checkbox"
                        checked={config.prosodyDebug}
                        disabled={disabled || !config.prosodyEnabled}
                        onChange={(e) => onChange({ ...config, prosodyDebug: e.target.checked })}
                      />
                      <span className="slider-toggle" />
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
