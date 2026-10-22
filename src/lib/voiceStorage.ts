import path from "path";
import fs from "fs";

export const DEFAULT_VOICE_ID = "af_heart";

/**
 * Resolves the active voices directory for storing downloaded Kokoro voice embeddings (.bin).
 * Checks custom environment override, Electron userData path, and local voices directory.
 */
export function getVoicesDir(): string {
  if (process.env.VOICES_DIR && fs.existsSync(process.env.VOICES_DIR)) {
    return process.env.VOICES_DIR;
  }

  if (process.env.KOKORO_VOICES_DIR && fs.existsSync(process.env.KOKORO_VOICES_DIR)) {
    return process.env.KOKORO_VOICES_DIR;
  }

  // Check if electron userData is available via env
  if (process.env.ELECTRON_USER_DATA) {
    const userVoices = path.join(process.env.ELECTRON_USER_DATA, "voices");
    if (!fs.existsSync(userVoices)) {
      try {
        fs.mkdirSync(userVoices, { recursive: true });
      } catch {}
    }
    if (fs.existsSync(userVoices)) {
      process.env.VOICES_DIR = userVoices;
      process.env.KOKORO_VOICES_DIR = userVoices;
      return userVoices;
    }
  }

  // Local/Packaged resources candidates
  const candidates = [
    path.resolve(process.cwd(), "voices"),
    (process as any).resourcesPath ? path.resolve((process as any).resourcesPath, "voices") : null,
    (process as any).resourcesPath ? path.resolve((process as any).resourcesPath, "app", "voices") : null,
  ].filter(Boolean) as string[];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      process.env.VOICES_DIR = c;
      process.env.KOKORO_VOICES_DIR = c;
      return c;
    }
  }

  const fallback = path.resolve(process.cwd(), "voices");
  try {
    fs.mkdirSync(fallback, { recursive: true });
  } catch {}
  process.env.VOICES_DIR = fallback;
  process.env.KOKORO_VOICES_DIR = fallback;
  return fallback;
}

/**
 * Checks whether a voice model (.bin) is downloaded and available for offline synthesis.
 * The default voice (af_heart) is always considered installed because it is bundled with the app.
 */
export function isVoiceDownloaded(voiceId: string): boolean {
  const cleanId = voiceId.trim();
  if (cleanId === DEFAULT_VOICE_ID) {
    return true;
  }

  const searchDirs = [
    getVoicesDir(),
    path.resolve(process.cwd(), "voices"),
    (process as any).resourcesPath ? path.resolve((process as any).resourcesPath, "voices") : null,
    (process as any).resourcesPath ? path.resolve((process as any).resourcesPath, "app", "voices") : null,
  ].filter(Boolean) as string[];

  for (const dir of searchDirs) {
    const filePath = path.join(dir, `${cleanId}.bin`);
    if (fs.existsSync(filePath)) {
      return true;
    }
  }

  return false;
}
