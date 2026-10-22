export type EmotionType =
  | "neutral"
  | "whisper"
  | "angry"
  | "sad"
  | "firm"
  | "shocked"
  | "hesitant";

export interface EmotionBadge {
  label: string;
  color: string;
  bg: string;
  border: string;
}

export interface EmotionProfile {
  type: EmotionType;
  badge: EmotionBadge;
  lengthScaleMultiplier: number;
  noiseScaleMultiplier: number;
  noiseWScaleMultiplier: number;
  kokoroSpeedMultiplier: number;
  pauseBefore: number;
  pauseAfter: number;
  description: string;
}

export const EMOTION_PROFILES: Record<EmotionType, EmotionProfile> = {
  neutral: {
    type: "neutral",
    badge: {
      label: "Neutral",
      color: "#94a3b8",
      bg: "rgba(148, 163, 184, 0.12)",
      border: "rgba(148, 163, 184, 0.3)",
    },
    lengthScaleMultiplier: 1.0,
    noiseScaleMultiplier: 1.0,
    noiseWScaleMultiplier: 1.0,
    kokoroSpeedMultiplier: 1.0,
    pauseBefore: 0.1,
    pauseAfter: 0.18,
    description: "Standard natural dialogue cadence",
  },
  whisper: {
    type: "whisper",
    badge: {
      label: "Whisper",
      color: "#38bdf8",
      bg: "rgba(56, 189, 248, 0.15)",
      border: "rgba(56, 189, 248, 0.4)",
    },
    lengthScaleMultiplier: 1.15,
    noiseScaleMultiplier: 0.45,
    noiseWScaleMultiplier: 0.85,
    kokoroSpeedMultiplier: 0.88,
    pauseBefore: 0.2,
    pauseAfter: 0.32,
    description: "Quiet, intimate, low-volume phrasing",
  },
  angry: {
    type: "angry",
    badge: {
      label: "Agitated",
      color: "#f87171",
      bg: "rgba(248, 113, 113, 0.15)",
      border: "rgba(248, 113, 113, 0.4)",
    },
    lengthScaleMultiplier: 0.88,
    noiseScaleMultiplier: 1.25,
    noiseWScaleMultiplier: 1.15,
    kokoroSpeedMultiplier: 1.14,
    pauseBefore: 0.08,
    pauseAfter: 0.25,
    description: "Intense, rapid attack with high dynamic energy",
  },
  sad: {
    type: "sad",
    badge: {
      label: "Vulnerable",
      color: "#c084fc",
      bg: "rgba(192, 132, 252, 0.15)",
      border: "rgba(192, 132, 252, 0.4)",
    },
    lengthScaleMultiplier: 1.22,
    noiseScaleMultiplier: 0.85,
    noiseWScaleMultiplier: 1.30,
    kokoroSpeedMultiplier: 0.82,
    pauseBefore: 0.35,
    pauseAfter: 0.45,
    description: "Melancholic, hesitant delivery with subtle duration wobble",
  },
  firm: {
    type: "firm",
    badge: {
      label: "Firm",
      color: "#34d399",
      bg: "rgba(52, 211, 153, 0.15)",
      border: "rgba(52, 211, 153, 0.4)",
    },
    lengthScaleMultiplier: 1.02,
    noiseScaleMultiplier: 0.90,
    noiseWScaleMultiplier: 0.95,
    kokoroSpeedMultiplier: 1.0,
    pauseBefore: 0.15,
    pauseAfter: 0.24,
    description: "Steady, authoritative, composed cadence",
  },
  shocked: {
    type: "shocked",
    badge: {
      label: "Shocked",
      color: "#fbbf24",
      bg: "rgba(251, 191, 36, 0.15)",
      border: "rgba(251, 191, 36, 0.4)",
    },
    lengthScaleMultiplier: 0.86,
    noiseScaleMultiplier: 1.10,
    noiseWScaleMultiplier: 1.10,
    kokoroSpeedMultiplier: 1.10,
    pauseBefore: 0.2,
    pauseAfter: 0.35,
    description: "Abrupt, startled reaction with sudden tempo",
  },
  hesitant: {
    type: "hesitant",
    badge: {
      label: "Hesitant",
      color: "#fb923c",
      bg: "rgba(251, 146, 60, 0.15)",
      border: "rgba(251, 146, 60, 0.4)",
    },
    lengthScaleMultiplier: 1.16,
    noiseScaleMultiplier: 0.95,
    noiseWScaleMultiplier: 1.20,
    kokoroSpeedMultiplier: 0.88,
    pauseBefore: 0.45,
    pauseAfter: 0.35,
    description: "Uncertain, questioning pacing with prolonged beats",
  },
};

const EMOTION_PATTERNS: Array<{
  type: EmotionType;
  regex: RegExp;
  weight: number;
}> = [
  // Whisper / Quiet cues
  {
    type: "whisper",
    regex: /\b(whisper(?:s|ed|ing)?|quietly|softly|mutter(?:s|ed)?|under (?:her|his|their) breath|to (?:herself|himself)|looking at (?:her|his) phone)\b/i,
    weight: 10,
  },
  // Anger / Frustration cues
  {
    type: "angry",
    regex: /\b(frustrated|annoyed|raises (?:his|her|their) voice|yell(?:s|ed|ing)?|shout(?:s|ed|ing)?|angry|furious|snapped|defensive and angry|angrily|furious)\b/i,
    weight: 10,
  },
  // Sad / Tears / Vulnerable cues
  {
    type: "sad",
    regex: /\b(holding back tears|tears forming|wipes? away (?:her|his) tears|crying|emotional|worried|heartbroken|devastated|hurts?|sobbing|grief|sorrow)\b/i,
    weight: 10,
  },
  // Firm / Direct / Serious cues
  {
    type: "firm",
    regex: /\b(calm but firm|direct and serious|serious|stern|firmly|assertive|composed|steady|matter-of-fact)\b/i,
    weight: 10,
  },
  // Shocked / Stunned cues
  {
    type: "shocked",
    regex: /\b(shocked|stunned|gasps?|disbelief|horrified|dumbfounded|wide-eyed)\b/i,
    weight: 10,
  },
  // Hesitant / Uncertain cues
  {
    type: "hesitant",
    regex: /\b(hesitates?|hesitating|uncertain|reluctant|stammer(?:s|ed)?|nervous|after a long pause|long pause)\b/i,
    weight: 9,
  },
];

export interface EmotionDetectionResult {
  emotion: EmotionType;
  profile: EmotionProfile;
  confidence: number;
  detectedCues: string[];
}

/**
 * Detects the emotional intent of a dialogue turn based on its extracted
 * stage directions, parentheticals, and punctuation.
 */
export function detectEmotion(
  cues: string[] = [],
  dialogueText: string = ""
): EmotionDetectionResult {
  const scores: Record<EmotionType, number> = {
    neutral: 1,
    whisper: 0,
    angry: 0,
    sad: 0,
    firm: 0,
    shocked: 0,
    hesitant: 0,
  };

  const detectedCues: string[] = [];

  // 1. Analyze explicit stage directions (highest weight)
  for (const rawCue of cues) {
    const cue = rawCue.toLowerCase().trim();
    for (const pattern of EMOTION_PATTERNS) {
      if (pattern.regex.test(cue)) {
        scores[pattern.type] += pattern.weight;
        detectedCues.push(rawCue);
      }
    }
  }

  // 2. Analyze dialogue text cues (punctuation, typography, key phrasing)
  const text = dialogueText.trim();
  if (text.includes("?!") || text.includes("!?")) {
    scores.shocked += 3;
    scores.angry += 2;
  } else if (text.endsWith("!") && text.length > 5) {
    scores.angry += 3;
  }

  if (text.includes("...") || text.includes("…")) {
    scores.hesitant += 2;
    scores.sad += 2;
  }

  // Check if text is all-caps (shouting)
  const lettersOnly = text.replace(/[^a-zA-Z]/g, "");
  if (lettersOnly.length > 6 && lettersOnly === lettersOnly.toUpperCase()) {
    scores.angry += 5;
  }

  // Pick highest scoring emotion
  let highestEmotion: EmotionType = "neutral";
  let maxScore = scores.neutral;

  for (const [emo, score] of Object.entries(scores) as [EmotionType, number][]) {
    if (score > maxScore) {
      maxScore = score;
      highestEmotion = emo;
    }
  }

  const confidence = Math.min(1.0, maxScore / 10);

  return {
    emotion: highestEmotion,
    profile: EMOTION_PROFILES[highestEmotion],
    confidence,
    detectedCues,
  };
}

/**
 * Maps pause directions into calibrated audio silence seconds.
 */
export function parsePauseDuration(cue: string): number | null {
  const lower = cue.toLowerCase().trim();
  if (/\b(silence|long pause|extended pause)\b/.test(lower)) {
    return 2.2;
  }
  if (/\b(after a long pause|long silence)\b/.test(lower)) {
    return 1.8;
  }
  if (/\b(pause|beat|hesitates|moment)\b/.test(lower)) {
    return 1.1;
  }
  return null;
}
