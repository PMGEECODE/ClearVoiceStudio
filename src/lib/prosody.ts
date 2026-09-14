export type PauseType = "none" | "micro" | "short" | "medium" | "long";

export type ProsodyProfileId =
  | "conversational"
  | "professional"
  | "announcement"
  | "narration"
  | "assistant"
  | "energetic"
  | "calm";

export interface PronunciationRule {
  replacement: string;
  matchCase?: boolean;
}

export interface ProsodyProfile {
  id: ProsodyProfileId;
  label: string;
  lengthScaleMultiplier: number;
  noiseScaleMultiplier: number;
  noiseWScaleMultiplier: number;
  pauseIntensity: number;
  sentenceSpacing: number;
  clauseSpacing: number;
  emphasis: "subtle" | "moderate" | "restrained";
  maxSegmentLength: number;
}

export interface ProsodySegment {
  text: string;
  pauseAfter: number;
  pauseType: PauseType;
  reason: string;
  lengthScaleMultiplier: number;
}

export interface ProsodyResult {
  originalText: string;
  normalizedText: string;
  profile: ProsodyProfile;
  segments: ProsodySegment[];
  piperParams: {
    lengthScale: number;
    noiseScale: number;
    noiseWScale: number;
    sentenceSilence: number;
  };
}

export interface ProcessProsodyOptions {
  profileId?: string;
  lengthScale?: number;
  noiseScale?: number;
  noiseWScale?: number;
  sentenceSilence?: number;
  maxSegmentLength?: number;
  pronunciations?: Record<string, PronunciationRule | string>;
}

const DEFAULT_PROFILE_ID: ProsodyProfileId = "conversational";

const PAUSE_SECONDS: Record<PauseType, number> = {
  none: 0,
  micro: 0.06,
  short: 0.14,
  medium: 0.28,
  long: 0.48,
};

export const PROSODY_PROFILES: Record<ProsodyProfileId, ProsodyProfile> = {
  conversational: {
    id: "conversational",
    label: "Conversational",
    lengthScaleMultiplier: 1.05,
    noiseScaleMultiplier: 1.06,
    noiseWScaleMultiplier: 1.04,
    pauseIntensity: 1,
    sentenceSpacing: 1,
    clauseSpacing: 0.9,
    emphasis: "moderate",
    maxSegmentLength: 230,
  },
  professional: {
    id: "professional",
    label: "Professional",
    lengthScaleMultiplier: 1.08,
    noiseScaleMultiplier: 1,
    noiseWScaleMultiplier: 1.02,
    pauseIntensity: 1.08,
    sentenceSpacing: 1.08,
    clauseSpacing: 1,
    emphasis: "restrained",
    maxSegmentLength: 250,
  },
  announcement: {
    id: "announcement",
    label: "Announcement",
    lengthScaleMultiplier: 1.14,
    noiseScaleMultiplier: 1.02,
    noiseWScaleMultiplier: 1.03,
    pauseIntensity: 1.18,
    sentenceSpacing: 1.18,
    clauseSpacing: 1.08,
    emphasis: "moderate",
    maxSegmentLength: 220,
  },
  narration: {
    id: "narration",
    label: "Narration",
    lengthScaleMultiplier: 1.1,
    noiseScaleMultiplier: 0.98,
    noiseWScaleMultiplier: 1,
    pauseIntensity: 1.12,
    sentenceSpacing: 1.12,
    clauseSpacing: 1.05,
    emphasis: "subtle",
    maxSegmentLength: 280,
  },
  assistant: {
    id: "assistant",
    label: "Assistant",
    lengthScaleMultiplier: 1.04,
    noiseScaleMultiplier: 1.05,
    noiseWScaleMultiplier: 1.03,
    pauseIntensity: 0.95,
    sentenceSpacing: 0.95,
    clauseSpacing: 0.9,
    emphasis: "subtle",
    maxSegmentLength: 230,
  },
  energetic: {
    id: "energetic",
    label: "Energetic",
    lengthScaleMultiplier: 0.95,
    noiseScaleMultiplier: 1.09,
    noiseWScaleMultiplier: 1.06,
    pauseIntensity: 0.82,
    sentenceSpacing: 0.85,
    clauseSpacing: 0.8,
    emphasis: "moderate",
    maxSegmentLength: 210,
  },
  calm: {
    id: "calm",
    label: "Calm",
    lengthScaleMultiplier: 1.16,
    noiseScaleMultiplier: 0.96,
    noiseWScaleMultiplier: 0.98,
    pauseIntensity: 1.18,
    sentenceSpacing: 1.2,
    clauseSpacing: 1.08,
    emphasis: "restrained",
    maxSegmentLength: 260,
  },
};

const ABBREVIATIONS: Record<string, string> = {
  "approx.": "approximately",
  "appt.": "appointment",
  "asap": "as soon as possible",
  "dept.": "department",
  "dr.": "doctor",
  "e.g.": "for example",
  "etc.": "etcetera",
  "fig.": "figure",
  "i.e.": "that is",
  "mr.": "mister",
  "mrs.": "misses",
  "ms.": "miz",
  "prof.": "professor",
  "st.": "street",
  "vs.": "versus",
};

const DEFAULT_PRONUNCIATIONS: Record<string, PronunciationRule> = {
  "KRA": { replacement: "K R A" },
  "NHIF": { replacement: "N H I F" },
  "NSSF": { replacement: "N S S F" },
  "M-Pesa": { replacement: "M Pesa" },
};

const SENTENCE_BOUNDARY_ABBREVIATIONS = new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "sr",
  "jr",
  "st",
  "vs",
  "etc",
  "e.g",
  "i.e",
]);

export function getProsodyProfile(profileId?: string): ProsodyProfile {
  if (profileId && profileId in PROSODY_PROFILES) {
    return PROSODY_PROFILES[profileId as ProsodyProfileId];
  }
  return PROSODY_PROFILES[DEFAULT_PROFILE_ID];
}

export function processTextForProsody(
  input: string,
  options: ProcessProsodyOptions = {}
): ProsodyResult {
  const profile = {
    ...getProsodyProfile(options.profileId),
    maxSegmentLength: options.maxSegmentLength || getProsodyProfile(options.profileId).maxSegmentLength,
  };
  const normalizedText = normalizeForSpeech(input, options.pronunciations);
  const segments = segmentForSpeech(normalizedText, profile);
  const baseSentenceSilence = clampNumber(options.sentenceSilence, 0.2, 0, 1.5);

  return {
    originalText: input,
    normalizedText,
    profile,
    segments,
    piperParams: {
      lengthScale: clampNumber(
        (options.lengthScale ?? 1) * profile.lengthScaleMultiplier,
        1,
        0.5,
        1.8
      ),
      noiseScale: clampNumber((options.noiseScale ?? 0.667) * profile.noiseScaleMultiplier, 0.667, 0, 1.5),
      noiseWScale: clampNumber((options.noiseWScale ?? 0.8) * profile.noiseWScaleMultiplier, 0.8, 0, 1.5),
      sentenceSilence: clampNumber(baseSentenceSilence * 0.55, 0.12, 0, 0.6),
    },
  };
}

export function normalizeForSpeech(
  input: string,
  pronunciations: Record<string, PronunciationRule | string> = {}
): string {
  let text = input
    .replace(/\r\n?/g, "\n")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, " - ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/\(([^()]{1,80})\)/g, ", $1, ")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();

  text = text
    .replace(/([!?]){2,}/g, "$1")
    .replace(/\.{3,}/g, "...")
    .replace(/[,;:]{2,}/g, (match) => match[0]);

  text = expandCurrency(text);
  text = expandEmails(text);
  text = expandUrls(text);
  text = expandCommonSymbols(text);
  text = expandAbbreviations(text);
  text = applyPronunciations(text, { ...DEFAULT_PRONUNCIATIONS, ...pronunciations });

  return text.replace(/[ \t]{2,}/g, " ").replace(/\s+([,.!?;:])/g, "$1").trim();
}

function segmentForSpeech(text: string, profile: ProsodyProfile): ProsodySegment[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const segments: ProsodySegment[] = [];

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const sentences = splitSentences(paragraph);

    sentences.forEach((sentence, sentenceIndex) => {
      const clauses = splitLongSentence(sentence, profile.maxSegmentLength);

      clauses.forEach((clause, clauseIndex) => {
        const isLastClause = clauseIndex === clauses.length - 1;
        const isLastSentence = sentenceIndex === sentences.length - 1;
        const isLastParagraph = paragraphIndex === paragraphs.length - 1;
        const pauseType = isLastClause
          ? isLastSentence
            ? isLastParagraph
              ? "none"
              : "long"
            : "medium"
          : getClausePauseType(clause);
        const pauseAfter = scalePause(pauseType, profile, isLastClause ? "sentence" : "clause");

        segments.push({
          text: prepareSegmentText(clause, profile),
          pauseAfter,
          pauseType,
          reason: getPauseReason(pauseType, clause, isLastClause, isLastParagraph),
          lengthScaleMultiplier: getSegmentLengthMultiplier(clause, profile),
        });
      });
    });
  });

  return segments.length > 0
    ? segments
    : [
        {
          text,
          pauseAfter: 0,
          pauseType: "none",
          reason: "single segment",
          lengthScaleMultiplier: 1,
        },
      ];
}

function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (!/[.!?]/.test(char)) continue;
    if (char === "." && isProtectedPeriod(text, i)) continue;

    let end = i + 1;
    while (end < text.length && /["')\]]/.test(text[end])) end++;
    const next = text[end];
    if (next && !/\s/.test(next)) continue;

    const sentence = text.slice(start, end).trim();
    if (sentence) sentences.push(sentence);
    start = end;
    while (start < text.length && /\s/.test(text[start])) start++;
    i = start - 1;
  }

  const tail = text.slice(start).trim();
  if (tail) sentences.push(tail);
  return sentences;
}

function splitLongSentence(sentence: string, maxLength: number): string[] {
  if (sentence.length <= maxLength) return [sentence];

  const clauses: string[] = [];
  let remaining = sentence.trim();

  while (remaining.length > maxLength) {
    const splitAt = findNaturalSplit(remaining, maxLength);
    if (splitAt <= 0) break;
    clauses.push(remaining.slice(0, splitAt + 1).trim());
    remaining = remaining.slice(splitAt + 1).trim();
  }

  if (remaining) clauses.push(remaining);
  return clauses.length > 0 ? clauses : [sentence];
}

function findNaturalSplit(text: string, maxLength: number): number {
  const minSplit = Math.floor(maxLength * 0.45);
  const search = text.slice(minSplit, maxLength + 1);
  const semicolon = Math.max(search.lastIndexOf(";"), search.lastIndexOf(":"));
  if (semicolon >= 0) return minSplit + semicolon;

  const comma = search.lastIndexOf(",");
  if (comma >= 0) {
    const absolute = minSplit + comma;
    const beforeWords = text.slice(0, absolute).trim().split(/\s+/).length;
    const afterWords = text.slice(absolute + 1).trim().split(/\s+/).length;
    if (beforeWords >= 6 && afterWords >= 6) return absolute;
  }

  const space = search.lastIndexOf(" ");
  return space >= 0 ? minSplit + space : -1;
}

function prepareSegmentText(text: string, profile: ProsodyProfile): string {
  let segment = text.trim();
  if (
    profile.emphasis !== "restrained" &&
    /^(important|warning|remember|note)\s*:/i.test(segment)
  ) {
    segment = segment.replace(/^([^:]+):\s*([a-z])/, (_, label: string, next: string) => {
      return `${label}. ${next.toUpperCase()}`;
    });
  }
  return segment;
}

function getClausePauseType(clause: string): PauseType {
  if (/[;:]$/.test(clause.trim())) return "medium";
  if (/,$/.test(clause.trim())) return "short";
  return "micro";
}

function getPauseReason(
  pauseType: PauseType,
  clause: string,
  isLastClause: boolean,
  isLastParagraph: boolean
): string {
  if (pauseType === "none") return "end of text";
  if (!isLastParagraph && pauseType === "long") return "paragraph boundary";
  if (!isLastClause) return /[,;:]$/.test(clause.trim()) ? "clause punctuation" : "long clause";
  if (/\?$/.test(clause.trim())) return "question boundary";
  if (/!$/.test(clause.trim())) return "exclamation boundary";
  return "sentence boundary";
}

function scalePause(
  pauseType: PauseType,
  profile: ProsodyProfile,
  placement: "sentence" | "clause"
): number {
  const base = PAUSE_SECONDS[pauseType];
  const placementScale = placement === "sentence" ? profile.sentenceSpacing : profile.clauseSpacing;
  return roundSeconds(base * profile.pauseIntensity * placementScale);
}

function getSegmentLengthMultiplier(segment: string, profile: ProsodyProfile): number {
  const trimmed = segment.trim();
  if (/^(yes|no|okay|sure|thanks|thank you)[.!]?$/i.test(trimmed)) return 0.96;
  if (/\?$/.test(trimmed)) return profile.id === "calm" ? 1.02 : 0.98;
  if (/!$/.test(trimmed) && profile.id === "energetic") return 0.94;
  return 1;
}

function expandCurrency(text: string): string {
  return text
    .replace(/\bKES\s*([\d,]+(?:\.\d{1,2})?)\b/gi, "$1 Kenyan shillings")
    .replace(/\bKSHS?\.?\s*([\d,]+(?:\.\d{1,2})?)\b/gi, "$1 Kenyan shillings")
    .replace(/\$\s*([\d,]+(?:\.\d{1,2})?)\b/g, "$1 dollars")
    .replace(/£\s*([\d,]+(?:\.\d{1,2})?)\b/g, "$1 pounds")
    .replace(/€\s*([\d,]+(?:\.\d{1,2})?)\b/g, "$1 euros");
}

function expandEmails(text: string): string {
  return text.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, (email) =>
    email.replace(/@/g, " at ").replace(/\./g, " dot ").replace(/_/g, " underscore ")
  );
}

function expandUrls(text: string): string {
  return text.replace(/\bhttps?:\/\/[^\s]+|\bwww\.[^\s]+/gi, (url) =>
    url
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "www dot ")
      .replace(/\./g, " dot ")
      .replace(/[/?#=&_-]+/g, " ")
  );
}

function expandCommonSymbols(text: string): string {
  return text
    .replace(/&/g, " and ")
    .replace(/%/g, " percent")
    .replace(/\+/g, " plus ")
    .replace(/=/g, " equals ")
    .replace(/\s+-\s+/g, ", ");
}

function expandAbbreviations(text: string): string {
  let expanded = text;
  for (const [abbr, replacement] of Object.entries(ABBREVIATIONS)) {
    expanded = expanded.replace(
      new RegExp(`(^|\\s)${escapeRegExp(abbr)}(?=\\s|$)`, "gi"),
      (_, prefix: string) => `${prefix}${replacement}`
    );
  }
  return expanded;
}

function applyPronunciations(
  text: string,
  rules: Record<string, PronunciationRule | string>
): string {
  let result = text;
  for (const [term, rule] of Object.entries(rules)) {
    const config = typeof rule === "string" ? { replacement: rule } : rule;
    if (!config.replacement) continue;
    const flags = config.matchCase ? "g" : "gi";
    result = result.replace(new RegExp(`\\b${escapeRegExp(term)}\\b`, flags), config.replacement);
  }
  return result;
}

function isProtectedPeriod(text: string, periodIndex: number): boolean {
  const before = text.slice(0, periodIndex).match(/([A-Za-z](?:\.[A-Za-z])?|\b[A-Za-z]{1,8})$/);
  const token = before?.[1]?.toLowerCase();
  if (!token) return false;
  if (SENTENCE_BOUNDARY_ABBREVIATIONS.has(token)) return true;
  if (/^[A-Z]$/.test(before?.[1] || "")) return true;
  const next = text[periodIndex + 1];
  return /\d/.test(text[periodIndex - 1] || "") && /\d/.test(next || "");
}

function clampNumber(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  const numericValue = value as number;
  return Math.min(Math.max(numericValue, min), max);
}

function roundSeconds(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
