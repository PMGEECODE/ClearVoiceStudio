import fs from "fs";
import os from "os";
import path from "path";
import { logServerEvent } from "@/lib/serverLog";
import type { UserPreferences } from "@/lib/preferencesSchema";
import { PREFERENCES_DEFAULTS } from "@/lib/preferencesSchema";
export type { UserPreferences };
export { PREFERENCES_DEFAULTS };

// ---------------------------------------------------------------------------
// Field validators — server-side only, one entry per preference key
// ---------------------------------------------------------------------------
const VALIDATORS: Record<
  keyof Omit<UserPreferences, "savedAt">,
  (v: unknown) => boolean
> = {
  voice: (v) => typeof v === "string" && v.length > 0 && v.length <= 128,
  speakerId: (v) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 999,
  lengthScale: (v) => typeof v === "number" && v >= 0.1 && v <= 5.0,
  noiseScale: (v) => typeof v === "number" && v >= 0 && v <= 1.0,
  noiseWScale: (v) => typeof v === "number" && v >= 0 && v <= 1.0,
  sentenceSilence: (v) => typeof v === "number" && v >= 0 && v <= 10.0,
  prosodyEnabled: (v) => typeof v === "boolean",
  prosodyProfile: (v) =>
    typeof v === "string" &&
    ["conversational", "narration", "podcast", "audiobook", "announcement"].includes(v),
  prosodyDebug: (v) => typeof v === "boolean",
  emotionEnabled: (v) => typeof v === "boolean",
  emotionIntensity: (v) => typeof v === "number" && !Number.isNaN(v) && v >= 0 && v <= 1.5,
  volume: (v) => typeof v === "number" && !Number.isNaN(v) && v >= 0 && v <= 1.0,
};

// ---------------------------------------------------------------------------
// File path
// ---------------------------------------------------------------------------

function getPreferencesDir(): string {
  if (process.env.CVS_DATA_DIR) return process.env.CVS_DATA_DIR;

  const base =
    process.platform === "win32"
      ? process.env.APPDATA || process.env.LOCALAPPDATA || os.tmpdir()
      : process.env.XDG_DATA_HOME ||
        (process.env.HOME ? path.join(process.env.HOME, ".local", "share") : os.tmpdir());

  return path.join(base, "ClearVoice Studio");
}

export function getPreferencesFilePath(): string {
  return path.join(getPreferencesDir(), "user-preferences.json");
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function readPreferences(): Promise<UserPreferences> {
  const filePath = getPreferencesFilePath();
  try {
    try {
      await fs.promises.access(filePath);
    } catch {
      return { ...PREFERENCES_DEFAULTS };
    }
    const raw = await fs.promises.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;

    // Merge with defaults — unknown keys are dropped, invalid values fall back
    const result: UserPreferences = { ...PREFERENCES_DEFAULTS };
    for (const key of Object.keys(VALIDATORS) as Array<
      keyof Omit<UserPreferences, "savedAt">
    >) {
      const incoming = parsed[key];
      if (incoming !== undefined && VALIDATORS[key](incoming)) {
        // @ts-expect-error — dynamic key assignment is safe here
        result[key] = incoming;
      }
    }
    return result;
  } catch (err) {
    logServerEvent(
      "preferences",
      "Failed to read preferences file — using defaults",
      { filePath, error: err instanceof Error ? err.message : String(err) },
      "warn"
    );
    return { ...PREFERENCES_DEFAULTS };
  }
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export async function writePreferences(
  prefs: Partial<UserPreferences>
): Promise<UserPreferences> {
  const current = await readPreferences();
  const next: UserPreferences = { ...current };

  // Validate and apply each field individually
  for (const key of Object.keys(VALIDATORS) as Array<
    keyof Omit<UserPreferences, "savedAt">
  >) {
    const incoming = prefs[key];
    if (incoming !== undefined) {
      if (!VALIDATORS[key](incoming)) {
        throw new RangeError(
          `Invalid value for preferences field "${key}": ${JSON.stringify(incoming)}`
        );
      }
      // @ts-expect-error — dynamic key assignment is safe here
      next[key] = incoming;
    }
  }

  next.savedAt = new Date().toISOString();

  const filePath = getPreferencesFilePath();
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, JSON.stringify(next, null, 2), "utf-8");
    logServerEvent("preferences", "Preferences saved", { filePath });
  } catch (err) {
    logServerEvent(
      "preferences",
      "Failed to write preferences file",
      { filePath, error: err instanceof Error ? err.message : String(err) },
      "error"
    );
    throw err;
  }

  return next;
}
