"use client";

import React from "react";
import { Sliders, RotateCcw, Gauge, Sparkles, DownloadCloud, Waves } from "lucide-react";
import { VoiceModelInfo } from "../app/api/voices/route";
import { PROSODY_PROFILES, ProsodyProfileId } from "@/lib/prosody";

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
  const currentVoice = voices.find((v) => v.id === config.voice) || voices[0];

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
    });
  };

  return (
    <div className="glass-card">
      <div className="card-header">
        <div className="card-title-group">
          <Sliders size={18} style={{ color: "var(--accent-primary)" }} />
          <div>
            <h3 className="card-title">Voice & Tuning</h3>
            <p className="card-desc">Neural voice model & acoustic settings</p>
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
            <select
              className="select-input"
              value={config.voice}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  ...config,
                  voice: e.target.value,
                  speakerId: 0,
                })
              }
              style={{ flex: 1 }}
            >
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.id} ({v.quality} • {v.sampleRate}Hz)
                </option>
              ))}
            </select>

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
              }}
              title="Browse and download 170+ voices with streaming preview"
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
              <span className="setting-value">{config.speakerId}</span>
            </div>
            <select
              className="select-input"
              value={config.speakerId}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  ...config,
                  speakerId: parseInt(e.target.value, 10),
                })
              }
            >
              {Array.from({ length: currentVoice.numSpeakers }, (_, i) => (
                <option key={i} value={i}>
                  Speaker #{i}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Speed / Phoneme Length Scale */}
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
          <select
            className="select-input"
            value={config.prosodyProfile}
            disabled={disabled || !config.prosodyEnabled}
            onChange={(e) =>
              onChange({ ...config, prosodyProfile: e.target.value as ProsodyProfileId })
            }
          >
            {Object.values(PROSODY_PROFILES).map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.label}
              </option>
            ))}
          </select>
        </div>

        {process.env.NODE_ENV !== "production" && (
          <div className="settings-group">
            <div className="setting-header">
              <span className="setting-title">Prosody Debug Headers</span>
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

        {/* Speed / Phoneme Length Scale */}
        <div className="settings-group">
          <div className="setting-header">
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <Gauge size={14} style={{ color: "var(--text-muted)" }} />
              <span className="setting-title">Speech Rate (Length Scale)</span>
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

        {/* Expressiveness / Noise Scale */}
        <div className="settings-group">
          <div className="setting-header">
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <Sparkles size={14} style={{ color: "var(--text-muted)" }} />
              <span className="setting-title">Noise Scale (Inflection)</span>
            </div>
            <span className="setting-value">{config.noiseScale.toFixed(3)}</span>
          </div>
          <input
            type="range"
            min="0.2"
            max="1.2"
            step="0.02"
            disabled={disabled}
            className="range-slider"
            value={config.noiseScale}
            onChange={(e) =>
              onChange({ ...config, noiseScale: parseFloat(e.target.value) })
            }
          />
        </div>

        {/* Phoneme Width Noise */}
        <div className="settings-group">
          <div className="setting-header">
            <span className="setting-title">Phoneme Width (Noise W)</span>
            <span className="setting-value">{config.noiseWScale.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0.2"
            max="1.2"
            step="0.05"
            disabled={disabled}
            className="range-slider"
            value={config.noiseWScale}
            onChange={(e) =>
              onChange({ ...config, noiseWScale: parseFloat(e.target.value) })
            }
          />
        </div>

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
      </div>
    </div>
  );
};
