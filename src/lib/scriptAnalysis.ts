import {
  EmotionType,
  EmotionBadge,
  EmotionProfile,
  detectEmotion,
  parsePauseDuration,
} from "./emotionDetection";

export type { EmotionType, EmotionBadge, EmotionProfile };

export type ScriptSpeaker = {
  key: string;
  label: string;
  gender?: "male" | "female";
  dialect?: "us" | "gb" | "northern" | string;
  bio?: string;
  turns: number;
  colorIndex: number;
  dominantEmotion?: EmotionType;
};

export type ScriptTurn = {
  speakerKey: string;
  speakerLabel: string;
  timestamp?: string; // e.g. "[00:00 - 00:06]"
  cleanTimestamp?: string; // e.g. "00:00 - 00:06"
  gender?: "male" | "female";
  text: string; // The dialogue text to be synthesized (NO timestamps, NO speaker tags, NO brackets/cues)
  colorIndex: number;
  emotion?: EmotionType;
  emotionBadge?: EmotionBadge;
  emotionCues?: string[];
  pauseDuration?: number; // In seconds, if this turn represents or contains a dramatic pause
  isPause?: boolean;
};

export type ScriptAnalysis = {
  mode: "single" | "dialogue";
  turns: number;
  speakers: ScriptSpeaker[];
  reason: string;
  parsedTurns: ScriptTurn[];
  characterBios?: Record<string, string>;
};

export type SynthesisProgressState = {
  percent: number;
  label: string;
  detail: string;
  turns: number;
  elapsedSeconds: number;
} | null;

export interface SpeakerColor {
  name: string;
  color: string;
  bg: string;
  border: string;
  lightBg: string;
}

export const SPEAKER_COLORS: SpeakerColor[] = [
  { name: "Teal", color: "#2dd4bf", bg: "rgba(45, 212, 191, 0.16)", border: "rgba(45, 212, 191, 0.4)", lightBg: "rgba(45, 212, 191, 0.06)" },
  { name: "Violet", color: "#a78bfa", bg: "rgba(167, 139, 250, 0.16)", border: "rgba(167, 139, 250, 0.4)", lightBg: "rgba(167, 139, 250, 0.06)" },
  { name: "Amber", color: "#fbbf24", bg: "rgba(251, 191, 36, 0.16)", border: "rgba(251, 191, 36, 0.4)", lightBg: "rgba(251, 191, 36, 0.06)" },
  { name: "Rose", color: "#fb7185", bg: "rgba(251, 113, 133, 0.16)", border: "rgba(251, 113, 133, 0.4)", lightBg: "rgba(251, 113, 133, 0.06)" },
  { name: "Sky", color: "#38bdf8", bg: "rgba(56, 189, 248, 0.16)", border: "rgba(56, 189, 248, 0.4)", lightBg: "rgba(56, 189, 248, 0.06)" },
  { name: "Emerald", color: "#34d399", bg: "rgba(52, 211, 153, 0.16)", border: "rgba(52, 211, 153, 0.4)", lightBg: "rgba(52, 211, 153, 0.06)" },
  { name: "Indigo", color: "#818cf8", bg: "rgba(129, 140, 248, 0.16)", border: "rgba(129, 140, 248, 0.4)", lightBg: "rgba(129, 140, 248, 0.06)" },
  { name: "Orange", color: "#fb923c", bg: "rgba(251, 146, 60, 0.16)", border: "rgba(251, 146, 60, 0.4)", lightBg: "rgba(251, 146, 60, 0.06)" },
];

export function getSpeakerColor(speakerKey: string, fallbackIndex = 0): SpeakerColor {
  const match = speakerKey.match(/speaker\s*(\d+)/i);
  if (match) {
    const num = parseInt(match[1], 10);
    return SPEAKER_COLORS[(num - 1) % SPEAKER_COLORS.length];
  }
  return SPEAKER_COLORS[fallbackIndex % SPEAKER_COLORS.length];
}

export const QUICK_PRESETS = [
  {
    title: "Theatrical Drama",
    text: `**Characters:**\n* **MAYA** — emotional, worried, trying to stay strong\n* **DAVID** — calm at first, then defensive and angry\n* **JAMES** — Maya's friend, supportive and concerned\n\n---\n\n**[SCENE 1 — EVENING. MAYA'S LIVING ROOM]**\n\n**MAYA:**\n[quietly, looking at her phone]\nHe hasn't replied all day.\n\n**JAMES:**\nMaybe he's busy. Give him some time.\n\n**MAYA:**\n[frustrated]\nNo. Something is wrong. David always replies.\n\n**DAVID:**\n[entering]\n[raises his voice]\nI said nothing happened!\n\n**MAYA:**\n[holding back tears]\nJames... what if he's leaving me?\n\n[pause]\n\n**JAMES:**\nWhatever happens, you don't have to face it alone.`,
  },
  {
    title: "3-Dialect Persona",
    text: "**Alex (US):** Welcome to the Global Tech Round Table. Today we're tracking the revolution in on-device AI runtimes.\n**Emma (UK):** Brilliant to be here, Alex. Across European studios, creators are prioritizing neural pipelines that run entirely offline without recurring API fees.\n**Marcus (Northern UK):** Aye, and the performance leap is massive. We're getting ultra-crisp audio with practically zero latency straight from local hardware.\n**Alex (US):** Exactly. When neural models run locally, synthesis feels as immediate and dynamic as a real conversation.\n**Emma (UK):** It truly transforms multi-character audiobooks, podcasts, and video voiceovers.",
  },
  {
    title: "Tech Podcast Host",
    text: "Welcome to Future Tech Daily, your morning briefing on artificial intelligence, neural computing, and tomorrow's creative tools. I'm your host, and today we're exploring high-fidelity on-device voice generation.",
  },
  {
    title: "Cinematic Narration",
    text: "Beyond the eastern ridge, the forgotten citadel emerged from the morning mist. Centuries of frost clung to its obsidian spires, whispering ancient secrets to anyone daring enough to listen.",
  },
  {
    title: "Two-Voice Interview",
    text: "**Host, male:** Welcome back, Sarah. What is the biggest advantage of running neural speech directly on device?\n**Sarah, female:** Total privacy and zero network latency, Alex. You get instant studio-grade rendering without waiting on remote cloud servers.\n**Host, male:** And the vocal warmth sounds remarkably lifelike.\n**Sarah, female:** Exactly. The pacing and emotional nuance feel completely natural.",
  },
];

export function normalizeSpeakerKey(label: string): string {
  return label.replace(/\*+/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function normalizeSpeakerLabel(label: string): string {
  return label.replace(/\*+/g, "").replace(/\s+/g, " ").trim();
}

export function normalizeGender(value?: string): "male" | "female" | undefined {
  const normalized = value?.toLowerCase();
  return normalized === "male" || normalized === "female" ? normalized : undefined;
}

export function inferDialectFromSpeaker(label: string): "us" | "gb" | "northern" | undefined {
  const lower = label.toLowerCase();
  if (lower.includes("northern")) return "northern";
  if (lower.includes("uk") || lower.includes("gb") || lower.includes("british") || lower.includes("london")) return "gb";
  if (lower.includes("us") || lower.includes("american") || lower.includes("usa")) return "us";
  return undefined;
}

export function inferGenderFromSpeaker(label: string): "male" | "female" | undefined {
  const normalized = normalizeSpeakerKey(label).replace(/\(.*?\)/g, "").trim();
  const speakerMatch = normalized.match(/^speaker\s*(\d+)$/);
  if (speakerMatch) {
    const speakerNumber = Number(speakerMatch[1]);
    if (Number.isFinite(speakerNumber)) {
      return speakerNumber % 2 === 0 ? "female" : "male";
    }
  }

  const maleNames = [
    "mark", "alex", "marcus", "ethan", "caleb", "james", "john", "david", "michael",
    "daniel", "peter", "adam", "george", "lewis", "alan", "ryan", "eric", "liam",
    "tom", "thomas", "sam", "paul", "steve", "steven", "chris", "brian", "kevin"
  ];
  const femaleNames = [
    "emma", "sarah", "elena", "amy", "mary", "grace", "jane", "linda", "cori",
    "kathleen", "heart", "bella", "nicole", "isabella", "alice", "lily", "maya", "amara",
    "anna", "claire", "sophia", "jessica", "lucy", "rachel", "hannah", "chloe"
  ];

  for (const name of maleNames) {
    if (normalized.includes(name)) return "male";
  }
  for (const name of femaleNames) {
    if (normalized.includes(name)) return "female";
  }
  return undefined;
}

const RESERVED_NON_SPEAKERS = new Set([
  "note", "warning", "caution", "tip", "important", "example",
  "ps", "p.s.", "url", "http", "https", "step", "summary", "q", "a",
  "characters", "character", "cast", "scene", "scenes", "act", "prologue", "epilogue",
  "setting", "time", "place", "location", "synopsis", "foley", "sfx", "sound", "music",
  "fade", "cut", "title", "credits"
]);

export function isLikelySpeakerName(name: string): boolean {
  const clean = normalizeSpeakerLabel(name);
  if (!clean || clean.length < 2) return false;
  const lower = clean.toLowerCase();
  if (RESERVED_NON_SPEAKERS.has(lower)) return false;
  if (/^(?:scene|act|prologue|epilogue|chapter|characters?|cast)\b/i.test(lower)) return false;

  // Speaker N (supports optional gender/role descriptor e.g. "Speaker 1, male" or "Speaker 1 (male)")
  if (/^speaker\s*\d+(?:,\s*[a-zA-Z]+|\s*\([a-zA-Z]+\))?$/i.test(clean)) return true;

  // Canonical role labels
  if (/^(narrator|host|interviewer|director|guest|announcer|moderator|student|sponsor|character\s*\d+)(?:,\s*[a-zA-Z]+|\s*\([a-zA-Z]+\))?$/i.test(clean)) {
    return true;
  }

  // Proper names like "Mark", "George", "Alex (US)", "Dr. Smith", "Emma Watson", "MAYA", "DAVID"
  if (/^[A-Za-z][a-zA-Z0-9_'’.-]*(?:\s+[A-Za-z0-9_'’.-]*){0,2}(?:\s*\([A-Za-z0-9 ]+\))?$/.test(clean)) {
    return true;
  }

  return false;
}

/**
 * Extracts character descriptions from a script's "Characters:" section.
 */
export interface CharacterBio {
  name: string;
  key: string;
  bio: string;
  gender?: "male" | "female";
}

export function parseCharacterBios(script: string): Map<string, CharacterBio> {
  const bios = new Map<string, CharacterBio>();
  if (!script) return bios;

  // Look for Characters section:
  // **Characters:**
  // * **MAYA** — emotional, worried, trying to stay strong
  const charBlockMatch = script.match(/(?:^|\n)[ \t]*(?:\*\*)?Characters(?:\*\*)?[ \t]*:?\s*([\s\S]*?)(?=\n[ \t]*(?:---|\*\*\[|\[SCENE))/i);
  const blockText = charBlockMatch ? charBlockMatch[1] : script;

  const bioLineRegex = /(?:^|\n)[ \t]*(?:[-*•]\s*)?(?:\*\*)?([A-Za-z0-9_.'’ -]+?)(?:\*\*)?[ \t]*[—–-][ \t]*(.+)/g;
  for (const match of blockText.matchAll(bioLineRegex)) {
    const rawName = normalizeSpeakerLabel(match[1]);
    const key = normalizeSpeakerKey(rawName);
    const bio = match[2].trim();

    if (key && !RESERVED_NON_SPEAKERS.has(key)) {
      let gender: "male" | "female" | undefined = inferGenderFromSpeaker(rawName);
      const bioLower = bio.toLowerCase();
      if (!gender) {
        if (/\b(she|her|woman|female|sister|mother|daughter|girl|actress)\b/i.test(bioLower)) {
          gender = "female";
        } else if (/\b(he|his|him|man|male|brother|father|son|boy|actor)\b/i.test(bioLower)) {
          gender = "male";
        }
      }

      bios.set(key, {
        name: rawName,
        key,
        bio,
        gender,
      });
    }
  }

  return bios;
}

/**
 * Strips formatting cues, timestamp brackets, markdown bold, boundary punctuation,
 * and theatrical stage directions so the voice synthesizer NEVER speaks metadata or timing tags.
 */
export function cleanDialogueText(value: string): string {
  return value
    // Remove markdown dividers
    .replace(/^---+$/gm, "")
    // Remove scene headings like [SCENE 1 ...] or **[SCENE 1 ...]**
    .replace(/(?:\*\*)?\[\s*SCENE\s+[^\]]+\](?:\*\*)?/gi, "")
    // Remove embedded timestamps: [00:00 - 00:06] or [00:00]
    .replace(/\[\s*\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:\s*[-–—~]\s*\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)?\s*\]/g, "")
    // Remove bracketed stage directions, action cues, and emotions: [quietly], [Door opens.], [pause], etc.
    .replace(/\[[^\]]+\]/g, "")
    // Remove parenthetical stage directions: (whispers), (pause)
    .replace(/\([A-Za-z0-9 ,.'’—–-]+\)/g, "")
    // Remove markdown bold
    .replace(/\*\*/g, "")
    // Remove leading/trailing dialogue quotes
    .replace(/^["'“”]+|["'“”]+$/g, "")
    // Normalize spaces
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts stage directions, emotional parentheticals, and pause beats
 * from turn content before stripping them from spoken dialogue.
 */
export function extractStageDirections(value: string): {
  cleanedText: string;
  cues: string[];
  pauseDuration?: number;
} {
  const cues: string[] = [];
  let pauseDuration: number | undefined;

  // Extract all square brackets [ ... ]
  const bracketRegex = /\[([^\]]+)\]/g;
  for (const match of value.matchAll(bracketRegex)) {
    const raw = match[1].trim();
    const pause = parsePauseDuration(raw);
    if (pause !== null) {
      pauseDuration = Math.max(pauseDuration || 0, pause);
    } else if (!/^SCENE\s+/i.test(raw) && !/^(?:\d{1,2}:\d{2})/i.test(raw)) {
      cues.push(raw);
    }
  }

  // Extract parenthetical cues like (whispers) or (calmly)
  const parenRegex = /\(([A-Za-z ,.'’—–-]+)\)/g;
  for (const match of value.matchAll(parenRegex)) {
    const raw = match[1].trim();
    const pause = parsePauseDuration(raw);
    if (pause !== null) {
      pauseDuration = Math.max(pauseDuration || 0, pause);
    } else {
      cues.push(raw);
    }
  }

  const cleanedText = cleanDialogueText(value);

  return {
    cleanedText,
    cues,
    pauseDuration,
  };
}

/**
 * Primary regex matching line-oriented speaker turns with optional timestamp brackets:
 * Matches:
 *   [00:00 - 00:06] Speaker 1: ...
 *   [00:00 - 00:06] Mark: ...
 *   [00:00 - 00:06] **Mark:** ...
 *   Speaker 1: ...
 *   Mark: ...
 *   **Speaker 2, female:** ...
 *   **MAYA:** ...
 */
const SCRIPT_TURN_PATTERN =
  /(?:^|\n|(?<=[.!?“"”])\s+)[ \t]*(?:(\[\s*\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:[ \t]*[-–—~][ \t]*\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)?[ \t]*\])[ \t]*)?(?:\*\*)?([A-Za-z0-9_.'’() -]+?)(?:[ \t]*,[ \t]*(male|female))?(?:\*\*)?[ \t]*:[ \t]*/gi;

/**
 * Parses script text into structured dialogue turns with timestamps,
 * emotions, and speaker tags cleanly separated from spoken dialogue.
 */
export function parseScriptTurns(script: string): ScriptTurn[] {
  if (!script) return [];

  const input = script.replace(/\\\s*/g, " ").replace(/\r\n?/g, "\n");
  const matches = Array.from(input.matchAll(SCRIPT_TURN_PATTERN));
  if (matches.length === 0) return [];

  const validMatches = matches.filter((m) => isLikelySpeakerName(m[2]));
  if (validMatches.length === 0) return [];

  const characterBios = parseCharacterBios(input);

  // Track speaker color index order
  const speakerColorMap = new Map<string, number>();
  let nextColorIndex = 0;

  const turns: ScriptTurn[] = [];

  for (let i = 0; i < validMatches.length; i++) {
    const current = validMatches[i];
    const next = validMatches[i + 1];

    const contentStart = (current.index ?? 0) + current[0].length;
    const contentEnd = next ? (next.index ?? input.length) : input.length;

    const rawSpeaker = normalizeSpeakerLabel(current[2]);
    const speakerKey = normalizeSpeakerKey(rawSpeaker);

    if (!speakerColorMap.has(speakerKey)) {
      speakerColorMap.set(speakerKey, nextColorIndex % SPEAKER_COLORS.length);
      nextColorIndex++;
    }

    const colorIndex = speakerColorMap.get(speakerKey) ?? 0;
    const timestamp = current[1]?.trim();
    const cleanTimestamp = timestamp ? timestamp.replace(/^\[\s*|\s*\]$/g, "") : undefined;

    const rawText = input.slice(contentStart, contentEnd);
    const { cleanedText, cues, pauseDuration } = extractStageDirections(rawText);
    const emotionResult = detectEmotion(cues, cleanedText);
    const bioInfo = characterBios.get(speakerKey);

    // If there is spoken text or a deliberate action/pause cue, create a turn
    if (cleanedText.length > 0 || (pauseDuration && pauseDuration > 0) || cues.length > 0) {
      turns.push({
        speakerKey,
        speakerLabel: rawSpeaker,
        timestamp,
        cleanTimestamp,
        gender: normalizeGender(current[3]) || bioInfo?.gender || inferGenderFromSpeaker(rawSpeaker),
        text: cleanedText,
        colorIndex,
        emotion: emotionResult.emotion,
        emotionBadge: emotionResult.profile.badge,
        emotionCues: emotionResult.detectedCues,
        pauseDuration: pauseDuration || (cleanedText.length === 0 ? 0.8 : undefined),
        isPause: cleanedText.length === 0,
      });
    }
  }

  return turns;
}

/**
 * Strips ALL script tags, timestamps, stage directions, and speaker prefixes
 * so the TTS engine synthesizes natural, continuous flowing speech output.
 */
export function stripScriptTagsAndTimestamps(script: string): string {
  if (!script) return "";

  const turns = parseScriptTurns(script);
  if (turns.length > 0) {
    return turns
      .filter((t) => !t.isPause && t.text.length > 0)
      .map((t) => t.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Fallback: strip line-by-line
  return cleanDialogueText(
    script
      .replace(/(?:^|\n)[ \t]*(?:\*\*)?(?:Speaker\s*\d+|[A-Za-z0-9_.'’() -]+?)(?:\*\*)?[ \t]*:[ \t]*/g, " ")
  );
}

export function analyzeScriptText(script: string): ScriptAnalysis {
  const turns = parseScriptTurns(script);
  const characterBios = parseCharacterBios(script);

  const speakerMap = new Map<string, ScriptSpeaker>();
  const emotionCountsBySpeaker = new Map<string, Map<EmotionType, number>>();

  for (const turn of turns) {
    const existing = speakerMap.get(turn.speakerKey);
    const bioInfo = characterBios.get(turn.speakerKey);

    if (turn.emotion) {
      if (!emotionCountsBySpeaker.has(turn.speakerKey)) {
        emotionCountsBySpeaker.set(turn.speakerKey, new Map());
      }
      const countMap = emotionCountsBySpeaker.get(turn.speakerKey)!;
      countMap.set(turn.emotion, (countMap.get(turn.emotion) || 0) + 1);
    }

    if (existing) {
      existing.turns += 1;
      existing.gender = existing.gender || turn.gender || bioInfo?.gender;
      existing.dialect = existing.dialect || inferDialectFromSpeaker(turn.speakerLabel);
      existing.bio = existing.bio || bioInfo?.bio;
    } else {
      speakerMap.set(turn.speakerKey, {
        key: turn.speakerKey,
        label: turn.speakerLabel,
        gender: turn.gender || bioInfo?.gender || inferGenderFromSpeaker(turn.speakerLabel),
        dialect: inferDialectFromSpeaker(turn.speakerLabel),
        bio: bioInfo?.bio,
        turns: 1,
        colorIndex: turn.colorIndex,
      });
    }
  }

  // Assign dominant emotion per speaker
  for (const [key, speaker] of speakerMap.entries()) {
    const counts = emotionCountsBySpeaker.get(key);
    if (counts) {
      let maxEmotion: EmotionType = "neutral";
      let maxCount = 0;
      for (const [emo, count] of counts.entries()) {
        if (emo !== "neutral" && count > maxCount) {
          maxCount = count;
          maxEmotion = emo;
        }
      }
      if (maxEmotion !== "neutral") {
        speaker.dominantEmotion = maxEmotion;
      }
    }
  }

  const speakers = Array.from(speakerMap.values());
  const hasDialogue = turns.length >= 2 && speakers.length >= 2;

  const biosRecord: Record<string, string> = {};
  for (const [k, v] of characterBios.entries()) {
    biosRecord[k] = v.bio;
  }

  return {
    mode: hasDialogue ? "dialogue" : "single",
    turns: turns.length,
    speakers,
    parsedTurns: turns,
    characterBios: biosRecord,
    reason: hasDialogue
      ? `Detected ${speakers.length} speakers across ${turns.length} dialogue turns with emotion & stage direction parsing.`
      : turns.length > 0
      ? `Detected ${turns.length} dialogue turn${turns.length === 1 ? "" : "s"} for ${speakers[0]?.label || "Speaker"}.`
      : "Standard narration text without speaker cues.",
  };
}
