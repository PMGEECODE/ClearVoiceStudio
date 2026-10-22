"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { VoiceConfigState } from "@/components/VoiceSettings";
import { PREFERENCES_DEFAULTS, UserPreferences } from "@/lib/preferencesSchema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stateToPrefs(config: VoiceConfigState, vol: number): UserPreferences {
  return {
    voice: config.voice,
    speakerId: config.speakerId,
    lengthScale: config.lengthScale,
    noiseScale: config.noiseScale,
    noiseWScale: config.noiseWScale,
    sentenceSilence: config.sentenceSilence,
    prosodyEnabled: config.prosodyEnabled,
    prosodyProfile: config.prosodyProfile,
    prosodyDebug: config.prosodyDebug,
    emotionEnabled: config.emotionEnabled,
    emotionIntensity: config.emotionIntensity,
    volume: vol,
  };
}

function prefsToVoiceConfig(prefs: UserPreferences): VoiceConfigState {
  return {
    voice: prefs.voice,
    speakerId: prefs.speakerId,
    lengthScale: prefs.lengthScale,
    noiseScale: prefs.noiseScale,
    noiseWScale: prefs.noiseWScale,
    sentenceSilence: prefs.sentenceSilence,
    prosodyEnabled: prefs.prosodyEnabled,
    prosodyProfile: prefs.prosodyProfile as VoiceConfigState["prosodyProfile"],
    prosodyDebug: prefs.prosodyDebug,
    emotionEnabled: prefs.emotionEnabled,
    emotionIntensity: prefs.emotionIntensity,
  };
}

// ---------------------------------------------------------------------------
// Default VoiceConfigState derived from PREFERENCES_DEFAULTS
// ---------------------------------------------------------------------------

export const DEFAULT_VOICE_CONFIG: VoiceConfigState = prefsToVoiceConfig(PREFERENCES_DEFAULTS);

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export type PrefsStatus = "idle" | "loading" | "loaded" | "saving" | "error";

interface UsePreferencesReturn {
  voiceConfig: VoiceConfigState;
  setVoiceConfig: (next: VoiceConfigState | ((prev: VoiceConfigState) => VoiceConfigState)) => void;
  volume: number;
  setVolume: (next: number | ((prev: number) => number)) => void;
  status: PrefsStatus;
  /** ISO timestamp of the last successful server save, or null */
  lastSavedAt: string | null;
}

/**
 * Loads user preferences from the server on mount and persists any changes
 * back to the server with a 800ms debounce so rapid slider moves don't flood
 * the API. Falls back gracefully to defaults if the server is unreachable.
 */
export function usePreferences(): UsePreferencesReturn {
  const [voiceConfig, setVoiceConfigRaw] = useState<VoiceConfigState>(DEFAULT_VOICE_CONFIG);
  const [volume, setVolumeRaw] = useState<number>(PREFERENCES_DEFAULTS.volume ?? 0.8);
  const [status, setStatus] = useState<PrefsStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // Track whether the initial load has completed so we don't save defaults back
  const loadedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestConfigRef = useRef<VoiceConfigState>(DEFAULT_VOICE_CONFIG);
  const latestVolumeRef = useRef<number>(PREFERENCES_DEFAULTS.volume ?? 0.8);

  // ---------------------------------------------------------------------------
  // Load preferences on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");

    fetch("/api/preferences", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const prefs: UserPreferences = await res.json();
        if (cancelled) return;
        const config = prefsToVoiceConfig(prefs);
        setVoiceConfigRaw(config);
        latestConfigRef.current = config;

        if (typeof prefs.volume === "number" && !Number.isNaN(prefs.volume)) {
          const clamped = Math.max(0, Math.min(1, prefs.volume));
          setVolumeRaw(clamped);
          latestVolumeRef.current = clamped;
        }

        setLastSavedAt(prefs.savedAt ?? null);
        setStatus("loaded");
        loadedRef.current = true;
      })
      .catch(() => {
        if (cancelled) return;
        // Server unavailable — fall back silently to defaults
        setStatus("loaded");
        loadedRef.current = true;
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Debounced save
  // ---------------------------------------------------------------------------

  const scheduleSave = useCallback((config: VoiceConfigState, vol: number) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      setStatus("saving");
      try {
        const res = await fetch("/api/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(stateToPrefs(config, vol)),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const saved: UserPreferences = await res.json();
        setLastSavedAt(saved.savedAt ?? null);
        setStatus("loaded");
      } catch {
        // Non-fatal — user just won't have this save persisted
        setStatus("error");
        // Reset to loaded after a moment so the UI doesn't stay in error state
        setTimeout(() => setStatus("loaded"), 3000);
      }
    }, 800);
  }, []);

  // ---------------------------------------------------------------------------
  // Public setters — wrap raw setState and trigger save
  // ---------------------------------------------------------------------------

  const setVoiceConfig = useCallback(
    (next: VoiceConfigState | ((prev: VoiceConfigState) => VoiceConfigState)) => {
      setVoiceConfigRaw((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        latestConfigRef.current = resolved;
        // Only save once initial load is done (prevents writing defaults on first mount)
        if (loadedRef.current) {
          scheduleSave(resolved, latestVolumeRef.current);
        }
        return resolved;
      });
    },
    [scheduleSave]
  );

  const setVolume = useCallback(
    (next: number | ((prev: number) => number)) => {
      setVolumeRaw((prev) => {
        const raw = typeof next === "function" ? next(prev) : next;
        const resolved = Math.max(0, Math.min(1, Number.isFinite(raw) ? raw : 0.8));
        latestVolumeRef.current = resolved;
        if (loadedRef.current) {
          scheduleSave(latestConfigRef.current, resolved);
        }
        return resolved;
      });
    },
    [scheduleSave]
  );

  // Clean up pending timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  return { voiceConfig, setVoiceConfig, volume, setVolume, status, lastSavedAt };
}
