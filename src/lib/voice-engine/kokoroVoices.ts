import { UnifiedVoiceInfo } from "./types";
import { DEFAULT_VOICE_ID } from "@/lib/voiceStorage";

export interface KokoroVoiceDef {
  id: string; // e.g. "af_heart"
  name: string; // e.g. "Heart"
  language: string;
  languageCode: string;
  country: string;
  gender: "female" | "male";
  quality: string;
  sampleRate: number;
}

export const DEFAULT_VOICE = DEFAULT_VOICE_ID;

export const KOKORO_VOICES_CATALOG: KokoroVoiceDef[] = [
  // American Female
  { id: "af_heart", name: "Heart", language: "English (US)", languageCode: "en_US", country: "United States", gender: "female", quality: "master", sampleRate: 24000 },
  { id: "af_bella", name: "Bella", language: "English (US)", languageCode: "en_US", country: "United States", gender: "female", quality: "conversational", sampleRate: 24000 },
  { id: "af_sarah", name: "Sarah", language: "English (US)", languageCode: "en_US", country: "United States", gender: "female", quality: "natural", sampleRate: 24000 },
  { id: "af_nicole", name: "Nicole", language: "English (US)", languageCode: "en_US", country: "United States", gender: "female", quality: "natural", sampleRate: 24000 },
  { id: "af_aoede", name: "Aoede", language: "English (US)", languageCode: "en_US", country: "United States", gender: "female", quality: "natural", sampleRate: 24000 },
  { id: "af_alloy", name: "Alloy", language: "English (US)", languageCode: "en_US", country: "United States", gender: "female", quality: "expressive", sampleRate: 24000 },
  { id: "af_jessica", name: "Jessica", language: "English (US)", languageCode: "en_US", country: "United States", gender: "female", quality: "natural", sampleRate: 24000 },
  { id: "af_kore", name: "Kore", language: "English (US)", languageCode: "en_US", country: "United States", gender: "female", quality: "natural", sampleRate: 24000 },
  { id: "af_nova", name: "Nova", language: "English (US)", languageCode: "en_US", country: "United States", gender: "female", quality: "natural", sampleRate: 24000 },
  { id: "af_river", name: "River", language: "English (US)", languageCode: "en_US", country: "United States", gender: "female", quality: "natural", sampleRate: 24000 },
  { id: "af_sky", name: "Sky", language: "English (US)", languageCode: "en_US", country: "United States", gender: "female", quality: "natural", sampleRate: 24000 },

  // American Male
  { id: "am_adam", name: "Adam", language: "English (US)", languageCode: "en_US", country: "United States", gender: "male", quality: "conversational", sampleRate: 24000 },
  { id: "am_michael", name: "Michael", language: "English (US)", languageCode: "en_US", country: "United States", gender: "male", quality: "natural", sampleRate: 24000 },
  { id: "am_eric", name: "Eric", language: "English (US)", languageCode: "en_US", country: "United States", gender: "male", quality: "natural", sampleRate: 24000 },
  { id: "am_fenrir", name: "Fenrir", language: "English (US)", languageCode: "en_US", country: "United States", gender: "male", quality: "dramatic", sampleRate: 24000 },
  { id: "am_liam", name: "Liam", language: "English (US)", languageCode: "en_US", country: "United States", gender: "male", quality: "natural", sampleRate: 24000 },
  { id: "am_onyx", name: "Onyx", language: "English (US)", languageCode: "en_US", country: "United States", gender: "male", quality: "deep", sampleRate: 24000 },
  { id: "am_puck", name: "Puck", language: "English (US)", languageCode: "en_US", country: "United States", gender: "male", quality: "lively", sampleRate: 24000 },
  { id: "am_echo", name: "Echo", language: "English (US)", languageCode: "en_US", country: "United States", gender: "male", quality: "natural", sampleRate: 24000 },
  { id: "am_santa", name: "Santa", language: "English (US)", languageCode: "en_US", country: "United States", gender: "male", quality: "warm", sampleRate: 24000 },

  // British Female
  { id: "bf_emma", name: "Emma", language: "English (GB)", languageCode: "en_GB", country: "United Kingdom", gender: "female", quality: "conversational", sampleRate: 24000 },
  { id: "bf_isabella", name: "Isabella", language: "English (GB)", languageCode: "en_GB", country: "United Kingdom", gender: "female", quality: "natural", sampleRate: 24000 },
  { id: "bf_alice", name: "Alice", language: "English (GB)", languageCode: "en_GB", country: "United Kingdom", gender: "female", quality: "natural", sampleRate: 24000 },
  { id: "bf_lily", name: "Lily", language: "English (GB)", languageCode: "en_GB", country: "United Kingdom", gender: "female", quality: "natural", sampleRate: 24000 },

  // British Male
  { id: "bm_george", name: "George", language: "English (GB)", languageCode: "en_GB", country: "United Kingdom", gender: "male", quality: "conversational", sampleRate: 24000 },
  { id: "bm_lewis", name: "Lewis", language: "English (GB)", languageCode: "en_GB", country: "United Kingdom", gender: "male", quality: "natural", sampleRate: 24000 },
  { id: "bm_daniel", name: "Daniel", language: "English (GB)", languageCode: "en_GB", country: "United Kingdom", gender: "male", quality: "natural", sampleRate: 24000 },
  { id: "bm_fable", name: "Fable", language: "English (GB)", languageCode: "en_GB", country: "United Kingdom", gender: "male", quality: "storyteller", sampleRate: 24000 },
];

export function mapKokoroVoiceToUnified(def: KokoroVoiceDef, isInstalled: boolean): UnifiedVoiceInfo {
  const isDefault = def.id === DEFAULT_VOICE_ID;
  const installed = isDefault || isInstalled;

  return {
    id: def.id,
    name: def.name,
    displayName: `${def.name} (${def.languageCode.replace("_", "-")} • ${def.gender === "female" ? "Female" : "Male"} • 24kHz)${isDefault ? " [Default]" : ""}`,
    language: def.language,
    languageCode: def.languageCode,
    country: def.country,
    gender: def.gender,
    quality: def.quality,
    sampleRate: def.sampleRate,
    numSpeakers: 1,
    provider: "kokoro",
    isInstalled: installed,
    requiresDownload: !installed,
    downloadLabel: isDefault ? "Default Voice" : "Neural Voice (510 KB)",
    sizeBytes: 522240,
  };
}
