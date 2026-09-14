import React from "react";
import { Users, Volume2 } from "lucide-react";
import { ScriptAnalysis } from "@/lib/scriptAnalysis";
import { VoiceModelInfo } from "@/app/api/voices/route";
import { CastVoiceSelect } from "./CastVoiceSelect";

interface CastVoiceManagerProps {
  analysis: ScriptAnalysis;
  castVoiceMap: Record<string, string>;
  onCastVoiceChange: (speakerKey: string, voiceId: string) => void;
  voices: VoiceModelInfo[];
  currentVoice: string;
  disabled?: boolean;
}

export const CastVoiceManager: React.FC<CastVoiceManagerProps> = ({
  analysis,
  castVoiceMap,
  onCastVoiceChange,
  voices,
  currentVoice,
  disabled = false,
}) => {
  const isDialogue = analysis.mode === "dialogue";

  return (
    <section
      aria-label={isDialogue ? "Multi-speaker cast assignments" : "Voice narration details"}
      className={`script-analysis-panel ${
        isDialogue ? "script-analysis-dialogue" : "script-analysis-single"
      }`}
    >
      <div className="script-analysis-head">
        <div className="script-analysis-icon">
          {isDialogue ? (
            <Users size={18} aria-hidden="true" />
          ) : (
            <Volume2 size={18} aria-hidden="true" />
          )}
        </div>
        <div>
          <h4>{isDialogue ? "Multi-speaker script" : "Single narration"}</h4>
          <p>{analysis.reason}</p>
        </div>
      </div>

      {isDialogue ? (
        <div className="cast-grid">
          {analysis.speakers.map((speaker, index) => {
            // Extract trailing number from label e.g. "Speaker 2" → "2"
            const avatarNum = speaker.label.match(/(\d+)\s*$/)?.[1] ?? String(index + 1);
            return (
              <div className="cast-row" key={speaker.key}>
              {/* Speaker identity */}
              <div className="cast-speaker">
                <span className="cast-avatar" aria-hidden="true">
                  {avatarNum}
                </span>
                <div>
                  <strong>{speaker.label}</strong>
                  <span>
                    {speaker.turns} turn{speaker.turns === 1 ? "" : "s"}
                    {speaker.gender ? ` • ${speaker.gender}` : ""}
                  </span>
                </div>
              </div>

              {/* Custom voice selector with preview */}
              <CastVoiceSelect
                speakerKey={speaker.key}
                voices={voices}
                value={castVoiceMap[speaker.key] || currentVoice}
                disabled={disabled}
                onChange={(voiceId) => onCastVoiceChange(speaker.key, voiceId)}
              />
            </div>
            );
          })}
        </div>
      ) : (
        <div className="single-voice-row">
          <span>Voice in use</span>
          <strong>{currentVoice}</strong>
        </div>
      )}
    </section>
  );
};
