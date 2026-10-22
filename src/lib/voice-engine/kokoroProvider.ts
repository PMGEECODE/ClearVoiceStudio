import path from "path";
import fs from "fs";
import {
  UnifiedVoiceInfo,
  SynthesisRequestOptions,
  SynthesisResult,
  VoiceProvider,
} from "./types";
import { KOKORO_VOICES_CATALOG, mapKokoroVoiceToUnified } from "./kokoroVoices";
import { getVoicesDir, isVoiceDownloaded } from "@/lib/voiceStorage";
import { logServerEvent } from "@/lib/serverLog";
import { concatenateWav } from "@/lib/wav";
import { synthesizeExpressive } from "@/lib/emotion-tts";
import { getProsodyProfile } from "@/lib/prosody";

// Cached KokoroTTS singleton instance
let kokoroInstance: any = null;
let kokoroLoadingPromise: Promise<any> | null = null;

async function getKokoroTTS(): Promise<any> {
  if (kokoroInstance) {
    return kokoroInstance;
  }
  if (kokoroLoadingPromise) {
    return kokoroLoadingPromise;
  }

  kokoroLoadingPromise = (async () => {
    logServerEvent("kokoro-engine", "Initializing KokoroTTS Node runtime", {});
    const { KokoroTTS } = await import("kokoro-js");
    const { env } = await import("@huggingface/transformers");

    try {
      const voicesDir = getVoicesDir();
      process.env.KOKORO_VOICES_DIR = voicesDir;

      // Candidate root directories that contain onnx-community/Kokoro-82M-v1.0-ONNX
      const candidateCacheDirs = [
        path.resolve(process.cwd(), "public", "models"),
        path.resolve(__dirname, "..", "..", "..", "public", "models"),
        (process as any).resourcesPath
          ? path.resolve((process as any).resourcesPath, "app", "public", "models")
          : null,
        (process as any).resourcesPath
          ? path.resolve((process as any).resourcesPath, "public", "models")
          : null,
        path.resolve(process.cwd(), "node_modules", "@huggingface", "transformers", ".cache"),
      ].filter(Boolean) as string[];

      let foundCacheDir: string | null = null;
      for (const dir of candidateCacheDirs) {
        const modelCheck = path.join(
          dir,
          "onnx-community",
          "Kokoro-82M-v1.0-ONNX",
          "onnx",
          "model_quantized.onnx"
        );
        if (fs.existsSync(modelCheck)) {
          foundCacheDir = dir;
          break;
        }
      }

      if (foundCacheDir) {
        env.cacheDir = foundCacheDir;
        env.allowLocalModels = true;
        logServerEvent("kokoro-engine", "Using offline bundled Kokoro model", {
          cacheDir: foundCacheDir,
        });
      } else {
        const customCache = path.join(voicesDir, "kokoro-cache");
        if (!fs.existsSync(customCache)) {
          fs.mkdirSync(customCache, { recursive: true });
        }
        env.cacheDir = customCache;
        logServerEvent("kokoro-engine", "Configured writable Kokoro cache directory", {
          cacheDir: customCache,
        });
      }
    } catch (err: any) {
      logServerEvent(
        "kokoro-engine",
        "Error configuring cache dir, falling back to default",
        { err: err.message },
        "warn"
      );
    }

    const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
      dtype: "q8",
      device: "cpu",
    });

    kokoroInstance = tts;
    logServerEvent("kokoro-engine", "KokoroTTS initialized successfully", {
      voicesCount: Object.keys(tts.voices || {}).length,
    });
    return tts;
  })().catch((err) => {
    kokoroLoadingPromise = null;
    logServerEvent("kokoro-engine", "KokoroTTS initialization failed", { err: err.message }, "error");
    throw err;
  });

  return kokoroLoadingPromise;
}

/**
 * Splits arbitrary length text into natural, sentence-packed chunks (up to ~350 chars)
 * that comfortably fit within Kokoro's 512-token neural model window without truncation.
 */
function splitTextIntoKokoroChunks(text: string, maxChunkLength = 350): string[] {
  const paragraphs = text
    .split(/\r?\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let currentChunk = "";

  for (const para of paragraphs) {
    const rawSentences = para
      .match(/[^.!?…\n]+(?:[.!?…]+(?:\s+|$)|$)/g)
      ?.map((s) => s.trim())
      .filter(Boolean) || [para];

    for (const sentence of rawSentences) {
      // If an isolated sentence is longer than maxChunkLength, subdivide it on clauses
      const subUnits: string[] = [];
      if (sentence.length > maxChunkLength) {
        const clauses = sentence
          .match(/[^,;:—–]+(?:[,;:—–]+(?:\s+|$)|$)/g)
          ?.map((c) => c.trim())
          .filter(Boolean) || [sentence];

        let clauseChunk = "";
        for (const clause of clauses) {
          if (!clauseChunk) {
            clauseChunk = clause;
          } else if ((clauseChunk + " " + clause).length <= maxChunkLength) {
            clauseChunk += " " + clause;
          } else {
            subUnits.push(clauseChunk);
            clauseChunk = clause;
          }
        }
        if (clauseChunk) {
          if (clauseChunk.length > maxChunkLength) {
            const words = clauseChunk.split(/\s+/);
            let wordChunk = "";
            for (const word of words) {
              if (!wordChunk) {
                wordChunk = word;
              } else if ((wordChunk + " " + word).length <= maxChunkLength) {
                wordChunk += " " + word;
              } else {
                subUnits.push(wordChunk);
                wordChunk = word;
              }
            }
            if (wordChunk) subUnits.push(wordChunk);
          } else {
            subUnits.push(clauseChunk);
          }
        }
      } else {
        subUnits.push(sentence);
      }

      // Pack subUnits into currentChunk up to maxChunkLength
      for (const unit of subUnits) {
        if (!currentChunk) {
          currentChunk = unit;
        } else if ((currentChunk + " " + unit).length <= maxChunkLength) {
          currentChunk += " " + unit;
        } else {
          chunks.push(currentChunk);
          currentChunk = unit;
        }
      }
    }

    // Flush paragraph boundary if chunk has reached substantial size (>= 150 chars)
    if (currentChunk.length >= 150) {
      chunks.push(currentChunk);
      currentChunk = "";
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks.length > 0 ? chunks : [text.trim()];
}

export class KokoroProvider implements VoiceProvider {
  public readonly id = "kokoro" as const;

  public async isReady(): Promise<boolean> {
    return true;
  }

  public async getVoices(): Promise<UnifiedVoiceInfo[]> {
    return KOKORO_VOICES_CATALOG.map((def) =>
      mapKokoroVoiceToUnified(def, isVoiceDownloaded(def.id))
    );
  }

  public async isVoiceInstalled(voiceId: string): Promise<boolean> {
    return isVoiceDownloaded(voiceId);
  }

  public async synthesize(options: SynthesisRequestOptions): Promise<SynthesisResult> {
    const voiceDef = KOKORO_VOICES_CATALOG.find((v) => v.id === options.voiceId);
    if (!voiceDef) {
      throw new Error(`Unknown voice ID: ${options.voiceId}`);
    }

    if (!isVoiceDownloaded(voiceDef.id)) {
      throw new Error(
        `Voice "${voiceDef.name}" is not downloaded yet. Please download it from the Voice Catalog.`
      );
    }

    const text = options.text.trim();
    if (!text) {
      throw new Error("No text provided for synthesis.");
    }

    // Convert lengthScale to Kokoro speed (lengthScale < 1 is faster, > 1 is slower; speed is inverse)
    const requestedLengthScale = options.lengthScale || 1.0;
    const prosodyProfile = options.prosodyEnabled
      ? getProsodyProfile(options.prosodyProfile)
      : null;
    // Kokoro exposes speed rather than Piper's acoustic controls. Profile
    // multipliers therefore map to deliberate pace and inter-sentence spacing.
    const lengthScale = requestedLengthScale * (prosodyProfile?.lengthScaleMultiplier ?? 1);
    const sentenceSilence = Math.max(
      0,
      (options.sentenceSilence ?? 0.2) * (prosodyProfile?.sentenceSpacing ?? 1)
    );
    const speed = lengthScale > 0 ? 1.0 / lengthScale : 1.0;

    const chunks = splitTextIntoKokoroChunks(text);

    logServerEvent("kokoro-synthesize", "Starting Kokoro synthesis", {
      voice: voiceDef.id,
      speed,
      prosodyProfile: prosodyProfile?.id ?? "off",
      textLength: text.length,
      chunksCount: chunks.length,
    });

    const t0 = Date.now();
    const tts = await getKokoroTTS();

    let audioBuffer: Buffer;
    // kokoro-js supports a voice ID and speed, not public style-embedding input.
    // Keep the selected voice stable: expressive delivery is deliberately limited to
    // sentence pacing, punctuation, pauses, and click-safe joins.
    // At zero intensity, avoid needless sentence-by-sentence calls and use the
    // original fast path exactly. This makes the UI's 0.00 setting a real
    // performance control, not merely a weaker version of the same work.
    if (options.emotionMode && (options.emotionIntensity ?? 0.7) > 0) {
      audioBuffer = await synthesizeExpressive({
        text,
        intensity: options.emotionIntensity,
        baseLengthScale: lengthScale,
        sentenceSilence,
        emotionHint: options.emotionHint,
        synthesizeSentence: async (sentence, expressiveSpeed) => {
          const audio = await tts.generate(sentence, {
            voice: voiceDef.id,
            speed: expressiveSpeed,
          });
          return Buffer.from(audio.toWav());
        },
      });
    } else if (chunks.length === 1) {
      const audio = await tts.generate(chunks[0], {
        voice: voiceDef.id,
        speed,
      });
      audioBuffer = Buffer.from(audio.toWav());
    } else {
      const wavBuffers: Buffer[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const c0 = Date.now();
        const audio = await tts.generate(chunk, {
          voice: voiceDef.id,
          speed,
        });
        wavBuffers.push(Buffer.from(audio.toWav()));
        logServerEvent("kokoro-synthesize", `Chunk ${i + 1}/${chunks.length} complete`, {
          chunkIndex: i + 1,
          totalChunks: chunks.length,
          chunkLength: chunk.length,
          durationMs: Date.now() - c0,
        });
      }
      audioBuffer = concatenateWav(wavBuffers, 0.12);
    }

    const elapsedMs = Date.now() - t0;

    logServerEvent("kokoro-synthesize", "Kokoro synthesis complete", {
      voice: voiceDef.id,
      durationMs: elapsedMs,
      byteLength: audioBuffer.length,
      chunksCount: chunks.length,
    });

    return {
      audioBuffer,
      sampleRate: voiceDef.sampleRate,
      provider: "kokoro",
      engineMode: "kokoro_node_native",
    };
  }
}
