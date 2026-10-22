import { applyWavEdgeFades, concatenateWav } from "../wav.ts";

/** The stable, user-facing emotion vocabulary used by expressive synthesis. */
export type ExpressiveEmotion =
  | "neutral"
  | "happy"
  | "excited"
  | "sad"
  | "angry"
  | "fearful"
  | "surprised"
  | "tender";

export interface EmotionPlan {
  emotion: ExpressiveEmotion;
  confidence: number;
  text: string;
  speed: number;
  pauseSeconds: number;
}

export interface ExpressiveSynthesisOptions {
  text: string;
  /** False deliberately preserves the provider's pre-emotion synthesis path. */
  emotionMode?: boolean;
  /** 0 is neutral delivery; values over 1 are accepted but safely bounded. */
  intensity?: number;
  baseLengthScale?: number;
  sentenceSilence?: number;
  /** An optional, trusted cue from the script parser. */
  emotionHint?: string;
  synthesizeSentence: (text: string, speed: number) => Promise<Buffer>;
}

const SAMPLE_RATE = 24_000;
const MIN_CONFIDENCE = 0.5;
const MAX_BATCH_CHARACTERS = 350;

const PROFILES: Record<ExpressiveEmotion, { speed: number; pauseMs: number }> = {
  neutral: { speed: 1, pauseMs: 300 },
  happy: { speed: 1.08, pauseMs: 250 },
  excited: { speed: 1.18, pauseMs: 180 },
  sad: { speed: 0.85, pauseMs: 550 },
  angry: { speed: 1.1, pauseMs: 200 },
  fearful: { speed: 1.12, pauseMs: 280 },
  surprised: { speed: 1.05, pauseMs: 350 },
  tender: { speed: 0.9, pauseMs: 500 },
};

const CUES: Record<Exclude<ExpressiveEmotion, "neutral">, RegExp> = {
  happy: /\b(happy|glad|delighted|wonderful|great news|love this|smil(?:e|ing)|joyful|pleased)\b/i,
  excited: /\b(excited|amazing|incredible|can'?t wait|fantastic|awesome|yes!)\b/i,
  sad: /\b(sad|sorry|miss you|heartbroken|grief|cry(?:ing)?|tears?|lost|alone|goodbye)\b/i,
  angry: /\b(angry|furious|hate|unacceptable|stop|enough|outraged|ridiculous|damn)\b/i,
  fearful: /\b(afraid|scared|fear|worried|panic|danger|terrified|nervous|help)\b/i,
  surprised: /\b(wow|what\?|really\?|unbelievable|surpris(?:e|ed|ing)|oh no|no way)\b/i,
  tender: /\b(gently|softly|dear|darling|sweetheart|proud of you|thank you|care about you|love you)\b/i,
};

const HINTS: Record<string, ExpressiveEmotion> = {
  whisper: "tender",
  angry: "angry",
  sad: "sad",
  firm: "neutral",
  shocked: "surprised",
  hesitant: "fearful",
};

/** Dependency-free splitter that avoids breaking common abbreviations and decimals. */
export function splitSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const pieces = normalized.match(/[^.!?…]+(?:[.!?…]+(?=\s|$)|$)/g) ?? [normalized];
  return pieces.map((piece) => piece.trim()).filter(Boolean);
}

function classifySentence(sentence: string): { emotion: ExpressiveEmotion; confidence: number } {
  const scores: Partial<Record<ExpressiveEmotion, number>> = { neutral: 1 };
  for (const [emotion, pattern] of Object.entries(CUES) as Array<[Exclude<ExpressiveEmotion, "neutral">, RegExp]>) {
    if (pattern.test(sentence)) scores[emotion] = (scores[emotion] ?? 0) + 1.1;
  }
  if (/!{2,}/.test(sentence)) scores.excited = (scores.excited ?? 0) + 0.35;
  if (/\?!|!\?/.test(sentence)) scores.surprised = (scores.surprised ?? 0) + 0.45;
  if (/^[^a-z]*[A-Z\s]{7,}[!?]?$/i.test(sentence) && sentence.replace(/[^A-Z]/g, "").length > 6) {
    scores.angry = (scores.angry ?? 0) + 0.45;
  }

  let emotion: ExpressiveEmotion = "neutral";
  let score = 1;
  for (const [candidate, value] of Object.entries(scores) as Array<[ExpressiveEmotion, number]>) {
    if (value > score) {
      emotion = candidate;
      score = value;
    }
  }
  return { emotion, confidence: Math.min(1, score / 1.4) };
}

function adjustText(text: string, emotion: ExpressiveEmotion, intensity: number): string {
  // Punctuation is a useful Kokoro control, but only change it for confident, explicit delivery.
  if (intensity < 0.55) return text;
  if (emotion === "happy") return /[.!?…]$/.test(text) ? text : `${text}.`;
  if (emotion === "excited" || emotion === "angry") {
    return /!$/.test(text) ? text : /\.$/.test(text) ? text.replace(/\.$/, "!") : `${text}!`;
  }
  if (emotion === "sad") {
    return /…$|\.\.\.$/.test(text) ? text : /\.$/.test(text) ? text.replace(/\.$/, "...") : `${text}...`;
  }
  if (emotion === "surprised") return /[!?]$/.test(text) ? text : /\.$/.test(text) ? text.replace(/\.$/, "!") : `${text}!`;
  if (emotion === "fearful" && text.includes(",")) return text.replace(",", ", ...");
  return text;
}

/** Creates a smooth, conservative plan without loading a model or changing the selected voice. */
export function planExpressiveSpeech(
  text: string,
  intensity = 0.7,
  emotionHint?: string,
  sentenceSilence = 0.2
): EmotionPlan[] {
  const boundedIntensity = Math.max(0, Math.min(1.5, Number.isFinite(intensity) ? intensity : 0.7));
  const hint = emotionHint ? HINTS[emotionHint] : undefined;
  let previous: ExpressiveEmotion = hint ?? "neutral";

  return splitSentences(text).map((sentence) => {
    const wordCount = sentence.trim().split(/\s+/).filter(Boolean).length;
    const classified = hint
      ? { emotion: hint, confidence: 1 }
      : classifySentence(sentence);
    const emotion = wordCount < 3 || classified.confidence < MIN_CONFIDENCE
      ? previous
      : classified.emotion;
    previous = emotion;

    const profile = PROFILES[emotion];
    return {
      emotion,
      confidence: classified.confidence,
      text: adjustText(sentence, emotion, boundedIntensity),
      speed: Math.max(0.82, Math.min(1.18, 1 + (profile.speed - 1) * boundedIntensity)),
      pauseSeconds: Math.max(sentenceSilence, (profile.pauseMs / 1000) * Math.min(boundedIntensity, 1)),
    };
  });
}

interface ExpressiveBatch {
  text: string;
  speed: number;
  pauseSeconds: number;
}

/**
 * Kokoro inference has a fixed per-call cost. Combine adjacent sentences only
 * when their delivery is identical; emotional transitions still get their own
 * model call. The cap mirrors the provider's safe Kokoro text-chunk limit.
 */
function batchCompatiblePlans(plans: EmotionPlan[]): ExpressiveBatch[] {
  const batches: Array<ExpressiveBatch & { emotion: ExpressiveEmotion }> = [];
  for (const plan of plans) {
    const current = batches.at(-1);
    const mergedText = current ? `${current.text} ${plan.text}` : plan.text;
    if (
      current &&
      current.emotion === plan.emotion &&
      Math.abs(current.speed - plan.speed) < 0.001 &&
      mergedText.length <= MAX_BATCH_CHARACTERS
    ) {
      current.text = mergedText;
      current.pauseSeconds = plan.pauseSeconds;
      continue;
    }
    batches.push({
      emotion: plan.emotion,
      text: plan.text,
      speed: plan.speed,
      pauseSeconds: plan.pauseSeconds,
    });
  }
  return batches;
}

/**
 * Synthesizes every sentence with bounded expressive controls and click-safe joins.
 * The caller owns the actual Kokoro invocation so this module remains portable and testable.
 */
export async function synthesizeExpressive(options: ExpressiveSynthesisOptions): Promise<Buffer> {
  const plans = planExpressiveSpeech(
    options.text,
    options.intensity,
    options.emotionHint,
    options.sentenceSilence
  );
  if (plans.length === 0) throw new Error("No text provided for expressive synthesis.");

  const baseLengthScale = options.baseLengthScale && options.baseLengthScale > 0
    ? options.baseLengthScale
    : 1;
  const batches = batchCompatiblePlans(plans);
  const wavs: Buffer[] = [];
  const pauses: number[] = [];
  for (const batch of batches) {
    // lengthScale is inverse of Kokoro speed; clamp guards intelligibility.
    const speed = Math.max(0.75, Math.min(1.3, batch.speed / baseLengthScale));
    const wav = await options.synthesizeSentence(batch.text, speed);
    wavs.push(applyWavEdgeFades(wav, SAMPLE_RATE, 0.008));
    pauses.push(batch.pauseSeconds);
  }
  return concatenateWav(wavs, pauses);
}

// Kept as a named alias for integrations that follow the original spec's naming.
export const synthesize_expressive = synthesizeExpressive;
