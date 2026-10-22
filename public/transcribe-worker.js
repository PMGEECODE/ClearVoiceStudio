/**
 * transcribe-worker.js
 *
 * Loads @xenova/transformers 2.17.2 via importScripts so it runs outside of
 * the Next.js Turbopack/Webpack bundler. This is the ONLY reliable way to use
 * onnxruntime-web in a Next.js app — the bundler cannot handle ort-web's
 * internal WASM binary imports, causing "not a valid backend" at module eval time.
 *
 * Communication protocol (main → worker):
 *   { type: 'TRANSCRIBE', payload: { audioData: ArrayBuffer, modelName: string, enableDiarization: boolean } }
 *
 * Communication protocol (worker → main):
 *   { type: 'STAGE',    payload: string }
 *   { type: 'PROGRESS', payload: { status, progress, loaded, total } }
 *   { type: 'RESULT',   payload: { text, chunks } }
 *   { type: 'ERROR',    payload: { message, name } }
 */

// transformers.min.js is an ES module exported bundle, loaded via native module import
import { pipeline, env } from '/transformers.min.js';

// ── Environment configuration ───────────────────────────────────────────────
env.useBrowserCache   = true;   // Cache model weights in browser IndexedDB
env.allowLocalModels  = true;   // Prefer bundled desktop/offline model files
env.allowRemoteModels = true;   // Download from HuggingFace Hub if not bundled
env.localModelPath    = '/models/';

// Point ONNX runtime WASM backend to local /wasm/ assets
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.wasmPaths = '/wasm/';
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.proxy = false;
}

// ── Pipeline cache ──────────────────────────────────────────────────────────
let cachedPipeline    = null;
let cachedModelName   = null;

function textFromOutput(output) {
  if (Array.isArray(output)) {
    return output.map(textFromOutput).filter(Boolean).join(' ');
  }

  if (!output || typeof output !== 'object') return '';

  const directText = typeof output.text === 'string' ? output.text : '';
  if (directText.trim()) return directText;

  if (Array.isArray(output.chunks)) {
    return output.chunks
      .map((chunk) => (typeof chunk?.text === 'string' ? chunk.text : ''))
      .filter(Boolean)
      .join(' ');
  }

  return '';
}

function getAudioStats(audioData) {
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

function normalizeForSpeechRecognition(audioData) {
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

// ── Message handler ─────────────────────────────────────────────────────────
self.addEventListener('message', async (event) => {
  const { type, payload } = event.data;

  if (type !== 'TRANSCRIBE') return;

  const { audioData, modelName } = payload;

  try {
    // ── Step 1: Load/reuse pipeline ─────────────────────────────────────────
    if (!cachedPipeline || cachedModelName !== modelName) {
      cachedPipeline  = null; // Release old pipeline before creating new one
      cachedModelName = null;

      self.postMessage({ type: 'STAGE', payload: 'loading-model' });

      cachedPipeline = await pipeline(
        'automatic-speech-recognition',
        modelName,
        {
          quantized: true,
          progress_callback: (p) => {
            self.postMessage({ type: 'PROGRESS', payload: p });
          },
        }
      );
      cachedModelName = modelName;
    }

    // ── Step 2: Run inference ────────────────────────────────────────────────
    self.postMessage({ type: 'STAGE', payload: 'transcribing' });

    // Reconstruct Float32Array from the transferred ArrayBuffer
    const rawFloat32Audio = new Float32Array(audioData);
    const normalizedSpeech = normalizeForSpeechRecognition(rawFloat32Audio);
    const float32Audio = normalizedSpeech.audioData;
    console.log('[transcribe-worker] 🚀 Starting inference:', {
      samples: float32Audio.length,
      durationSec: (float32Audio.length / 16000).toFixed(2),
      modelName,
      gain: normalizedSpeech.gain.toFixed(2),
      inputPeak: normalizedSpeech.inputPeak.toFixed(6),
      inputRms: normalizedSpeech.inputRms.toFixed(6),
      outputPeak: normalizedSpeech.outputPeak.toFixed(6),
      outputRms: normalizedSpeech.outputRms.toFixed(6),
    });

    let output = await cachedPipeline(float32Audio, {
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true,
      suppress_tokens: [],
    });

    const timestampedText = textFromOutput(output).replace(/\s+/g, ' ').trim();
    if (!timestampedText && float32Audio.length > 0) {
      console.warn('[transcribe-worker] ⚠️ Timestamped transcription was empty; retrying without timestamps.');
      const plainOutput = await cachedPipeline(float32Audio, {
        chunk_length_s: 30,
        stride_length_s: 5,
        suppress_tokens: [],
      });
      const plainText = textFromOutput(plainOutput).replace(/\s+/g, ' ').trim();
      output = {
        ...output,
        text: plainText,
        fallbackText: plainText,
        timestampedText,
      };
    } else if (output && typeof output === 'object' && typeof output.text !== 'string') {
      output = { ...output, text: timestampedText };
    }

    console.log('[transcribe-worker] ✅ Whisper inference completed:', {
      textLength: output?.text?.length ?? 0,
      textPreview: output?.text?.slice(0, 100),
      chunksCount: Array.isArray(output?.chunks) ? output.chunks.length : 0,
      firstChunk: Array.isArray(output?.chunks) && output.chunks[0] ? output.chunks[0] : null,
    });

    self.postMessage({ type: 'RESULT', payload: output });
  } catch (err) {
    console.error('[transcribe-worker] ❌ Whisper inference error:', err);
    self.postMessage({
      type: 'ERROR',
      payload: {
        message: err instanceof Error ? err.message : String(err),
        name:    err instanceof Error ? err.name    : 'Error',
        stack:   err instanceof Error ? err.stack   : undefined,
      },
    });
  }
});
