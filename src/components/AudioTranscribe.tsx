"use client";

import React, { useCallback, useRef, useState } from "react";
import {
  Upload,
  FileAudio,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Trash2,
  ClipboardPaste,
  Plus,
  Replace,
  Users,
  Cpu,
} from "lucide-react";
import { diarizeChunks } from "@/lib/diarization";
import { CustomSelect } from "@/components/CustomSelect";


// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Stage =
  | "idle"
  | "decoding"
  | "resampling"
  | "loading-model"
  | "transcribing"
  | "diarizing"
  | "done"
  | "error";

interface TranscribeResult {
  text: string;
  durationSec: number;
  speakerCount?: number;
}

interface WhisperChunk {
  text: string;
  timestamp: [number, number | null];
}

interface Props {
  /** Called when the user wants to push the transcript into the editor */
  onInsert: (text: string, mode: "append" | "replace" | "cursor") => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Resamples any mono Float32Array to 16 000 Hz using OfflineAudioContext. */
async function resampleTo16k(
  audioData: Float32Array,
  origSampleRate: number
): Promise<Float32Array> {
  if (origSampleRate === 16_000) return audioData;
  const targetRate = 16_000;
  const numTargetSamples = Math.round(
    (audioData.length * targetRate) / origSampleRate
  );
  if (numTargetSamples <= 0) return new Float32Array(0);

  try {
    const OffCtx =
      window.OfflineAudioContext ||
      (
        window as unknown as {
          webkitOfflineAudioContext: typeof OfflineAudioContext;
        }
      ).webkitOfflineAudioContext;

    const offlineCtx = new OffCtx(1, numTargetSamples, targetRate);
    const buf = offlineCtx.createBuffer(1, audioData.length, origSampleRate);
    buf.getChannelData(0).set(audioData);
    const src = offlineCtx.createBufferSource();
    src.buffer = buf;
    src.connect(offlineCtx.destination);
    src.start(0);
    const rendered = await offlineCtx.startRendering();
    return rendered.getChannelData(0);
  } catch {
    // Linear interpolation fallback
    const result = new Float32Array(numTargetSamples);
    const ratio = (audioData.length - 1) / (numTargetSamples - 1 || 1);
    for (let i = 0; i < numTargetSamples; i++) {
      const si = i * ratio;
      const lo = Math.floor(si);
      const hi = Math.min(lo + 1, audioData.length - 1);
      result[i] = audioData[lo] * (1 - (si - lo)) + audioData[hi] * (si - lo);
    }
    return result;
  }
}

/** Mix all channels of an AudioBuffer down to mono. */
function mixDownToMono(buffer: AudioBuffer): Float32Array {
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  const mono = new Float32Array(length);
  for (let c = 0; c < channels; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) mono[i] += ch[i] / channels;
  }
  return mono;
}

function getAudioStats(audioData: Float32Array): { peak: number; rms: number } {
  let peak = 0;
  let sumSquares = 0;

  for (let i = 0; i < audioData.length; i++) {
    const sample = audioData[i];
    const abs = Math.abs(sample);
    if (abs > peak) peak = abs;
    sumSquares += sample * sample;
  }

  return {
    peak,
    rms: audioData.length > 0 ? Math.sqrt(sumSquares / audioData.length) : 0,
  };
}

function normalizeForSpeechRecognition(audioData: Float32Array): {
  audioData: Float32Array;
  gain: number;
  inputPeak: number;
  inputRms: number;
  outputPeak: number;
  outputRms: number;
} {
  const { peak, rms } = getAudioStats(audioData);

  if (audioData.length === 0 || peak < 1e-6 || rms < 1e-8) {
    return {
      audioData,
      gain: 1,
      inputPeak: peak,
      inputRms: rms,
      outputPeak: peak,
      outputRms: rms,
    };
  }

  const targetRms = 0.08;
  const gainFromRms = targetRms / rms;
  const gainFromPeak = 0.95 / peak;
  const gain = Math.max(1, Math.min(gainFromRms, gainFromPeak));

  if (gain <= 1.01) {
    return {
      audioData,
      gain: 1,
      inputPeak: peak,
      inputRms: rms,
      outputPeak: peak,
      outputRms: rms,
    };
  }

  const normalized = new Float32Array(audioData.length);
  for (let i = 0; i < audioData.length; i++) {
    normalized[i] = Math.max(-1, Math.min(1, audioData[i] * gain));
  }

  const outputStats = getAudioStats(normalized);
  return {
    audioData: normalized,
    gain,
    inputPeak: peak,
    inputRms: rms,
    outputPeak: outputStats.peak,
    outputRms: outputStats.rms,
  };
}

function normalizeTimestamp(timestamp: unknown): [number, number | null] | null {
  if (!Array.isArray(timestamp) || timestamp.length === 0) return null;

  const start = typeof timestamp[0] === "number" && Number.isFinite(timestamp[0])
    ? timestamp[0]
    : null;
  const end = typeof timestamp[1] === "number" && Number.isFinite(timestamp[1])
    ? timestamp[1]
    : null;

  if (start === null) return null;
  return [Math.max(0, start), end === null ? null : Math.max(start, end)];
}

// Transformers.js can return text in output.text, an array of results, or only
// inside timestamp chunks. Normalize once so the UI never reports 0 words while
// useful chunk text exists.
function normalizeTranscriptionOutput(output: any): { text: string; chunks: WhisperChunk[] } {
  if (Array.isArray(output)) {
    const normalized = output.map(normalizeTranscriptionOutput);
    return {
      text: normalized.map((item) => item.text).filter(Boolean).join(" ").replace(/\s+/g, " ").trim(),
      chunks: normalized.flatMap((item) => item.chunks),
    };
  }

  if (!output || typeof output !== "object") {
    return { text: "", chunks: [] };
  }

  const chunks: WhisperChunk[] = Array.isArray(output.chunks)
    ? output.chunks
        .map((chunk: any) => {
          const text = typeof chunk?.text === "string" ? chunk.text.replace(/\s+/g, " ").trim() : "";
          const timestamp = normalizeTimestamp(chunk?.timestamp);
          return text && timestamp ? { text, timestamp } : null;
        })
        .filter((chunk: WhisperChunk | null): chunk is WhisperChunk => chunk !== null)
    : [];

  const directText = typeof output.text === "string" ? output.text : "";
  const fallbackText = typeof output.fallbackText === "string" ? output.fallbackText : "";
  const chunkText = chunks.map((chunk) => chunk.text).join(" ");
  const text = (directText || fallbackText || chunkText).replace(/\s+/g, " ").trim();

  return { text, chunks };
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage metadata
// ─────────────────────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<Stage, string> = {
  idle: "Drop an audio file or click to browse",
  decoding: "Decoding audio…",
  resampling: "Resampling to 16 kHz…",
  "loading-model": "Loading Whisper model (first time ~39 MB)…",
  transcribing: "Transcribing speech with Whisper…",
  diarizing: "Identifying speakers…",
  done: "Transcription complete",
  error: "Transcription failed",
};

const ACCEPTED =
  "audio/wav,audio/mpeg,audio/mp4,audio/ogg,audio/flac,audio/webm,audio/x-m4a,.wav,.mp3,.m4a,.ogg,.flac,.webm";

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function AudioTranscribe({ onInsert }: Props) {
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [result, setResult] = useState<TranscribeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number } | null>(null);
  const [enableDiarization, setEnableDiarization] = useState(true);
  const [modelName, setModelName] = useState<string>("Xenova/whisper-tiny.en");
  const [expectedSpeakers, setExpectedSpeakers] = useState<number>(0); // 0 = Auto-detect

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter  = useRef(0);
  // Persistent worker reference — created on first use, terminated on unmount
  const workerRef    = useRef<Worker | null>(null);

  React.useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  // ── Core transcription pipeline ────────────────────────────────────────────

  const transcribeFile = useCallback(async (file: File) => {
    setError(null);
    setResult(null);
    setProgress(0);
    setFileInfo({ name: file.name, size: file.size });

    try {
      // 1. Read file
      setStage("decoding");
      setProgress(10);
      const arrayBuffer = await file.arrayBuffer();

      // 2. Decode audio (requires AudioContext — must stay on main thread)
      setProgress(20);
      const audioCtx = new AudioContext();
      let audioBuffer: AudioBuffer;
      try {
        audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      } finally {
        audioCtx.close();
      }

      const durationSec = audioBuffer.duration;
      console.log("[AudioTranscribe] 🎵 Audio decoded:", {
        durationSec: durationSec.toFixed(2),
        sampleRate: audioBuffer.sampleRate,
        channels: audioBuffer.numberOfChannels,
        samples: audioBuffer.length,
      });

      // 3. Mix to mono + resample to 16 kHz (OfflineAudioContext — main thread)
      setStage("resampling");
      setProgress(35);
      const mono     = mixDownToMono(audioBuffer);
      const resampled = await resampleTo16k(mono, audioBuffer.sampleRate);

      console.log("[AudioTranscribe] 🔄 Audio resampled to 16kHz:", {
        resampledSamples: resampled.length,
        resampledDurationSec: (resampled.length / 16000).toFixed(2),
      });

      const normalizedSpeech = normalizeForSpeechRecognition(resampled);
      const transcriptionAudio = normalizedSpeech.audioData;
      console.log("[AudioTranscribe] 🔊 Audio normalized for Whisper:", {
        gain: normalizedSpeech.gain.toFixed(2),
        inputPeak: normalizedSpeech.inputPeak.toFixed(6),
        inputRms: normalizedSpeech.inputRms.toFixed(6),
        outputPeak: normalizedSpeech.outputPeak.toFixed(6),
        outputRms: normalizedSpeech.outputRms.toFixed(6),
      });

      // 4 + 5. Load model + transcribe — delegated to Web Worker to avoid
      //         Turbopack/onnxruntime-web WASM backend registration failure.
      setStage("loading-model");
      setProgress(45);
      setProgressMessage("Loading Whisper model…");

      // Lazily create the worker (persisted across calls via workerRef)
      if (!workerRef.current) {
        workerRef.current = new Worker("/transcribe-worker.js", { type: "module" });
      }

      const worker = workerRef.current;

      // Await worker response via Promise
      const output: any = await new Promise((resolve, reject) => {
        const onMessage = (e: MessageEvent) => {
          const { type, payload } = e.data as { type: string; payload: any };

          if (type === "STAGE") {
            setStage(payload as Stage);
            if (payload === "transcribing") {
              setProgress(72);
              setProgressMessage("Running speech recognition…");
            }
          } else if (type === "PROGRESS") {
            if (payload.status === "progress" && payload.progress !== undefined) {
              const mapped = 45 + Math.round(payload.progress * 0.25);
              setProgress(mapped);
              if (payload.loaded != null && payload.total != null) {
                const mb    = (payload.loaded / 1024 / 1024).toFixed(1);
                const total = (payload.total  / 1024 / 1024).toFixed(1);
                setProgressMessage(`Downloading model: ${mb} / ${total} MB`);
              }
            }
          } else if (type === "RESULT") {
            cleanup();
            resolve(payload);
          } else if (type === "ERROR") {
            cleanup();
            const err = new Error(payload.message);
            err.name  = payload.name ?? "Error";
            reject(err);
          }
        };

        const onError = (e: ErrorEvent) => {
          cleanup();
          try {
            worker.terminate();
          } catch {
            // ignore
          }
          workerRef.current = null;
          reject(new Error(`Worker error: ${e.message}`));
        };

        const cleanup = () => {
          worker.removeEventListener("message", onMessage);
          worker.removeEventListener("error",   onError);
        };

        worker.addEventListener("message", onMessage);
        worker.addEventListener("error",   onError);

        // Ensure clean, contiguous ArrayBuffer with zero offset for the worker transfer
        const audioCopy = new Float32Array(transcriptionAudio);
        const transferBuffer = audioCopy.buffer;
        worker.postMessage(
          { type: "TRANSCRIBE", payload: { audioData: transferBuffer, modelName } },
          [transferBuffer]
        );
      });

      console.log("[AudioTranscribe] 📦 Worker output received:", {
        outputType: typeof output,
        textLength: output?.text?.length ?? 0,
        textPreview: output?.text?.slice(0, 100),
        chunksCount: Array.isArray(output?.chunks) ? output.chunks.length : 0,
        enableDiarization,
      });

      const normalizedOutput = normalizeTranscriptionOutput(output);

      // 6. Diarization
      let finalText   = "";
      let speakerCount = 1;

      if (
        enableDiarization &&
        normalizedOutput.chunks.length > 0
      ) {
        setStage("diarizing");
        setProgress(88);
        setProgressMessage("Identifying speakers & acoustic turns…");

        // Micro delay for responsive visual progress
        await new Promise((r) => setTimeout(r, 40));

        const diarized = diarizeChunks(
          transcriptionAudio,
          16000,
          normalizedOutput.chunks,
          expectedSpeakers
        );
        finalText    = diarized.formattedText;
        speakerCount = diarized.speakerCount || 1;

        console.log("[AudioTranscribe] 👥 Diarization result:", {
          formattedTextLength: finalText.length,
          speakerCount,
          turnsCount: diarized.turns?.length ?? 0,
        });

        // Safety fallback: preserve raw Whisper text if diarization yields nothing
        if (!finalText && normalizedOutput.text) {
          console.warn("[AudioTranscribe] ⚠️ Diarization returned empty text; falling back to raw Whisper output.");
          finalText = normalizedOutput.text;
        }
      } else {
        finalText = normalizedOutput.text;
      }

      console.log("[AudioTranscribe] 🏁 Final transcription text:", {
        finalTextLength: finalText.length,
        wordCount: finalText.split(/\s+/).filter(Boolean).length,
      });

      if (!finalText.trim()) {
        throw new Error(
          normalizedSpeech.outputPeak < 0.001
            ? "No speech was recognized. The imported audio is extremely quiet or silent."
            : "No speech was recognized. Try a clearer audio file or a more accurate Whisper model."
        );
      }

      setStage("done");
      setProgress(100);
      setProgressMessage("");
      setResult({ text: finalText, durationSec, speakerCount });
    } catch (err) {
      console.error("[AudioTranscribe] ❌ Transcription FAILED:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setStage("error");
      setError(msg);
      setProgress(0);
    }
  }, [modelName, enableDiarization, expectedSpeakers]);


  // ── Drag & Drop ────────────────────────────────────────────────────────────

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    setDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragging(false);
    }
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("audio/")) transcribeFile(file);
    },
    [transcribeFile]
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) transcribeFile(file);
      e.target.value = "";
    },
    [transcribeFile]
  );

  const reset = useCallback(() => {
    setStage("idle");
    setProgress(0);
    setProgressMessage("");
    setResult(null);
    setError(null);
    setFileInfo(null);
    dragCounter.current = 0;
  }, []);

  // ─────────────────────────────────────────────────────────────────────────

  const isProcessing = [
    "decoding",
    "resampling",
    "loading-model",
    "transcribing",
    "diarizing",
  ].includes(stage);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {/* Transcription & Diarization Controls Bar */}
      {stage === "idle" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.65rem",
            padding: "0.5rem 0.75rem",
            borderRadius: "var(--radius-sm)",
            background: "rgba(10, 14, 23, 0.55)",
            border: "1px solid var(--border-subtle)",
            fontSize: "0.76rem",
          }}
        >
          {/* Left: Model Selector & Speaker Count */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <Cpu size={13} style={{ color: "var(--accent-primary)" }} />
              <span style={{ fontWeight: 600, color: "var(--text-muted)", fontSize: "0.74rem" }}>
                Model:
              </span>
              <div style={{ width: 175 }}>
                <CustomSelect<string>
                  compact
                  value={modelName}
                  onChange={(val) => setModelName(val)}
                  options={[
                    { value: "Xenova/whisper-tiny.en", label: "Whisper Tiny (Bundled)", badge: "Offline" },
                    { value: "Xenova/whisper-base", label: "Whisper Base", badge: "Accurate" },
                    { value: "Xenova/whisper-tiny", label: "Whisper Tiny", badge: "Fast" },
                    { value: "Xenova/whisper-small", label: "Whisper Small", badge: "Studio" },
                  ]}
                  title="Whisper speech recognition model quality"
                />
              </div>
            </div>

            {enableDiarization && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <Users size={13} style={{ color: "var(--accent-secondary)" }} />
                <span style={{ fontWeight: 600, color: "var(--text-muted)", fontSize: "0.74rem" }}>
                  Speakers:
                </span>
                <div style={{ width: 155 }}>
                  <CustomSelect<number>
                    compact
                    value={expectedSpeakers}
                    onChange={(val) => setExpectedSpeakers(val)}
                    options={[
                      { value: 0, label: "Auto-detect" },
                      { value: 1, label: "1 (Solo Monologue)" },
                      { value: 2, label: "2 (Dialogue / Duo)" },
                      { value: 3, label: "3 (3 Speakers)" },
                      { value: 4, label: "4 (4 Speakers)" },
                      { value: 5, label: "5+ (Multi-speaker)" },
                    ]}
                    title="Expected speaker count for clustering"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right: Speaker Diarization Toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontWeight: 600, color: "var(--text-main)", fontSize: "0.74rem" }}>
              Speaker Diarization
            </span>
            <label className="toggle-switch" style={{ transform: "scale(0.85)" }}>
              <input
                type="checkbox"
                checked={enableDiarization}
                onChange={(e) => setEnableDiarization(e.target.checked)}
              />
              <span className="slider-toggle" />
            </label>
          </div>
        </div>
      )}

      {/* Drop zone */}
      {stage === "idle" && (
        <div
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? "var(--accent-primary)" : "var(--border-default)"}`,
            borderRadius: "var(--radius-sm)",
            background: dragging ? "rgba(139,92,246,0.07)" : "rgba(10,14,23,0.5)",
            padding: "2.5rem 1.5rem",
            minHeight: "280px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.65rem",
            cursor: "pointer",
            transition: "all 0.18s ease",
            userSelect: "none",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "var(--radius-sm)",
              background:
                "linear-gradient(135deg, rgba(139,92,246,0.18) 0%, rgba(6,182,212,0.12) 100%)",
              border: "1px solid rgba(139,92,246,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--accent-primary)",
            }}
          >
            <FileAudio size={22} />
          </div>
          <div style={{ textAlign: "center" }}>
            <p
              style={{
                fontSize: "0.84rem",
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: "0.2rem",
              }}
            >
              Drop an audio file here
            </p>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              WAV · MP3 · M4A · OGG · FLAC · WebM
            </p>
          </div>
          <button
            type="button"
            style={{
              padding: "0.35rem 1rem",
              fontSize: "0.78rem",
              fontWeight: 600,
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-default)",
              background: "rgba(139,92,246,0.12)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <Upload size={13} />
            Browse files
          </button>
          <p
            style={{
              fontSize: "0.72rem",
              color: "var(--text-muted)",
              marginTop: "0.15rem",
            }}
          >
            Transcribed on-device · offline · no data leaves your machine
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED}
            onChange={onFileChange}
            style={{ display: "none" }}
          />
        </div>
      )}

      {/* Processing state */}
      {isProcessing && (
        <div
          style={{
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            background: "rgba(10,14,23,0.6)",
            padding: "1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.85rem",
          }}
        >
          {fileInfo && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <FileAudio
                size={15}
                style={{ color: "var(--accent-primary)", flexShrink: 0 }}
              />
              <span
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {fileInfo.name}
              </span>
              <span
                style={{ fontSize: "0.74rem", color: "var(--text-muted)", flexShrink: 0 }}
              >
                {formatFileSize(fileInfo.size)}
              </span>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Loader2
              size={15}
              style={{
                color: "var(--accent-primary)",
                flexShrink: 0,
                animation: "spin 1s linear infinite",
              }}
            />
            <span
              style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-primary)" }}
            >
              {STAGE_LABELS[stage]}
            </span>
          </div>

          <div
            style={{
              height: 5,
              borderRadius: 999,
              background: "rgba(255,255,255,0.06)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progress}%`,
                borderRadius: 999,
                background:
                  "linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))",
                transition: "width 0.4s ease",
              }}
            />
          </div>

          {progressMessage && (
            <p style={{ fontSize: "0.73rem", color: "var(--text-muted)", margin: 0 }}>
              {progressMessage}
            </p>
          )}
        </div>
      )}

      {/* Error state */}
      {stage === "error" && (
        <div
          style={{
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: "var(--radius-sm)",
            background: "rgba(239,68,68,0.07)",
            padding: "1rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.6rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <AlertCircle size={15} style={{ color: "#f87171", flexShrink: 0 }} />
            <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#f87171" }}>
              Transcription failed
            </span>
          </div>
          <p
            style={{
              fontSize: "0.76rem",
              color: "var(--text-muted)",
              margin: 0,
              wordBreak: "break-word",
            }}
          >
            {error}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              alignSelf: "flex-start",
              padding: "0.3rem 0.75rem",
              fontSize: "0.76rem",
              fontWeight: 600,
              borderRadius: "var(--radius-sm)",
              border: "1px solid rgba(239,68,68,0.35)",
              background: "rgba(239,68,68,0.1)",
              color: "#f87171",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      )}

      {/* Result state */}
      {stage === "done" && result && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
          {/* Header bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.45rem 0.65rem",
              borderRadius: "var(--radius-sm)",
              background: "rgba(16,185,129,0.08)",
              border: "1px solid rgba(16,185,129,0.22)",
              flexWrap: "wrap",
              gap: "0.4rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
              <CheckCircle2 size={14} style={{ color: "#34d399" }} />
              <span
                style={{ fontSize: "0.78rem", fontWeight: 600, color: "#34d399" }}
              >
                Transcription complete
              </span>
              {result.speakerCount && result.speakerCount > 1 ? (
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    padding: "0.15rem 0.45rem",
                    borderRadius: "var(--radius-sm)",
                    background: "rgba(45, 212, 191, 0.15)",
                    color: "var(--accent-primary)",
                    border: "1px solid rgba(45, 212, 191, 0.3)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.25rem",
                  }}
                >
                  <Users size={11} />
                  {result.speakerCount} {result.speakerCount === 1 ? "Speaker" : "Speakers"}
                </span>
              ) : null}
              {fileInfo && (
                <span style={{ fontSize: "0.73rem", color: "var(--text-muted)" }}>
                  — {fileInfo.name}
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                {formatDuration(result.durationSec)} audio ·{" "}
                {result.text.split(/\s+/).filter(Boolean).length} words
              </span>
              <button
                type="button"
                onClick={reset}
                title="Clear and transcribe another file"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  padding: "0.25rem 0.55rem",
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-subtle)",
                  background: "transparent",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                <Trash2 size={11} />
                Clear
              </button>
            </div>
          </div>

          {/* Transcript preview */}
          <div
            style={{
              padding: "0.75rem",
              borderRadius: "var(--radius-sm)",
              background: "rgba(10,14,23,0.6)",
              border: "1px solid var(--border-subtle)",
              maxHeight: "160px",
              overflowY: "auto",
            }}
          >
            <p
              style={{
                fontSize: "0.82rem",
                lineHeight: 1.65,
                color: "var(--text-primary)",
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {result.text}
            </p>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => onInsert(result.text, "append")}
              style={{
                flex: 1,
                minWidth: 120,
                padding: "0.45rem 0.75rem",
                fontSize: "0.78rem",
                fontWeight: 600,
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-default)",
                background: "rgba(139,92,246,0.14)",
                color: "var(--accent-primary)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.4rem",
              }}
            >
              <Plus size={13} />
              Append to Editor
            </button>
            <button
              type="button"
              onClick={() => onInsert(result.text, "replace")}
              style={{
                flex: 1,
                minWidth: 120,
                padding: "0.45rem 0.75rem",
                fontSize: "0.78rem",
                fontWeight: 600,
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-default)",
                background: "rgba(6,182,212,0.12)",
                color: "var(--accent-secondary)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.4rem",
              }}
            >
              <Replace size={13} />
              Replace Editor
            </button>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(result.text)}
              style={{
                padding: "0.45rem 0.75rem",
                fontSize: "0.78rem",
                fontWeight: 600,
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-subtle)",
                background: "transparent",
                color: "var(--text-muted)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
              }}
            >
              <ClipboardPaste size={13} />
              Copy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
