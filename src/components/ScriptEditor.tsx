"use client";

import React, {
  useState,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  PenLine,
  Film,
  Plus,
  Users,
  Timer,
  Sparkles,
  Info,
  Clapperboard,
  Smile,
  Volume2,
} from "lucide-react";
import {
  SPEAKER_COLORS,
  analyzeScriptText,
  ScriptTurn,
} from "@/lib/scriptAnalysis";

// ---------------------------------------------------------------------------
// Types & Interfaces
// ---------------------------------------------------------------------------

interface ScriptEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}

// ---------------------------------------------------------------------------
// ScriptEditor Component
// ---------------------------------------------------------------------------

export function ScriptEditor({
  value,
  onChange,
  placeholder = "Enter, dictate hands-free, or paste speech script here...",
  rows = 8,
  className = "",
}: ScriptEditorProps) {
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const [cursorPos, setCursorPos] = useState<{ line: number; col: number }>({
    line: 1,
    col: 1,
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Analyze script for multi-speaker turns, characters, and stage directions
  const analysis = useMemo(() => analyzeScriptText(value), [value]);
  const hasDialogueTurns = analysis.parsedTurns.length > 0;

  // Track cursor position on click, select, keyup
  const updateCursorPos = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const pos = textarea.selectionStart;
    const textBefore = textarea.value.substring(0, pos);
    const lines = textBefore.split("\n");
    setCursorPos({
      line: lines.length,
      col: lines[lines.length - 1].length + 1,
    });
  }, []);

  // Keyboard enhancements (e.g. Tab inserts 2 spaces without losing focus)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      if (e.key === "Tab") {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const insert = "  ";
        const nextVal = value.substring(0, start) + insert + value.substring(end);
        onChange(nextVal);
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = start + insert.length;
          updateCursorPos();
        });
      }
    },
    [value, onChange, updateCursorPos]
  );

  // Helper insertion actions
  const insertTemplate = useCallback(
    (prefix: string, suffix = "", defaultSelection = "") => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = value.substring(start, end) || defaultSelection;
      const before = value.substring(0, start);
      const after = value.substring(end);

      // Check if we need a leading newline
      const needsLeadingNl = before.length > 0 && !before.endsWith("\n");
      const padPrefix = needsLeadingNl ? "\n" + prefix : prefix;
      const insertion = `${padPrefix}${selected}${suffix}`;
      const nextVal = before + insertion + after;

      onChange(nextVal);
      textarea.focus();

      requestAnimationFrame(() => {
        const newStart = start + padPrefix.length;
        const newEnd = newStart + selected.length;
        textarea.setSelectionRange(newStart, newEnd);
        updateCursorPos();
      });
    },
    [value, onChange, updateCursorPos]
  );

  const insertSpeaker = useCallback(() => {
    insertTemplate("**SPEAKER:** ", "", "SPEAKER");
  }, [insertTemplate]);

  const insertDirection = useCallback(() => {
    insertTemplate("[", "]", "quietly");
  }, [insertTemplate]);

  const insertPause = useCallback(() => {
    insertTemplate("\n[pause 1.0s]\n", "", "");
  }, [insertTemplate]);

  return (
    <div className={`script-studio-root ${className}`}>
      {/* Studio Header Toolbar */}
      <div className="script-studio-header">
        <div className="script-studio-header-left">
          <div className="script-studio-badge">
            {hasDialogueTurns ? (
              <>
                <Users size={13} className="script-studio-badge-icon" />
                <span className="script-studio-badge-title">
                  {analysis.speakers.length} Speaker
                  {analysis.speakers.length === 1 ? "" : "s"}
                </span>
                <span className="script-studio-badge-detail">
                  • {analysis.turns} Turn{analysis.turns === 1 ? "" : "s"}
                </span>
              </>
            ) : (
              <>
                <Volume2 size={13} className="script-studio-badge-icon single" />
                <span className="script-studio-badge-title">Narrative Script</span>
              </>
            )}
          </div>

          {/* Quick Script Formatting Helpers */}
          <div className="script-studio-actions">
            <button
              type="button"
              className="script-format-btn"
              onClick={insertSpeaker}
              title="Insert Speaker tag: **NAME:**"
            >
              <Plus size={12} />
              <span>Speaker</span>
            </button>
            <button
              type="button"
              className="script-format-btn"
              onClick={insertDirection}
              title="Insert Emotion / Stage Direction: [direction]"
            >
              <Plus size={12} />
              <span>Direction</span>
            </button>
            <button
              type="button"
              className="script-format-btn"
              onClick={insertPause}
              title="Insert Dramatic Pause: [pause 1.0s]"
            >
              <Timer size={12} />
              <span>Pause</span>
            </button>
          </div>
        </div>

        {/* View Mode Toggle: Edit vs Screenplay Preview */}
        {hasDialogueTurns && (
          <div className="script-studio-view-toggle">
            <button
              type="button"
              className={`script-toggle-tab ${viewMode === "edit" ? "active" : ""}`}
              onClick={() => setViewMode("edit")}
              title="Write and edit raw script"
            >
              <PenLine size={13} />
              <span>Write</span>
            </button>
            <button
              type="button"
              className={`script-toggle-tab ${viewMode === "preview" ? "active" : ""}`}
              onClick={() => setViewMode("preview")}
              title="Preview formatted screenplay dialogue"
            >
              <Film size={13} />
              <span>Screenplay</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Editing Surface */}
      {viewMode === "edit" ? (
        <div className="script-studio-editor-wrap">
          <textarea
            ref={textareaRef}
            className="editor-textarea script-studio-textarea"
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              updateCursorPos();
            }}
            onKeyDown={handleKeyDown}
            onClick={updateCursorPos}
            onKeyUp={updateCursorPos}
            onSelect={updateCursorPos}
            placeholder={placeholder}
            rows={rows}
            spellCheck={false}
          />
        </div>
      ) : (
        /* Screenplay Preview View */
        <ScriptDialoguePreview
          analysis={analysis}
          rawText={value}
          onSwitchToEdit={() => setViewMode("edit")}
        />
      )}

      {/* Cast & Status Footer Bar */}
      <div className="script-studio-footer">
        {hasDialogueTurns ? (
          <div className="script-studio-cast-pills">
            <span className="script-cast-label">Cast:</span>
            {analysis.speakers.map((s) => {
              const c = SPEAKER_COLORS[s.colorIndex % SPEAKER_COLORS.length];
              return (
                <span
                  key={s.key}
                  className="script-cast-pill"
                  style={{
                    color: c.color,
                    background: c.bg,
                    borderColor: c.border,
                  }}
                  title={`${s.label}: ${s.turns} turn(s)${s.gender ? ` • ${s.gender}` : ""}`}
                >
                  <span
                    className="script-cast-dot"
                    style={{ background: c.color }}
                  />
                  <strong>{s.label}</strong>
                  <span className="script-cast-turns">({s.turns})</span>
                </span>
              );
            })}
          </div>
        ) : (
          <div className="script-studio-hint">
            <Info size={12} />
            <span>
              Tip: Format multi-character dialogues using <code>**NAME:** Speech</code>
            </span>
          </div>
        )}

        <div className="script-studio-status">
          <span className="script-cursor-pos">
            Ln {cursorPos.line}, Col {cursorPos.col}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screenplay Dialogue Preview Component
// ---------------------------------------------------------------------------

interface ScriptDialoguePreviewProps {
  analysis: ReturnType<typeof analyzeScriptText>;
  rawText: string;
  onSwitchToEdit: () => void;
}

function ScriptDialoguePreview({
  analysis,
  rawText,
  onSwitchToEdit,
}: ScriptDialoguePreviewProps) {
  // Extract scene title if present
  const sceneHeading = useMemo(() => {
    const match = rawText.match(/\*{0,2}\[?(?:scene|act|chapter)[^\]\n]+\]?\*{0,2}/i);
    return match ? match[0].replace(/^\*+|\*+$/g, "") : null;
  }, [rawText]);

  return (
    <div className="script-dialogue-preview">
      {/* Scene Banner */}
      {sceneHeading && (
        <div className="script-preview-scene-slate">
          <Clapperboard size={15} />
          <span>{sceneHeading}</span>
        </div>
      )}

      {/* Character Bios Card (if detected) */}
      {analysis.characterBios && Object.keys(analysis.characterBios).length > 0 && (
        <div className="script-preview-bios">
          <div className="script-preview-bios-title">
            <Sparkles size={13} />
            <span>Character Roster</span>
          </div>
          <div className="script-preview-bios-grid">
            {Object.entries(analysis.characterBios).map(([name, bio]) => (
              <div key={name} className="script-bio-item">
                <span className="script-bio-name">{name}</span>
                <span className="script-bio-desc">{bio}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dialogue Turn Cards */}
      <div className="script-preview-turns">
        {analysis.parsedTurns.map((turn: ScriptTurn, idx: number) => {
          const color = SPEAKER_COLORS[turn.colorIndex % SPEAKER_COLORS.length];

          if (turn.isPause) {
            return (
              <div key={idx} className="script-preview-pause-row">
                <Timer size={13} />
                <span>
                  Dramatic Pause ({turn.pauseDuration ?? 1.0}s)
                </span>
              </div>
            );
          }

          return (
            <div
              key={idx}
              className="script-preview-turn-card"
              style={{ borderLeftColor: color.color }}
            >
              <div className="script-preview-turn-header">
                <div className="script-preview-speaker-tag">
                  <span
                    className="script-speaker-avatar"
                    style={{ background: color.color }}
                  >
                    {turn.speakerLabel.charAt(0).toUpperCase()}
                  </span>
                  <span
                    className="script-speaker-name"
                    style={{ color: color.color }}
                  >
                    {turn.speakerLabel}
                  </span>
                  {turn.gender && (
                    <span className="script-gender-tag">{turn.gender}</span>
                  )}
                </div>

                {turn.emotionBadge && (
                  <span
                    className="script-emotion-badge"
                    style={{
                      color: turn.emotionBadge.color,
                      background: turn.emotionBadge.bg,
                      borderColor: turn.emotionBadge.border,
                    }}
                  >
                    <Smile size={11} />
                    <span>{turn.emotionBadge.label}</span>
                  </span>
                )}
              </div>

              {/* Stage directions / cues if present */}
              {turn.emotionCues && turn.emotionCues.length > 0 && (
                <div className="script-stage-directions">
                  {turn.emotionCues.map((cue, cIdx) => (
                    <span key={cIdx} className="script-stage-cue">
                      [{cue}]
                    </span>
                  ))}
                </div>
              )}

              {/* Spoken Dialogue Text */}
              <p className="script-dialogue-text">{turn.text}</p>
            </div>
          );
        })}
      </div>

      <div className="script-preview-footer-action">
        <button
          type="button"
          className="btn-primary-mini"
          onClick={onSwitchToEdit}
        >
          <PenLine size={13} />
          <span>Return to Raw Script Editor</span>
        </button>
      </div>
    </div>
  );
}
