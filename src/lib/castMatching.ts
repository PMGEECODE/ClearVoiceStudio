import { VoiceModelInfo } from "@/app/api/voices/route";
import { ScriptSpeaker, inferGenderFromSpeaker, inferDialectFromSpeaker } from "./scriptAnalysis";

export interface SpeakerMatchCriteria {
  label?: string;
  key?: string;
  gender?: "male" | "female";
  dialect?: string;
}

/**
 * Intelligently picks the best neural voice for a speaker based on:
 * 1. Detected gender (male / female) — NEVER assigns female voice to male speaker or vice versa if matching voices exist.
 * 2. Detected dialect (US vs UK / British / Northern).
 * 3. Installation status (prioritizes locally installed voices so synthesis works out-of-the-box).
 * 4. Deduplication (distributes voices across speakers so each character sounds distinct).
 */
export function matchVoiceForSpeaker(
  speaker: SpeakerMatchCriteria,
  speakerIndex: number,
  usedVoiceIds: Set<string>,
  availableVoices: VoiceModelInfo[],
  fallbackVoiceId: string = "af_heart"
): string {
  if (!availableVoices || availableVoices.length === 0) {
    return fallbackVoiceId;
  }

  const rawLabel = speaker.label || speaker.key || "";
  const inferredGender: "male" | "female" | undefined =
    speaker.gender || inferGenderFromSpeaker(rawLabel);

  const rawDialect = (speaker.dialect || "").toLowerCase();
  const lowerLabel = rawLabel.toLowerCase();
  const isUK =
    rawDialect === "gb" ||
    rawDialect === "northern" ||
    lowerLabel.includes("uk") ||
    lowerLabel.includes("gb") ||
    lowerLabel.includes("british") ||
    lowerLabel.includes("london") ||
    lowerLabel.includes("northern") ||
    inferDialectFromSpeaker(rawLabel) === "gb" ||
    inferDialectFromSpeaker(rawLabel) === "northern";

  const isUS =
    rawDialect === "us" ||
    lowerLabel.includes("us") ||
    lowerLabel.includes("american") ||
    inferDialectFromSpeaker(rawLabel) === "us";

  // Score each candidate voice
  const scored = availableVoices.map((voice) => {
    let score = 0;
    const vId = voice.id.toLowerCase();
    const vGender = voice.gender;
    const vLang = (voice.languageCode || "").toLowerCase();
    const vCountry = (voice.country || "").toLowerCase();

    // 1. Gender Matching (Mandatory high priority)
    if (inferredGender) {
      if (vGender === inferredGender) {
        score += 200;
      } else if (vGender && vGender !== inferredGender) {
        // Severe penalty for wrong gender
        score -= 500;
      }
    }

    // 2. Dialect Matching
    if (isUK) {
      if (vLang.includes("gb") || vCountry.includes("kingdom") || vCountry.includes("britain") || vId.startsWith("b")) {
        score += 80;
      }
    } else if (isUS) {
      if (vLang.includes("us") || vCountry.includes("united states") || vId.startsWith("a")) {
        score += 80;
      }
    }

    // 3. Local Installation Bonus
    if (voice.isInstalled) {
      score += 50;
    }

    // 4. Unused Voice Bonus (Ensures distinct speakers don't share the same voice)
    if (!usedVoiceIds.has(voice.id)) {
      score += 150;
    }

    return { voice, score };
  });

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  // Return highest-scoring voice
  if (scored.length > 0 && scored[0].score > -300) {
    return scored[0].voice.id;
  }

  // Fallback: pick any unused voice or fallback
  const unused = availableVoices.find((v) => !usedVoiceIds.has(v.id));
  return unused?.id || availableVoices[speakerIndex % availableVoices.length]?.id || fallbackVoiceId;
}

/**
 * Builds a complete cast voice mapping for an array of speakers, guaranteeing
 * that all detected characters get appropriate, distinct voices.
 */
export function buildAutoCastVoiceMap(
  speakers: ScriptSpeaker[],
  availableVoices: VoiceModelInfo[],
  fallbackVoiceId: string = "af_heart"
): Record<string, string> {
  const result: Record<string, string> = {};
  const usedVoiceIds = new Set<string>();

  for (let i = 0; i < speakers.length; i++) {
    const speaker = speakers[i];
    const voiceId = matchVoiceForSpeaker(
      speaker,
      i,
      usedVoiceIds,
      availableVoices,
      fallbackVoiceId
    );
    result[speaker.key] = voiceId;
    usedVoiceIds.add(voiceId);
  }

  return result;
}
