/**
 * diarization.ts — Speaker Diarization & Dialogue Formatting
 *
 * Pipeline:
 *   Audio → Whisper chunks (timestamps) → Pyannote segments (SPEAKER_00…)
 *        → Chronological renaming (Speaker 1, 2, 3…)
 *        → Run-length smoothing
 *        → Formatted dialogue
 *
 * Fallback (when pyannote is unavailable):
 *   Whisper chunks → Acoustic K-Means (pitch + spectral features)
 *        → Chronological renaming → Dialogue
 */

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface WhisperChunk {
  text: string;
  timestamp: [number, number | null];
}

/** A single segment returned by the pyannote diarization server. */
export interface PyannoteSeg {
  start: number;
  end: number;
  speaker: string; // e.g. "SPEAKER_00"
}

export interface DiarizedTurn {
  speakerId: number;
  speakerLabel: string;
  genderHint?: "male" | "female";
  text: string;
  startTime: number;
  endTime: number;
}

export interface DiarizationResult {
  formattedText: string;
  turns: DiarizedTurn[];
  speakerCount: number;
  /** Whether pyannote was used (true) or the acoustic fallback (false). */
  usedPyannote: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Timestamp formatting
// ─────────────────────────────────────────────────────────────────────────────

/** Format seconds → MM:SS or HH:MM:SS */
export function formatTimestamp(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  const totalSeconds = Math.floor(seconds);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  const mm = String(mins).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");

  if (hrs > 0) {
    const hh = String(hrs).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pyannote path — merge segments with Whisper chunks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * For each Whisper chunk, find the pyannote segment with maximum time-overlap
 * and assign its speaker label.
 * Returns per-chunk speaker labels (SPEAKER_00 format).
 */
function assignSpeakersByOverlap(
  chunks: { start: number; end: number }[],
  segments: PyannoteSeg[]
): string[] {
  return chunks.map((chunk) => {
    let bestSpeaker = "SPEAKER_00";
    let bestOverlap = -1;

    for (const seg of segments) {
      const overlapStart = Math.max(chunk.start, seg.start);
      const overlapEnd = Math.min(chunk.end, seg.end);
      const overlap = overlapEnd - overlapStart;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestSpeaker = seg.speaker;
      }
    }

    return bestSpeaker;
  });
}

/**
 * Map SPEAKER_XX labels chronologically to Speaker 1, Speaker 2, …
 * (First speaker heard → 1, second distinct → 2, etc.)
 */
function chronologicalRename(rawLabels: string[]): number[] {
  const seen = new Map<string, number>();
  let next = 1;
  return rawLabels.map((label) => {
    if (!seen.has(label)) seen.set(label, next++);
    return seen.get(label)!;
  });
}

/** Smooth isolated anomalous chunks < 1.2 s surrounded by the same speaker. */
function smoothAssignments(
  assignments: number[],
  chunkDurations: number[]
): number[] {
  const smoothed = [...assignments];
  const n = smoothed.length;
  for (let i = 1; i < n - 1; i++) {
    const prev = smoothed[i - 1];
    const next = smoothed[i + 1];
    if (prev === next && smoothed[i] !== prev && chunkDurations[i] < 1.2) {
      smoothed[i] = prev;
    }
  }
  return smoothed;
}

/** Build DiarizedTurn[] and formatted text from per-chunk speaker assignments. */
function buildTurns(
  chunkProfiles: { start: number; end: number; text: string }[],
  speakerNumbers: number[],
  genderMap?: Map<number, "male" | "female">
): { turns: DiarizedTurn[]; formattedText: string } {
  const turns: DiarizedTurn[] = [];

  if (chunkProfiles.length === 0) {
    return { turns: [], formattedText: "" };
  }

  let currentSpeaker = speakerNumbers[0];
  let currentTexts: string[] = [chunkProfiles[0].text];
  let turnStart = chunkProfiles[0].start;
  let turnEnd = chunkProfiles[0].end;

  for (let i = 1; i < chunkProfiles.length; i++) {
    const spk = speakerNumbers[i];
    const text = chunkProfiles[i].text;

    if (spk === currentSpeaker) {
      currentTexts.push(text);
      turnEnd = chunkProfiles[i].end;
    } else {
      turns.push({
        speakerId: currentSpeaker,
        speakerLabel: `Speaker ${currentSpeaker}`,
        genderHint: genderMap?.get(currentSpeaker),
        text: currentTexts.join(" "),
        startTime: turnStart,
        endTime: turnEnd,
      });
      currentSpeaker = spk;
      currentTexts = [text];
      turnStart = chunkProfiles[i].start;
      turnEnd = chunkProfiles[i].end;
    }
  }

  // Final turn
  turns.push({
    speakerId: currentSpeaker,
    speakerLabel: `Speaker ${currentSpeaker}`,
    genderHint: genderMap?.get(currentSpeaker),
    text: currentTexts.join(" "),
    startTime: turnStart,
    endTime: turnEnd,
  });

  const formattedText = turns
    .map(
      (t) =>
        `[${formatTimestamp(t.startTime)} - ${formatTimestamp(t.endTime)}] ${t.speakerLabel}: ${t.text}`
    )
    .join("\n");

  return { turns, formattedText };
}

// ─────────────────────────────────────────────────────────────────────────────
// Acoustic fallback — K-Means pitch/spectral clustering
// ─────────────────────────────────────────────────────────────────────────────

interface AcousticFeatures {
  pitch: number;
  pitchVariance: number;
  spectralCentroid: number;
  lowRatio: number;
  midRatio: number;
  highRatio: number;
  voicedFrameRatio: number;
  rms: number;
}

function estimatePitchNCCF(samples: Float32Array, sampleRate: number): number {
  const minPeriod = Math.floor(sampleRate / 450);
  const maxPeriod = Math.floor(sampleRate / 75);
  const n = Math.min(samples.length - maxPeriod, 1024);
  if (n <= 0) return 0;

  let baseEnergy = 0;
  for (let i = 0; i < n; i++) baseEnergy += samples[i] * samples[i];
  if (baseEnergy < 0.003) return 0;

  let bestPeriod = 0;
  let maxNormCorr = 0;

  for (let period = minPeriod; period <= maxPeriod; period++) {
    let corr = 0;
    let lagEnergy = 0;
    for (let i = 0; i < n; i++) {
      corr += samples[i] * samples[i + period];
      lagEnergy += samples[i + period] * samples[i + period];
    }
    const norm = Math.sqrt(baseEnergy * lagEnergy) || 1e-6;
    const normCorr = corr / norm;
    if (normCorr > maxNormCorr) {
      maxNormCorr = normCorr;
      bestPeriod = period;
    }
  }

  return maxNormCorr > 0.52 && bestPeriod > 0 ? sampleRate / bestPeriod : 0;
}

function extractFeatures(slice: Float32Array, sampleRate: number): AcousticFeatures {
  const len = slice.length;
  if (len < 512) {
    return { pitch: 0, pitchVariance: 0, spectralCentroid: 1000, lowRatio: 0.33, midRatio: 0.33, highRatio: 0.33, voicedFrameRatio: 0, rms: 0 };
  }

  let sumSquare = 0;
  for (let i = 0; i < len; i++) sumSquare += slice[i] * slice[i];
  const rms = Math.sqrt(sumSquare / len);

  const windowSize = Math.floor(sampleRate * 0.12);
  const hopSize = Math.floor(sampleRate * 0.06);
  const voicedPitches: number[] = [];
  let totalFrames = 0;

  for (let i = 0; i + windowSize <= len; i += hopSize) {
    totalFrames++;
    const p = estimatePitchNCCF(slice.subarray(i, i + windowSize), sampleRate);
    if (p >= 75 && p <= 450) voicedPitches.push(p);
  }

  const meanPitch = voicedPitches.length > 0
    ? voicedPitches.reduce((a, b) => a + b, 0) / voicedPitches.length : 0;
  const variancePitch = voicedPitches.length > 1
    ? voicedPitches.reduce((a, b) => a + Math.pow(b - meanPitch, 2), 0) / voicedPitches.length : 0;

  let zeroCrossings = 0;
  for (let i = 1; i < len; i++) {
    if ((slice[i] >= 0 && slice[i - 1] < 0) || (slice[i] < 0 && slice[i - 1] >= 0)) zeroCrossings++;
  }
  const spectralCentroid = Math.min(5500, Math.max(250, (zeroCrossings / len) * sampleRate * 0.8));

  const dt = 1 / sampleRate;
  const alphaLow = dt / (1 / (2 * Math.PI * 800) + dt);
  const alphaMid = dt / (1 / (2 * Math.PI * 2500) + dt);

  let lowEnergy = 0, midEnergy = 0, highEnergy = 0, yLow = 0, yMid = 0;
  for (let i = 0; i < len; i++) {
    const x = slice[i];
    yLow += alphaLow * (x - yLow);
    yMid += alphaMid * (x - yMid);
    lowEnergy  += yLow * yLow;
    midEnergy  += (yMid - yLow) * (yMid - yLow);
    highEnergy += (x - yMid) * (x - yMid);
  }

  const totalBand = lowEnergy + midEnergy + highEnergy || 1e-6;
  return {
    pitch: meanPitch,
    pitchVariance: Math.sqrt(variancePitch),
    spectralCentroid,
    lowRatio: lowEnergy / totalBand,
    midRatio: midEnergy / totalBand,
    highRatio: highEnergy / totalBand,
    voicedFrameRatio: totalFrames > 0 ? voicedPitches.length / totalFrames : 0,
    rms,
  };
}

function featureVector(f: AcousticFeatures, fallbackPitch = 150): number[] {
  const ep = f.pitch > 0 ? f.pitch : (fallbackPitch > 0 ? fallbackPitch : 150);
  const normPitch = Math.max(0, Math.min(1, Math.log(ep / 75) / Math.log(450 / 75)));
  const normCentroid = Math.max(0, Math.min(1, Math.log(Math.max(200, f.spectralCentroid) / 200) / Math.log(5000 / 200)));
  return [
    normPitch * 3.5,
    normCentroid * 2.0,
    f.lowRatio * 2.0,
    f.midRatio * 1.6,
    f.highRatio * 1.4,
    Math.min(1, f.pitchVariance / 50) * 1.0,
  ];
}

function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; sum += d * d; }
  return Math.sqrt(sum);
}

function runKMeans(vectors: number[][], k: number, restarts = 5): { assignments: number[]; centroids: number[][]; inertia: number } {
  const n = vectors.length;
  if (k <= 1 || n <= 1) return { assignments: new Array(n).fill(1), centroids: vectors.length > 0 ? [vectors[0]] : [[]], inertia: 0 };

  const dims = vectors[0].length;
  let bestAssignments = new Array(n).fill(0);
  let bestCentroids: number[][] = [];
  let bestInertia = Infinity;

  for (let restart = 0; restart < restarts; restart++) {
    const centroids: number[][] = [[...vectors[restart % n]]];
    while (centroids.length < k) {
      let maxDist = -1, bestIdx = 0;
      for (let i = 0; i < n; i++) {
        let minDist = Infinity;
        for (const c of centroids) { const d = euclideanDistance(vectors[i], c); if (d < minDist) minDist = d; }
        if (minDist > maxDist) { maxDist = minDist; bestIdx = i; }
      }
      centroids.push([...vectors[bestIdx]]);
    }

    const assignments = new Array(n).fill(0);
    for (let iter = 0; iter < 20; iter++) {
      let changed = false;
      for (let i = 0; i < n; i++) {
        let minDist = Infinity, bestCluster = 0;
        for (let c = 0; c < k; c++) { const d = euclideanDistance(vectors[i], centroids[c]); if (d < minDist) { minDist = d; bestCluster = c; } }
        if (assignments[i] !== bestCluster) { assignments[i] = bestCluster; changed = true; }
      }
      if (!changed && iter > 0) break;

      const counts = new Array(k).fill(0);
      const newCentroids = Array.from({ length: k }, () => new Array(dims).fill(0));
      for (let i = 0; i < n; i++) { const c = assignments[i]; counts[c]++; for (let d = 0; d < dims; d++) newCentroids[c][d] += vectors[i][d]; }
      for (let c = 0; c < k; c++) { if (counts[c] > 0) for (let d = 0; d < dims; d++) centroids[c][d] = newCentroids[c][d] / counts[c]; }
    }

    let inertia = 0;
    for (let i = 0; i < n; i++) { const d = euclideanDistance(vectors[i], centroids[assignments[i]]); inertia += d * d; }
    if (inertia < bestInertia) { bestInertia = inertia; bestAssignments = [...assignments]; bestCentroids = centroids.map((c) => [...c]); }
  }

  return { assignments: bestAssignments.map((a) => a + 1), centroids: bestCentroids, inertia: bestInertia };
}

function computeSilhouette(vectors: number[][], assignments: number[], k: number): number {
  const n = vectors.length;
  if (k <= 1 || n <= k) return 0;
  const members = Array.from({ length: k + 1 }, () => [] as number[]);
  for (let i = 0; i < n; i++) members[assignments[i]].push(i);
  for (let c = 1; c <= k; c++) { if (members[c].length === 0) return -1; }

  let total = 0;
  for (let i = 0; i < n; i++) {
    const own = assignments[i];
    let a = 0;
    if (members[own].length > 1) {
      let sum = 0;
      for (const idx of members[own]) { if (idx !== i) sum += euclideanDistance(vectors[i], vectors[idx]); }
      a = sum / (members[own].length - 1);
    }
    let b = Infinity;
    for (let c = 1; c <= k; c++) {
      if (c === own || members[c].length === 0) continue;
      let sum = 0;
      for (const idx of members[c]) sum += euclideanDistance(vectors[i], vectors[idx]);
      const avg = sum / members[c].length;
      if (avg < b) b = avg;
    }
    total += (b - a) / Math.max(a, b, 1e-6);
  }
  return total / n;
}

/**
 * Acoustic fallback diarization using NCCF pitch + spectral clustering.
 * Used when pyannote segments are not available.
 */
function acousticDiarize(
  audioData: Float32Array,
  sampleRate: number,
  validChunks: WhisperChunk[],
  audioTotalDuration: number,
  expectedSpeakers: number
): number[] {
  const rawFeatures: AcousticFeatures[] = validChunks.map((c) => {
    const startSec = Math.max(0, c.timestamp[0]);
    const endSec = Math.min(audioTotalDuration, c.timestamp[1] ?? startSec + 2.5);
    return extractFeatures(audioData.subarray(Math.floor(startSec * sampleRate), Math.floor(endSec * sampleRate)), sampleRate);
  });

  const allVoicedPitches = rawFeatures.map((f) => f.pitch).filter((p) => p >= 75 && p <= 450);
  const globalAvgPitch = allVoicedPitches.length > 0
    ? allVoicedPitches.reduce((a, b) => a + b, 0) / allVoicedPitches.length : 150;

  const vectors = rawFeatures.map((f) => featureVector(f, globalAvgPitch));
  const n = vectors.length;

  let rawAssignments: number[];
  let finalSpeakerCount = 1;

  if (expectedSpeakers >= 2) {
    finalSpeakerCount = Math.min(expectedSpeakers, n);
    rawAssignments = runKMeans(vectors, finalSpeakerCount).assignments;
  } else {
    const maxK = Math.min(5, n);
    let bestK = 1, bestScore = -Infinity;
    let bestAssignments = new Array(n).fill(1);

    for (let k = 2; k <= maxK; k++) {
      const km = runKMeans(vectors, k, 4);
      let minCentDist = Infinity;
      for (let i = 0; i < km.centroids.length; i++) {
        for (let j = i + 1; j < km.centroids.length; j++) {
          const d = euclideanDistance(km.centroids[i], km.centroids[j]);
          if (d < minCentDist) minCentDist = d;
        }
      }
      const clusterSizes = new Array(k + 1).fill(0);
      for (const a of km.assignments) clusterSizes[a]++;
      const minSize = Math.min(...clusterSizes.slice(1));
      const sil = computeSilhouette(vectors, km.assignments, k);
      const minReqSize = n >= 6 ? 2 : 1;
      if (minCentDist >= 0.40 && sil >= 0.20 && minSize >= minReqSize && sil > bestScore) {
        bestScore = sil; bestK = k; bestAssignments = km.assignments;
      }
    }

    if (bestK >= 2) { finalSpeakerCount = bestK; rawAssignments = bestAssignments; }
    else { finalSpeakerCount = 1; rawAssignments = new Array(n).fill(1); }
  }

  // Chronological renaming
  const clusterToSpeaker = new Map<number, number>();
  let next = 1;
  return rawAssignments.map((c) => {
    if (!clusterToSpeaker.has(c)) clusterToSpeaker.set(c, next++);
    return clusterToSpeaker.get(c)!;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assign speakers to Whisper chunks and format a dialogue transcript.
 *
 * When `pyannoteSegments` is provided (pyannote server available), speakers are
 * assigned by maximum time-overlap with the pyannote output.
 *
 * When `pyannoteSegments` is undefined or empty, falls back to acoustic
 * K-Means clustering on pitch and spectral features.
 *
 * Output format:
 *   [00:00 - 00:04] Speaker 1: Hello, how are you?
 *   [00:04 - 00:08] Speaker 2: I'm doing well, thanks.
 *   [00:08 - 00:12] Speaker 1: Great. Let's get started.
 *   [00:12 - 00:17] Speaker 3: I have a question.
 *
 * @param audioData       Resampled 16 kHz mono Float32Array (needed for fallback)
 * @param sampleRate      Sample rate (16000)
 * @param chunks          Timestamped Whisper chunks
 * @param expectedSpeakers 0 = auto, 1 = solo, 2+ = explicit count
 * @param pyannoteSegments Optional segments from the pyannote server
 */
export function diarizeChunks(
  audioData: Float32Array,
  sampleRate: number,
  chunks: WhisperChunk[],
  expectedSpeakers = 0,
  pyannoteSegments?: PyannoteSeg[]
): DiarizationResult {
  const validChunks = chunks.filter(
    (c) => c.text && c.text.trim().length > 0 && c.timestamp && c.timestamp[0] !== null
  );

  if (validChunks.length === 0) {
    return { formattedText: "", turns: [], speakerCount: 0, usedPyannote: false };
  }

  const audioTotalDuration = audioData.length / sampleRate;

  // Single speaker short-circuit
  if (validChunks.length === 1 || expectedSpeakers === 1) {
    const singleText = validChunks.map((c) => c.text.trim()).join(" ");
    const startTime = Math.max(0, validChunks[0].timestamp[0] ?? 0);
    const endTime = Math.min(audioTotalDuration, validChunks[validChunks.length - 1].timestamp[1] ?? startTime + 3);
    const formattedLine = `[${formatTimestamp(startTime)} - ${formatTimestamp(endTime)}] Speaker 1: ${singleText}`;
    return {
      formattedText: formattedLine,
      turns: [{ speakerId: 1, speakerLabel: "Speaker 1", text: singleText, startTime, endTime }],
      speakerCount: 1,
      usedPyannote: false,
    };
  }

  // Prepare chunk time profiles
  const chunkProfiles = validChunks.map((c) => {
    const start = Math.max(0, c.timestamp[0]);
    const end = Math.min(audioTotalDuration, c.timestamp[1] ?? start + 2.5);
    return { start, end, text: c.text.trim() };
  });

  const durations = chunkProfiles.map((p) => p.end - p.start);

  // ── Pyannote path ──────────────────────────────────────────────────────────
  const hasPyannote = Array.isArray(pyannoteSegments) && pyannoteSegments.length > 0;

  if (hasPyannote) {
    const rawLabels = assignSpeakersByOverlap(chunkProfiles, pyannoteSegments!);
    const numbered = chronologicalRename(rawLabels);
    const smoothed = smoothAssignments(numbered, durations);
    const speakerCount = new Set(smoothed).size;
    const { turns, formattedText } = buildTurns(chunkProfiles, smoothed);
    return { formattedText, turns, speakerCount, usedPyannote: true };
  }

  // ── Acoustic fallback ──────────────────────────────────────────────────────
  const speakerNumbers = acousticDiarize(audioData, sampleRate, validChunks, audioTotalDuration, expectedSpeakers);
  const smoothed = smoothAssignments(speakerNumbers, durations);
  const speakerCount = new Set(smoothed).size;

  // Gender hints from pitch for acoustic fallback metadata
  const speakerPitches: Record<number, number[]> = {};
  for (let i = 0; i < chunkProfiles.length; i++) {
    const spk = smoothed[i];
    if (!speakerPitches[spk]) speakerPitches[spk] = [];
  }

  const genderMap = new Map<number, "male" | "female">();
  for (const [spkStr, pitches] of Object.entries(speakerPitches)) {
    if (pitches.length > 0) {
      const avg = pitches.reduce((a, b) => a + b, 0) / pitches.length;
      if (avg < 155) genderMap.set(Number(spkStr), "male");
      else if (avg > 180) genderMap.set(Number(spkStr), "female");
    }
  }

  const { turns, formattedText } = buildTurns(chunkProfiles, smoothed, genderMap);
  return { formattedText, turns, speakerCount, usedPyannote: false };
}
