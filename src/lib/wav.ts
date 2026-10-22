export interface ParsedWav {
  audioFormat: number;
  numChannels: number;
  sampleRate: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
  data: Buffer;
}

export interface WavTargetFormat {
  audioFormat: number;
  numChannels: number;
  sampleRate: number;
  bitsPerSample: number;
}

const PCM16_MONO: WavTargetFormat = {
  audioFormat: 1,
  numChannels: 1,
  sampleRate: 22050,
  bitsPerSample: 16,
};

export function parseWav(wav: Buffer): ParsedWav {
  if (wav.length < 44 || wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Generated audio is not a WAV file.");
  }

  let offset = 12;
  let fmtOffset = -1;
  let fmtSize = 0;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= wav.length) {
    const chunkId = wav.toString("ascii", offset, offset + 4);
    const chunkSize = wav.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;

    if (chunkId === "fmt ") {
      fmtOffset = chunkStart;
      fmtSize = chunkSize;
    } else if (chunkId === "data") {
      dataOffset = chunkStart;
      dataSize = chunkSize;
      break;
    }

    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (fmtOffset < 0 || dataOffset < 0 || fmtSize < 16) {
    throw new Error("Generated WAV is missing required chunks.");
  }

  const dataStart = dataOffset;
  const safeDataSize = Math.min(dataSize, Math.max(0, wav.length - dataStart));

  return {
    audioFormat: wav.readUInt16LE(fmtOffset + 0),
    numChannels: wav.readUInt16LE(fmtOffset + 2),
    sampleRate: wav.readUInt32LE(fmtOffset + 4),
    byteRate: wav.readUInt32LE(fmtOffset + 8),
    blockAlign: wav.readUInt16LE(fmtOffset + 12),
    bitsPerSample: wav.readUInt16LE(fmtOffset + 14),
    data: wav.subarray(dataStart, dataStart + safeDataSize),
  };
}

function decodeToFloatSamples(parsed: ParsedWav): Float32Array {
  const { data, bitsPerSample, numChannels, audioFormat } = parsed;
  if (numChannels < 1) {
    throw new Error("Unsupported WAV channel layout.");
  }

  if (audioFormat === 1 && bitsPerSample === 16) {
    const frameCount = Math.floor(data.length / (2 * numChannels));
    const out = new Float32Array(frameCount);
    for (let i = 0; i < frameCount; i++) {
      let sum = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        sum += data.readInt16LE((i * numChannels + ch) * 2) / 32768;
      }
      out[i] = sum / numChannels;
    }
    return out;
  }

  if (audioFormat === 1 && bitsPerSample === 24) {
    const frameCount = Math.floor(data.length / (3 * numChannels));
    const out = new Float32Array(frameCount);
    for (let i = 0; i < frameCount; i++) {
      let sum = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        const base = (i * numChannels + ch) * 3;
        let sample = data[base] | (data[base + 1] << 8) | (data[base + 2] << 16);
        if (sample & 0x800000) sample |= ~0xffffff;
        sum += sample / 8388608;
      }
      out[i] = sum / numChannels;
    }
    return out;
  }

  if (audioFormat === 3 && bitsPerSample === 32) {
    const frameCount = Math.floor(data.length / (4 * numChannels));
    const out = new Float32Array(frameCount);
    for (let i = 0; i < frameCount; i++) {
      let sum = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        sum += data.readFloatLE((i * numChannels + ch) * 4);
      }
      out[i] = sum / numChannels;
    }
    return out;
  }

  throw new Error(
    `Unsupported WAV format (format=${audioFormat}, bits=${bitsPerSample}, channels=${numChannels}).`
  );
}

function resampleFloat(input: Float32Array, inputRate: number, outputRate: number): Float32Array {
  if (inputRate === outputRate || input.length === 0) {
    return input;
  }

  const outputLength = Math.max(1, Math.round((input.length * outputRate) / inputRate));
  const output = new Float32Array(outputLength);
  const ratio = inputRate / outputRate;

  for (let i = 0; i < outputLength; i++) {
    const srcPos = i * ratio;
    const idx = Math.floor(srcPos);
    const frac = srcPos - idx;
    const s0 = input[Math.min(idx, input.length - 1)] ?? 0;
    const s1 = input[Math.min(idx + 1, input.length - 1)] ?? s0;
    output[i] = s0 + (s1 - s0) * frac;
  }

  return output;
}

function floatToPcm16(samples: Float32Array): Buffer {
  const out = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    out.writeInt16LE(Math.round(clamped * 32767), i * 2);
  }
  return out;
}

function pickTargetFormat(parsed: ParsedWav[]): WavTargetFormat {
  const sampleRate = Math.max(...parsed.map((wav) => wav.sampleRate));
  return {
    ...PCM16_MONO,
    sampleRate,
  };
}

function matchesTarget(parsed: ParsedWav, target: WavTargetFormat): boolean {
  return (
    parsed.audioFormat === target.audioFormat &&
    parsed.numChannels === target.numChannels &&
    parsed.sampleRate === target.sampleRate &&
    parsed.bitsPerSample === target.bitsPerSample
  );
}

export function normalizeWav(wav: Buffer, target: WavTargetFormat): Buffer {
  const parsed = parseWav(wav);
  if (matchesTarget(parsed, target)) {
    return wav;
  }

  let samples = decodeToFloatSamples(parsed);
  if (parsed.sampleRate !== target.sampleRate) {
    samples = resampleFloat(samples, parsed.sampleRate, target.sampleRate);
  }

  return buildWavFromPcm(floatToPcm16(samples), target);
}

export function buildWavFromPcm(pcmData: Buffer, format: WavTargetFormat): Buffer {
  const blockAlign = (format.numChannels * format.bitsPerSample) / 8;
  const byteRate = format.sampleRate * blockAlign;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(format.audioFormat, 20);
  header.writeUInt16LE(format.numChannels, 22);
  header.writeUInt32LE(format.sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(format.bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmData.length, 40);

  return Buffer.concat([header, pcmData]);
}

/** Adds short linear fades to PCM edges, preventing clicks at sentence joins. */
export function applyWavEdgeFades(wav: Buffer, sampleRate: number, seconds = 0.008): Buffer {
  const target: WavTargetFormat = { ...PCM16_MONO, sampleRate };
  const normalized = normalizeWav(wav, target);
  const pcm = Buffer.from(parseWav(normalized).data);
  const frames = Math.floor(pcm.length / 2);
  const fadeFrames = Math.min(Math.round(sampleRate * Math.max(0, seconds)), Math.floor(frames / 2));
  for (let i = 0; i < fadeFrames; i++) {
    const gain = (i + 1) / fadeFrames;
    pcm.writeInt16LE(Math.round(pcm.readInt16LE(i * 2) * gain), i * 2);
    const tailOffset = (frames - 1 - i) * 2;
    pcm.writeInt16LE(Math.round(pcm.readInt16LE(tailOffset) * gain), tailOffset);
  }
  return buildWavFromPcm(pcm, target);
}

function createSilence(format: WavTargetFormat, seconds: number): Buffer {
  const frameCount = Math.round(format.sampleRate * Math.max(0, seconds));
  const byteLength = frameCount * format.numChannels * (format.bitsPerSample / 8);
  return Buffer.alloc(byteLength);
}

function getSilenceAt(value: number | number[], index: number): number {
  if (Array.isArray(value)) {
    return Math.max(0, value[index] || 0);
  }
  return Math.max(0, value);
}

export function concatenateWav(wavs: Buffer[], silenceSeconds: number | number[] = 0): Buffer {
  if (wavs.length === 0) {
    throw new Error("No dialogue audio was generated.");
  }
  if (wavs.length === 1) {
    return wavs[0];
  }

  const parsed = wavs.map(parseWav);
  const target = pickTargetFormat(parsed);
  const normalized = wavs.map((wav) => normalizeWav(wav, target));
  const payloads: Buffer[] = [];

  normalized.forEach((wav, index) => {
    const pcm = parseWav(wav).data;
    if (index > 0) {
      const silence = createSilence(target, getSilenceAt(silenceSeconds, index - 1));
      if (silence.length > 0) {
        payloads.push(silence);
      }
    }
    payloads.push(pcm);
  });

  return buildWavFromPcm(Buffer.concat(payloads), target);
}
