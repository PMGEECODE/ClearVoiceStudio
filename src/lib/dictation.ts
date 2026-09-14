/**
 * src/lib/dictation.ts
 *
 * Provides a unified speech-to-text dictation interface:
 *
 *  1. Google Chrome (desktop/web) — native webkitSpeechRecognition (fast, streaming).
 *  2. Brave / Chromium / Firefox / any browser without working Web Speech API —
 *     automatic fallback to on-device Whisper Tiny via @xenova/transformers (WASM).
 *  3. Electron Desktop App — always uses Whisper Tiny (no Google API keys available).
 *
 * Priority:
 *   Electron        → Whisper always
 *   Browser (Chrome) → Web Speech API; on "network" error auto-retries with Whisper
 *   Browser (other)  → Whisper directly (SpeechRecognition absent or unreliable)
 */

export function isElectron(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window as unknown as { electronAPI?: unknown }).electronAPI ||
    navigator.userAgent.includes("Electron")
  );
}

export interface DictationCallbacks {
  onStart?: () => void;
  onInterim?: (interimText: string) => void;
  onFinal?: (finalText: string) => void;
  onError?: (errorMessage: string) => void;
  onEnd?: () => void;
  onModeChange?: (mode: DictationMode) => void;
  onStatusChange?: (status: DictationStatus) => void;
}

export type DictationMode = "browser-native" | "whisper-wasm";
export type DictationStatus = "idle" | "starting" | "recording" | "switching" | "loading-model" | "processing";

export interface DictationController {
  start: () => Promise<void>;
  stop: () => void;
  isListening: () => boolean;
  mode: DictationMode;
}

// ──────────────────────────────────────────────────────────────────────────────
// Shared Whisper pipeline singleton (cached across controller instances)
// ──────────────────────────────────────────────────────────────────────────────

let whisperPipelinePromise: Promise<unknown> | null = null;

async function getWhisperPipeline(onProgress?: (msg: string) => void) {
  if (!whisperPipelinePromise) {
    whisperPipelinePromise = (async () => {
      onProgress?.("Loading local speech model (first time only — ~39 MB)…");
      const { pipeline, env } = await import("@xenova/transformers");
      env.useBrowserCache = true;
      env.allowLocalModels = false;
      return pipeline("automatic-speech-recognition", "Xenova/whisper-tiny.en");
    })().catch((err) => {
      whisperPipelinePromise = null;
      console.error("[Whisper] Failed to initialize pipeline:", err);
      throw err;
    });
  }
  return whisperPipelinePromise;
}

// ──────────────────────────────────────────────────────────────────────────────
// Audio Resampling Helper: Resamples audio buffer to 16,000 Hz for Whisper
// ──────────────────────────────────────────────────────────────────────────────

async function resampleTo16k(audioData: Float32Array, origSampleRate: number): Promise<Float32Array> {
  if (origSampleRate === 16000) return audioData;
  const targetSampleRate = 16000;
  const numTargetSamples = Math.round((audioData.length * targetSampleRate) / origSampleRate);
  if (numTargetSamples <= 0) return new Float32Array(0);

  try {
    const OfflineAudioCtx =
      window.OfflineAudioContext ||
      (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (OfflineAudioCtx) {
      const offlineCtx = new OfflineAudioCtx(1, numTargetSamples, targetSampleRate);
      const buffer = offlineCtx.createBuffer(1, audioData.length, origSampleRate);
      buffer.getChannelData(0).set(audioData);
      const source = offlineCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(offlineCtx.destination);
      source.start(0);
      const rendered = await offlineCtx.startRendering();
      return rendered.getChannelData(0);
    }
  } catch {
    // Fall back to linear interpolation if OfflineAudioContext fails
  }

  // Linear interpolation fallback
  const result = new Float32Array(numTargetSamples);
  const ratio = (audioData.length - 1) / (numTargetSamples - 1 || 1);
  for (let i = 0; i < numTargetSamples; i++) {
    const srcIndex = i * ratio;
    const low = Math.floor(srcIndex);
    const high = Math.min(low + 1, audioData.length - 1);
    const weight = srcIndex - low;
    result[i] = audioData[low] * (1 - weight) + audioData[high] * weight;
  }
  return result;
}

// ──────────────────────────────────────────────────────────────────────────────
// Whisper controller — works identically in Electron AND web browsers
// ──────────────────────────────────────────────────────────────────────────────

function createWhisperController(callbacks: DictationCallbacks): DictationController {
  let active = false;
  let audioContext: AudioContext | null = null;
  let mediaStream: MediaStream | null = null;
  let processorNode: ScriptProcessorNode | null = null;
  let pcmChunks: Float32Array[] = [];
  let recordingSampleRate = 16000;

  const stop = () => {
    if (!active) return;
    active = false;

    callbacks.onStatusChange?.("processing");
    callbacks.onInterim?.("Transcribing locally…");

    if (processorNode) {
      try { processorNode.disconnect(); } catch { /* ignored */ }
      processorNode = null;
    }
    if (mediaStream) {
      try { mediaStream.getTracks().forEach((t) => t.stop()); } catch { /* ignored */ }
      mediaStream = null;
    }
    if (audioContext && audioContext.state !== "closed") {
      try { audioContext.close(); } catch { /* ignored */ }
      audioContext = null;
    }

    const totalLength = pcmChunks.reduce((acc, c) => acc + c.length, 0);
    if (totalLength < recordingSampleRate * 0.1) {
      // Less than ~0.1 s — nothing meaningful to transcribe
      callbacks.onStatusChange?.("idle");
      callbacks.onEnd?.();
      return;
    }

    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of pcmChunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    pcmChunks = [];

    const sampleRate = recordingSampleRate;

    (async () => {
      try {
        const audio16k = await resampleTo16k(merged, sampleRate);
        const transcriber = (await getWhisperPipeline((message) => {
          callbacks.onStatusChange?.("loading-model");
          callbacks.onInterim?.(message);
        })) as (audio: Float32Array) => Promise<{ text: string }>;
        const result = await transcriber(audio16k);
        const transcript = (result?.text ?? "").trim();
        if (transcript) callbacks.onFinal?.(transcript);
      } catch (err: unknown) {
        console.error("[Whisper] Transcription error:", err);
        const msg = err instanceof Error ? err.message : "Transcription failed";
        callbacks.onError?.(`Local dictation error: ${msg}`);
      } finally {
        callbacks.onStatusChange?.("idle");
        callbacks.onEnd?.();
      }
    })();
  };

  const start = async () => {
    try {
      callbacks.onModeChange?.("whisper-wasm");
      callbacks.onStatusChange?.("starting");
      pcmChunks = [];
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Important: Allow AudioContext to use native hardware sample rate (e.g., 44.1kHz or 48kHz).
      // Forcing sampleRate: 16000 causes Firefox and some browsers to throw:
      // "Connecting AudioNodes from AudioContexts with different sample-rate is currently not supported."
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioContext = new AudioCtx();
      recordingSampleRate = audioContext.sampleRate || 16000;

      const source = audioContext.createMediaStreamSource(mediaStream);
      processorNode = audioContext.createScriptProcessor(4096, 1, 1);

      processorNode.onaudioprocess = (event) => {
        if (!active) return;
        pcmChunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      };

      source.connect(processorNode);
      processorNode.connect(audioContext.destination);

      active = true;
      callbacks.onStatusChange?.("recording");
      callbacks.onStart?.();
      callbacks.onInterim?.("(Listening… click Dictate again to finish)");

      // Eagerly warm up the Whisper pipeline in the background so the first
      // transcription is faster.
      getWhisperPipeline().catch(() => { /* non-fatal */ });
    } catch (err: unknown) {
      active = false;
      const msg = err instanceof Error ? err.message : "Microphone access denied";
      callbacks.onError?.(msg);
      callbacks.onStatusChange?.("idle");
      callbacks.onEnd?.();
    }
  };

  return {
    start,
    stop,
    isListening: () => active,
    mode: "whisper-wasm",
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Native browser Web Speech API controller (Chrome only in practice)
// Falls back to Whisper on "network" error (Brave / Chromium) or if the API
// is unavailable at all (Firefox).
// ──────────────────────────────────────────────────────────────────────────────

type SpeechRecognitionType = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechRecognitionClass(): (new () => SpeechRecognitionType) | null {
  if (typeof window === "undefined") return null;
  return (
    (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionType }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionType }).webkitSpeechRecognition ??
    null
  );
}

function createNativeBrowserController(
  callbacks: DictationCallbacks,
  SpeechRecognitionClass: new () => SpeechRecognitionType,
  /** Called when the native API fails with a network error — triggers Whisper fallback */
  onNetworkFallback: () => void
): DictationController {
  let active = false;
  let recognitionInstance: SpeechRecognitionType | null = null;

  const stop = () => {
    active = false;
    if (recognitionInstance) {
      try { recognitionInstance.stop(); } catch { /* ignored */ }
      recognitionInstance = null;
    }
    callbacks.onEnd?.();
  };

  const start = async () => {
    try {
      callbacks.onModeChange?.("browser-native");
      callbacks.onStatusChange?.("starting");
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onstart = () => {
        active = true;
        callbacks.onStatusChange?.("recording");
        callbacks.onStart?.();
      };

      recognition.onresult = (event: unknown) => {
        const ev = event as {
          resultIndex: number;
          results: {
            length: number;
            [index: number]: { isFinal: boolean; [index: number]: { transcript: string } };
          };
        };

        let finalChunk = "";
        let interim = "";
        for (let i = ev.resultIndex; i < ev.results.length; ++i) {
          if (ev.results[i].isFinal) finalChunk += ev.results[i][0].transcript;
          else interim += ev.results[i][0].transcript;
        }
        if (finalChunk) callbacks.onFinal?.(finalChunk);
        if (interim) callbacks.onInterim?.(interim);
      };

      recognition.onerror = (event: { error: string }) => {
        if (event.error === "no-speech") return;

        if (event.error === "network") {
          // Brave / Chromium / any browser that blocks Google's speech endpoint.
          // Transparently fall back to local Whisper instead of showing an error.
          active = false;
          recognitionInstance = null;
          callbacks.onModeChange?.("whisper-wasm");
          callbacks.onStatusChange?.("switching");
          callbacks.onInterim?.("Switching to offline dictation (Whisper)…");
          onNetworkFallback();
          return;
        }

        let message: string;
        if (event.error === "not-allowed" || event.error === "permission-denied") {
          message = "Microphone access was denied. Please allow microphone permissions in your browser and try again.";
        } else if (event.error === "audio-capture") {
          message = "No microphone detected. Please connect a microphone and try again.";
        } else {
          message = `Microphone dictation error: ${event.error}`;
        }

        callbacks.onError?.(message);
        active = false;
        callbacks.onStatusChange?.("idle");
        callbacks.onEnd?.();
      };

      recognition.onend = () => {
        active = false;
        callbacks.onStatusChange?.("idle");
        callbacks.onEnd?.();
      };

      recognitionInstance = recognition;
      recognition.start();
    } catch (err: unknown) {
      active = false;
      const msg = err instanceof Error ? err.message : "Failed to access microphone";
      callbacks.onError?.(msg);
      callbacks.onStatusChange?.("idle");
      callbacks.onEnd?.();
    }
  };

  return {
    start,
    stop,
    isListening: () => active,
    mode: "browser-native",
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Public factory
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Returns the best available dictation controller for the current environment:
 *
 * - Electron              → Whisper WASM
 * - Chrome (web)          → Web Speech API with automatic Whisper fallback
 * - Brave / Chromium / FF → Whisper WASM directly (no Web Speech API)
 */
export function createDictationController(callbacks: DictationCallbacks): DictationController {
  if (typeof window === "undefined") {
    // SSR safety — return a no-op controller
    return {
      start: async () => {},
      stop: () => {},
      isListening: () => false,
      mode: "whisper-wasm",
    };
  }

  // Electron: always use Whisper
  if (isElectron()) {
    return createWhisperController(callbacks);
  }

  const SpeechRecognitionClass = getSpeechRecognitionClass();

  // Browser without any SpeechRecognition support (Firefox, some mobile browsers):
  // go straight to Whisper.
  if (!SpeechRecognitionClass) {
    return createWhisperController(callbacks);
  }

  // Browser with SpeechRecognition (Chrome / Edge): try native first.
  // If it fails with a "network" error, transparently switch to Whisper.
  let whisperFallback: DictationController | null = null;

  const onNetworkFallback = () => {
    whisperFallback = createWhisperController(callbacks);
    whisperFallback.start().catch(() => { /* errors already handled inside */ });
  };

  const nativeController = createNativeBrowserController(
    callbacks,
    SpeechRecognitionClass,
    onNetworkFallback
  );

  // Wrap so that stop() delegates to whichever controller is actually active.
  return {
    start: () => nativeController.start(),
    stop: () => {
      if (whisperFallback) {
        whisperFallback.stop();
        whisperFallback = null;
      } else {
        nativeController.stop();
      }
    },
    isListening: () =>
      whisperFallback ? whisperFallback.isListening() : nativeController.isListening(),
    mode: "browser-native", // updated to "whisper-wasm" if fallback is triggered
  };
}
