import type { ProsodyProfileId } from "@/lib/prosody";

// ---------------------------------------------------------------------------
// Shared types and defaults — imported by both server (preferences.ts)
// and client (usePreferences.ts). No Node.js imports here.
// ---------------------------------------------------------------------------

export interface UserPreferences {
  voice: string;
  speakerId: number;
  lengthScale: number;
  noiseScale: number;
  noiseWScale: number;
  sentenceSilence: number;
  prosodyEnabled: boolean;
  prosodyProfile: ProsodyProfileId;
  prosodyDebug: boolean;
  emotionEnabled: boolean;
  emotionIntensity: number;
  /** Volume level from 0.0 to 1.0 */
  volume: number;
  /** ISO timestamp of last successful save */
  savedAt?: string;
}

export const PREFERENCES_DEFAULTS: UserPreferences = {
  voice: "af_heart",
  speakerId: 0,
  lengthScale: 1.0,
  noiseScale: 0.667,
  noiseWScale: 0.8,
  sentenceSilence: 0.2,
  prosodyEnabled: true,
  prosodyProfile: "conversational",
  prosodyDebug: false,
  emotionEnabled: true,
  emotionIntensity: 0.7,
  volume: 0.8,
};
