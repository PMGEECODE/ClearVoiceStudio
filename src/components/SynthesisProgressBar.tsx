import React from "react";
import { Check, Loader2 } from "lucide-react";
import { SynthesisProgressState } from "@/lib/scriptAnalysis";

interface SynthesisProgressBarProps {
  progress: SynthesisProgressState;
}

export const SynthesisProgressBar: React.FC<SynthesisProgressBarProps> = ({ progress }) => {
  if (!progress) return null;

  const isComplete = progress.percent >= 100;

  return (
    <section
      role="status"
      aria-live="polite"
      aria-label="Speech synthesis progress"
      className="synthesis-progress-panel"
    >
      <div className="synthesis-progress-icon">
        {isComplete ? (
          <Check size={18} aria-hidden="true" />
        ) : (
          <Loader2 size={18} className="spin" aria-hidden="true" />
        )}
      </div>
      <div className="synthesis-progress-body">
        <div className="synthesis-progress-topline">
          <span className="synthesis-progress-title">{progress.label}</span>
          <div className="synthesis-progress-meta">
            <span>{progress.percent}%</span>
            <span>{progress.elapsedSeconds}s</span>
            {progress.turns > 1 && <span>{progress.turns} turns</span>}
          </div>
        </div>
        <p>{progress.detail}</p>
        <div
          className="synthesis-progress-track"
          role="progressbar"
          aria-valuenow={progress.percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="synthesis-progress-fill"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      </div>
    </section>
  );
};
