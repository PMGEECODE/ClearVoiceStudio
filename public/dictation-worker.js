/**
 * dictation-worker.js
 *
 * Loads @xenova/transformers 2.17.2 via importScripts to bypass the
 * Next.js Turbopack/Webpack WASM bundling issue ("not a valid backend").
 *
 * Communication protocol (main → worker):
 *   { type: 'TRANSCRIBE', payload: { audioData: ArrayBuffer } }
 *   { type: 'WARMUP' }      ← pre-load the pipeline without inference
 *
 * Communication protocol (worker → main):
 *   { type: 'READY' }       ← pipeline loaded and ready
 *   { type: 'PROGRESS', payload: { status, progress, loaded, total } }
 *   { type: 'RESULT',   payload: { text: string } }
 *   { type: 'ERROR',    payload: { message: string } }
 */

// transformers.min.js is an ES module exported bundle, loaded via native module import
import { pipeline, env } from '/transformers.min.js';

env.useBrowserCache   = true;
env.allowLocalModels  = false;
env.allowRemoteModels = true;

// Point ONNX runtime WASM backend to local /wasm/ assets
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.wasmPaths = '/wasm/';
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.proxy = false;
}

const MODEL_NAME = 'Xenova/whisper-tiny.en';

let pipelinePromise = null;

function getPipeline() {
  if (!pipelinePromise) {
    pipelinePromise = pipeline('automatic-speech-recognition', MODEL_NAME, {
      quantized: true,
      progress_callback: (p) => {
        self.postMessage({ type: 'PROGRESS', payload: p });
      },
    }).catch((err) => {
      pipelinePromise = null; // reset so next attempt retries
      throw err;
    });
  }
  return pipelinePromise;
}

self.addEventListener('message', async (event) => {
  const { type, payload } = event.data;

  if (type === 'WARMUP') {
    try {
      await getPipeline();
      self.postMessage({ type: 'READY' });
    } catch (err) {
      self.postMessage({
        type: 'ERROR',
        payload: { message: err instanceof Error ? err.message : String(err) },
      });
    }
    return;
  }

  if (type === 'TRANSCRIBE') {
    try {
      const transcriber = await getPipeline();
      const float32Audio = new Float32Array(payload.audioData);
      const result = await transcriber(float32Audio, {
        language: 'english',
        chunk_length_s: 30,
        stride_length_s: 5,
        suppress_tokens: [],
      });
      self.postMessage({ type: 'RESULT', payload: { text: result?.text ?? '' } });
    } catch (err) {
      self.postMessage({
        type: 'ERROR',
        payload: { message: err instanceof Error ? err.message : String(err) },
      });
    }
  }
});
