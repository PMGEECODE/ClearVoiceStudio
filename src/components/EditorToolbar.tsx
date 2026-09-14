import React from "react";
import { Sparkles, Copy, Check, Trash2, Mic, Square, Loader2, Volume2 } from "lucide-react";
import { QUICK_PRESETS } from "@/lib/scriptAnalysis";

interface EditorPresetsProps {
  onSelectPreset: (text: string) => void;
}

export const EditorPresets: React.FC<EditorPresetsProps> = ({ onSelectPreset }) => {
  return (
    <section className="presets-section" aria-label="Script presets">
      <span className="section-label">Quick Presets</span>
      <div className="presets-grid" role="group" aria-label="Preset samples">
        {QUICK_PRESETS.map((p, idx) => (
          <button
            key={idx}
            type="button"
            className="preset-chip"
            onClick={() => onSelectPreset(p.text)}
          >
            <Sparkles size={12} style={{ color: "var(--accent-primary)" }} aria-hidden="true" />
            <span>{p.title}</span>
          </button>
        ))}
      </div>
    </section>
  );
};

interface EditorFooterProps {
  charCount: number;
  wordCount: number;
  estSeconds: number;
  uploadedFileName: string | null;
  copied: boolean;
  onCopy: () => void;
  onClear: () => void;
  isListening: boolean;
  isMutedDictation: boolean;
  isDictationBusy: boolean;
  speechSupported: boolean;
  onToggleListening: () => void;
  onGenerate?: () => void;
  isSynthesizing?: boolean;
}

export const EditorFooter: React.FC<EditorFooterProps> = ({
  charCount,
  wordCount,
  estSeconds,
  uploadedFileName,
  copied,
  onCopy,
  onClear,
  isListening,
  isMutedDictation,
  isDictationBusy,
  speechSupported,
  onToggleListening,
  onGenerate,
  isSynthesizing = false,
}) => {
  return (
    <div className="editor-footer">
      <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
        <span>{charCount} characters</span>
        <span>•</span>
        <span>{wordCount} words</span>
        <span>•</span>
        <span>~{estSeconds}s speech</span>
        {uploadedFileName && (
          <span style={{ color: "var(--accent-primary)" }}>• [{uploadedFileName}]</span>
        )}
      </div>

      <div className="editor-actions">
        {/* Quick Generate Speech Button right on editor footer (Icon Only) */}
        {onGenerate && (
          <button
            type="button"
            className="btn-primary-icon"
            onClick={onGenerate}
            disabled={isSynthesizing || charCount === 0}
            title={isSynthesizing ? "Synthesizing voice..." : "Generate Speech"}
            aria-label="Generate speech"
          >
            {isSynthesizing ? (
              <Loader2 size={15} className="spin" aria-hidden="true" />
            ) : (
              <Volume2 size={15} aria-hidden="true" />
            )}
          </button>
        )}

        {/* Hands-Free Dictation Button in editor footer */}
        <button
          type="button"
          className={`icon-btn-ghost dictation-footer-btn ${
            isListening && !isMutedDictation ? "mic-btn-active" : ""
          } ${isDictationBusy ? "dictation-footer-btn-busy" : ""}`}
          onClick={onToggleListening}
          disabled={!speechSupported || isDictationBusy}
          title={
            !speechSupported
              ? "Voice dictation not supported in this browser"
              : isDictationBusy
              ? "Dictation is processing"
              : isListening
              ? "Stop voice dictation"
              : "Start hands-free voice dictation"
          }
          aria-label={
            isListening
              ? isMutedDictation
                ? "Dictation muted"
                : "Stop voice dictation"
              : "Start hands-free voice dictation"
          }
        >
          {isDictationBusy ? (
            <Loader2 size={14} className="spin" aria-hidden="true" />
          ) : isListening ? (
            <Square size={13} aria-hidden="true" />
          ) : (
            <Mic size={14} aria-hidden="true" />
          )}
          <span>
            {isDictationBusy
              ? "Transcribing"
              : isListening
              ? isMutedDictation
                ? "Muted"
                : "Stop"
              : "Dictate"}
          </span>
        </button>

        <button
          type="button"
          className="icon-btn-ghost"
          onClick={onCopy}
          title="Copy text to clipboard"
          aria-label="Copy script text"
        >
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>

        <button
          type="button"
          className="icon-btn-ghost"
          onClick={onClear}
          title="Clear text"
          aria-label="Clear text editor"
        >
          <Trash2 size={14} aria-hidden="true" />
          <span>Clear</span>
        </button>
      </div>
    </div>
  );
};
