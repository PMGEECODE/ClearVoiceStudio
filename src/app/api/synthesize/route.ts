import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { getPiperDir, getPiperPython, isPythonAvailable, PIPER_SERVER_URL } from "@/lib/piper";
import {
  ProcessProsodyOptions,
  ProsodyResult,
  processTextForProsody,
} from "@/lib/prosody";

interface DialogueTurn {
  speakerKey: string;
  speakerLabel: string;
  gender?: "male" | "female";
  text: string;
}

const DEFAULT_VOICE = "en_US-lessac-medium";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      text,
      voice = "en_US-lessac-medium",
      speaker_id = 0,
      length_scale = 1.0,
      noise_scale = 0.667,
      noise_w_scale = 0.8,
      sentence_silence = 0.2,
      speaker_voices = {},
      prosody_enabled = process.env.PIPER_PROSODY_ENABLED !== "false",
      prosody_profile = process.env.PIPER_PROSODY_PROFILE || "conversational",
      prosody_debug = false,
    } = body;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json({ error: "Text is required." }, { status: 400 });
    }

    const trimmedText = text.trim();
    if (trimmedText.length > 50000) {
      return NextResponse.json(
        { error: "Text exceeds maximum supported length (50,000 characters)." },
        { status: 400 }
      );
    }

    const baseSynthesisParams = {
      speakerId: Number(speaker_id) || 0,
      lengthScale: Number(length_scale) || 1.0,
      noiseScale: Number(noise_scale) || 0.667,
      noiseWScale: Number(noise_w_scale) || 0.8,
      sentenceSilence: Number(sentence_silence) || 0.2,
    };
    const useProsody = prosody_enabled !== false;
    const prosodyOptions: ProcessProsodyOptions = {
      profileId: String(prosody_profile || "conversational"),
      lengthScale: baseSynthesisParams.lengthScale,
      noiseScale: baseSynthesisParams.noiseScale,
      noiseWScale: baseSynthesisParams.noiseWScale,
      sentenceSilence: baseSynthesisParams.sentenceSilence,
      maxSegmentLength: Number(process.env.PIPER_PROSODY_MAX_SEGMENT_LENGTH) || undefined,
    };

    const dialogueTurns = parseDialogueTurns(trimmedText);
    if (dialogueTurns.length > 1) {
      const dialogueResult = await synthesizeDialogue({
        turns: dialogueTurns,
        requestedVoice: String(voice || DEFAULT_VOICE),
        speakerId: baseSynthesisParams.speakerId,
        lengthScale: baseSynthesisParams.lengthScale,
        noiseScale: baseSynthesisParams.noiseScale,
        noiseWScale: baseSynthesisParams.noiseWScale,
        sentenceSilence: baseSynthesisParams.sentenceSilence,
        speakerVoices: normalizeSpeakerVoiceOverrides(speaker_voices),
        prosodyEnabled: useProsody,
        prosodyOptions,
      });

      return new NextResponse(new Uint8Array(dialogueResult.audioBuffer), {
        status: 200,
        headers: {
          "Content-Type": "audio/wav",
          "Content-Length": dialogueResult.audioBuffer.byteLength.toString(),
          "Content-Disposition": 'inline; filename="dialogue.wav"',
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "X-Engine-Mode": "cli_dialogue",
          "X-Prosody-Mode": dialogueResult.prosodySegmentCount > dialogueTurns.length ? "enhanced" : "normalized",
          "X-Prosody-Profile": dialogueResult.prosodyProfile,
          "X-Prosody-Segments": dialogueResult.prosodySegmentCount.toString(),
          "X-Dialogue-Turns": dialogueTurns.length.toString(),
          "X-Dialogue-Speakers": dialogueResult.speakerVoiceMap.length.toString(),
          "X-Dialogue-Voices": encodeURIComponent(
            dialogueResult.speakerVoiceMap
              .map(([speaker, voiceId]) => `${speaker}=${voiceId}`)
              .join(";")
          ),
        },
      });
    }

    const prosody = useProsody
      ? processTextForProsody(trimmedText, prosodyOptions)
      : processTextForProsody(trimmedText, {
          ...prosodyOptions,
          profileId: "conversational",
          maxSegmentLength: Number.MAX_SAFE_INTEGER,
        });
    const textForPiper = useProsody ? prosody.normalizedText : trimmedText;
    const piperParams = useProsody
      ? prosody.piperParams
      : {
          lengthScale: baseSynthesisParams.lengthScale,
          noiseScale: baseSynthesisParams.noiseScale,
          noiseWScale: baseSynthesisParams.noiseWScale,
          sentenceSilence: baseSynthesisParams.sentenceSilence,
        };

    if (useProsody && prosody.segments.length > 1) {
      const piperDir = getPiperDir();
      const piperPython = getPiperPython();
      const modelPath = resolveModelPath(piperDir, String(voice || DEFAULT_VOICE));

      if (!isPythonAvailable(piperPython) || !existsSync(/* turbopackIgnore: true */ modelPath)) {
        return NextResponse.json(
          { error: "Voice engine or voice model file not found on server." },
          { status: 500 }
        );
      }

      const audioBuffer = await synthesizeProsodySegments({
        pythonBin: piperPython,
        modelPath,
        prosody,
        speakerId: baseSynthesisParams.speakerId,
      });

      return new NextResponse(new Uint8Array(audioBuffer), {
        status: 200,
        headers: buildAudioHeaders({
          filename: "speech.wav",
          byteLength: audioBuffer.byteLength,
          engineMode: "cli_prosody",
          prosody,
          debug: Boolean(prosody_debug),
        }),
      });
    }

    // 1. Primary path: Attempt fast HTTP server synthesis (resident in memory)
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout for long scripts

      const piperPayload = {
        text: textForPiper,
        voice,
        speaker_id: baseSynthesisParams.speakerId,
        length_scale: piperParams.lengthScale,
        noise_scale: piperParams.noiseScale,
        noise_w_scale: piperParams.noiseWScale,
        sentence_silence: piperParams.sentenceSilence,
      };

      const serverRes = await fetch(`${PIPER_SERVER_URL}/synthesize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(piperPayload),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (serverRes.ok) {
        const audioBuffer = await serverRes.arrayBuffer();
        return new NextResponse(audioBuffer, {
          status: 200,
          headers: buildAudioHeaders({
            filename: "speech.wav",
            byteLength: audioBuffer.byteLength,
            engineMode: "http_resident",
            prosody: useProsody ? prosody : undefined,
            debug: Boolean(prosody_debug),
          }),
        });
      }
    } catch {
      // Piper HTTP server not available or timed out, fall back to CLI execution
    }

    // 2. Fallback path: CLI execution with piper binary
    const piperDir = getPiperDir();
    const piperPython = getPiperPython();
    const fallbackModelPath = resolveModelPath(piperDir, String(voice || DEFAULT_VOICE));

    if (!isPythonAvailable(piperPython) || !existsSync(/* turbopackIgnore: true */ fallbackModelPath)) {
      return NextResponse.json(
        { error: "Voice engine or voice model file not found on server." },
        { status: 500 }
      );
    }

    const audioBuffer = await synthesizeViaCli({
      pythonBin: piperPython,
      modelPath: fallbackModelPath,
      text: textForPiper,
      speakerId: baseSynthesisParams.speakerId,
      lengthScale: piperParams.lengthScale,
      noiseScale: piperParams.noiseScale,
      noiseWScale: piperParams.noiseWScale,
      sentenceSilence: piperParams.sentenceSilence,
    });

    return new NextResponse(new Uint8Array(audioBuffer), {
      status: 200,
      headers: buildAudioHeaders({
        filename: "speech.wav",
        byteLength: audioBuffer.byteLength,
        engineMode: "cli_fallback",
        prosody: useProsody ? prosody : undefined,
        debug: Boolean(prosody_debug),
      }),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Synthesis failed";
    return NextResponse.json(
      { error: `Synthesis error: ${message}` },
      { status: 500 }
    );
  }
}

function parseDialogueTurns(input: string): DialogueTurn[] {
  const normalized = input.replace(/\\\s*/g, " ").replace(/\r\n?/g, "\n");
  const labels = findDialogueLabels(normalized);

  if (labels.length < 2) {
    return [];
  }

  return labels
    .map((label, index) => {
      const contentEnd =
        index + 1 < labels.length ? labels[index + 1].start : normalized.length;
      const rawLabel = label.name.trim();
      const labelGender =
        rawLabel.toLowerCase() === "male" || rawLabel.toLowerCase() === "female"
          ? (rawLabel.toLowerCase() as "male" | "female")
          : undefined;
      const text = cleanDialogueText(normalized.slice(label.end, contentEnd));

      return {
        speakerKey: rawLabel.toLowerCase().replace(/\s+/g, " "),
        speakerLabel: rawLabel,
        gender: label.gender || labelGender,
        text,
      };
    })
    .filter((turn) => turn.text.length > 0);
}

function findDialogueLabels(input: string): Array<{
  start: number;
  end: number;
  name: string;
  gender?: "male" | "female";
}> {
  const labels: Array<{
    start: number;
    end: number;
    name: string;
    gender?: "male" | "female";
  }> = [];

  // Markdown/script style allows named characters only when they are explicitly
  // formatted as speaker labels: **Ethan:**, **Speaker 1, male:**.
  const boldLineLabelPattern =
    /(^|\n)[ \t]*(?:[-*]\s*)?\*\*([A-Za-z][A-Za-z0-9_'’.-]*(?:\s+[A-Za-z0-9_'’.-]+){0,3}|Speaker\s*\d+|Narrator|Male|Female)(?:\s*,\s*(male|female))?[ \t]*:\*\*[ \t]*/gi;

  for (const match of input.matchAll(boldLineLabelPattern)) {
    const prefix = match[1] || "";
    labels.push({
      start: (match.index ?? 0) + prefix.length,
      end: (match.index ?? 0) + match[0].length,
      name: normalizeSpeakerLabel(match[2]),
      gender: normalizeGender(match[3]),
    });
  }

  // Plain line labels are intentionally limited to explicit speaker terms.
  // This prevents narration sections like "Step one:" from becoming speakers.
  const plainLineLabelPattern =
    /(^|\n)[ \t]*(?:[-*]\s*)?(Speaker\s*\d+|Narrator|Male|Female)(?:\s*,\s*(male|female))?[ \t]*:[ \t]*/gi;

  for (const match of input.matchAll(plainLineLabelPattern)) {
    const prefix = match[1] || "";
    labels.push({
      start: (match.index ?? 0) + prefix.length,
      end: (match.index ?? 0) + match[0].length,
      name: normalizeSpeakerLabel(match[2]),
      gender: normalizeGender(match[3]),
    });
  }

  if (labels.length >= 2) {
    return labels.sort((a, b) => a.start - b.start);
  }

  // Inline dialogue style:
  // Speaker 1, male: "Hello." Speaker 2, female: "Hi."
  // Kept intentionally narrower to avoid treating prose labels like "Note:" as speakers.
  const inlineLabelPattern =
    /(?:^|\n|\s)(Speaker\s*\d+|Narrator|Male|Female)(?:\s*,\s*(male|female))?\s*:\s*/gi;

  return Array.from(input.matchAll(inlineLabelPattern)).map((match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
    name: normalizeSpeakerLabel(match[1]),
    gender: normalizeGender(match[2]),
  }));
}

function normalizeSpeakerLabel(label: string): string {
  return label.replace(/\*+/g, "").replace(/\s+/g, " ").trim();
}

function normalizeGender(value?: string): "male" | "female" | undefined {
  const normalized = value?.toLowerCase();
  return normalized === "male" || normalized === "female" ? normalized : undefined;
}

function normalizeSpeakerVoiceOverrides(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .map(([speakerKey, voiceId]) => [
        normalizeSpeakerLabel(speakerKey).toLowerCase().replace(/\s+/g, " "),
        voiceId,
      ])
  );
}

function cleanDialogueText(value: string): string {
  return value
    .trim()
    .replace(/\*\*/g, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function synthesizeDialogue(params: {
  turns: DialogueTurn[];
  requestedVoice: string;
  speakerId: number;
  lengthScale: number;
  noiseScale: number;
  noiseWScale: number;
  sentenceSilence: number;
  speakerVoices: Record<string, string>;
  prosodyEnabled: boolean;
  prosodyOptions: ProcessProsodyOptions;
}): Promise<{
  audioBuffer: Buffer;
  speakerVoiceMap: string[][];
  prosodyProfile: string;
  prosodySegmentCount: number;
}> {
  const piperDir = getPiperDir();
  const piperPython = getPiperPython();
  const availableVoices = getInstalledVoiceIds(piperDir);
  const voiceBySpeaker = new Map<string, string>();
  const speakerLabels = new Map<string, string>();
  const chunks: Buffer[] = [];
  const turnPauses: number[] = [];
  let prosodyProfile = "off";
  let prosodySegmentCount = 0;

  for (const [turnIndex, turn] of params.turns.entries()) {
    const voiceId =
      params.speakerVoices[turn.speakerKey] ||
      voiceBySpeaker.get(turn.speakerKey) ||
      pickVoiceForTurn(
        turn,
        params.requestedVoice,
        availableVoices,
        voiceBySpeaker.size,
        new Set(voiceBySpeaker.values())
      );
    voiceBySpeaker.set(turn.speakerKey, voiceId);
    speakerLabels.set(turn.speakerKey, turn.speakerLabel);

    const modelPath = resolveModelPath(piperDir, voiceId);
    if (!isPythonAvailable(piperPython) || !existsSync(modelPath)) {
      throw new Error(`Voice engine or voice model missing for ${turn.speakerLabel}.`);
    }

    if (params.prosodyEnabled) {
      const turnProsody = processTextForProsody(turn.text, {
        ...params.prosodyOptions,
        lengthScale: softenForDialogue(params.lengthScale, turn),
        noiseScale: params.noiseScale,
        noiseWScale: params.noiseWScale,
        sentenceSilence: params.sentenceSilence,
      });
      const turnAudio = await synthesizeProsodySegments({
        pythonBin: piperPython,
        modelPath,
        prosody: turnProsody,
        speakerId: params.speakerId,
      });
      chunks.push(turnAudio);
      prosodyProfile = turnProsody.profile.id;
      prosodySegmentCount += turnProsody.segments.length;
    } else {
      chunks.push(
        await synthesizeViaCli({
          pythonBin: piperPython,
          modelPath,
          text: turn.text,
          speakerId: params.speakerId,
          lengthScale: softenForDialogue(params.lengthScale, turn),
          noiseScale: params.noiseScale,
          noiseWScale: params.noiseWScale,
          sentenceSilence: params.sentenceSilence,
        })
      );
      prosodySegmentCount += 1;
    }

    if (turnIndex < params.turns.length - 1) {
      turnPauses.push(Math.max(params.sentenceSilence, 0.18));
    }
  }

  return {
    audioBuffer: concatenateWav(chunks, turnPauses),
    speakerVoiceMap: Array.from(voiceBySpeaker.entries()).map(([speakerKey, voiceId]) => [
      speakerLabels.get(speakerKey) || speakerKey,
      voiceId,
    ]),
    prosodyProfile,
    prosodySegmentCount,
  };
}

async function synthesizeProsodySegments(params: {
  pythonBin: string;
  modelPath: string;
  prosody: ProsodyResult;
  speakerId: number;
}): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for (const segment of params.prosody.segments) {
    chunks.push(
      await synthesizeViaCli({
        pythonBin: params.pythonBin,
        modelPath: params.modelPath,
        text: segment.text,
        speakerId: params.speakerId,
        lengthScale: params.prosody.piperParams.lengthScale * segment.lengthScaleMultiplier,
        noiseScale: params.prosody.piperParams.noiseScale,
        noiseWScale: params.prosody.piperParams.noiseWScale,
        sentenceSilence: params.prosody.piperParams.sentenceSilence,
      })
    );
  }

  return concatenateWav(
    chunks,
    params.prosody.segments.slice(0, -1).map((segment) => segment.pauseAfter)
  );
}

function getInstalledVoiceIds(piperDir: string): string[] {
  try {
    return readdirSync(piperDir)
      .filter((file) => file.endsWith(".onnx"))
      .map((file) => file.replace(/\.onnx$/, ""))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [DEFAULT_VOICE];
  }
}

function resolveModelPath(piperDir: string, voiceId: string): string {
  const cleanId = voiceId.endsWith(".onnx") ? voiceId.slice(0, -5) : voiceId;
  const preferred = path.join(piperDir, `${cleanId}.onnx`);
  if (existsSync(preferred)) return preferred;

  const defaultPath = path.join(piperDir, `${DEFAULT_VOICE}.onnx`);
  if (existsSync(defaultPath)) return defaultPath;

  try {
    if (existsSync(piperDir)) {
      const files = readdirSync(piperDir);
      const anyOnnx = files.find((f) => f.endsWith(".onnx"));
      if (anyOnnx) {
        return path.join(piperDir, anyOnnx);
      }
    }
  } catch {}

  return preferred;
}

function pickVoiceForTurn(
  turn: DialogueTurn,
  requestedVoice: string,
  availableVoices: string[],
  speakerIndex: number,
  usedVoiceIds: Set<string>
): string {
  const requestedExists = availableVoices.includes(requestedVoice);
  const inferredGender = turn.gender || inferGenderFromSpeaker(turn.speakerLabel);
  const preferred = inferredGender
    ? findVoiceByGender(availableVoices, inferredGender, usedVoiceIds)
    : pickUnusedVoice(availableVoices, speakerIndex, usedVoiceIds);

  return (
    preferred ||
    pickUnusedVoice(availableVoices, speakerIndex, usedVoiceIds) ||
    (requestedExists ? requestedVoice : availableVoices[0] || DEFAULT_VOICE)
  );
}

function pickUnusedVoice(
  voices: string[],
  speakerIndex: number,
  usedVoiceIds: Set<string>
): string | undefined {
  if (voices.length === 0) return undefined;
  const unused = voices.filter((voice) => !usedVoiceIds.has(voice));
  const pool = unused.length > 0 ? unused : voices;
  return pool[speakerIndex % pool.length];
}

function findVoiceByGender(
  voices: string[],
  gender: "male" | "female",
  usedVoiceIds: Set<string>
): string | undefined {
  const maleHints = ["alan", "male", "ryan", "joe", "danny", "kusal", "arctic"];
  const femaleHints = ["amy", "lessac", "cori", "female", "kathleen", "libritts", "ljspeech"];
  const hints = gender === "male" ? maleHints : femaleHints;
  const matches = voices.filter((voice) => {
    const lower = voice.toLowerCase();
    return hints.some((hint) => lower.includes(hint));
  });

  return matches.find((voice) => !usedVoiceIds.has(voice)) || matches[0];
}

function inferGenderFromSpeaker(label: string): "male" | "female" | undefined {
  const normalized = label.toLowerCase();
  const speakerMatch = normalized.match(/^speaker\s*(\d+)$/);
  if (speakerMatch) {
    const speakerNumber = Number(speakerMatch[1]);
    if (Number.isFinite(speakerNumber)) {
      return speakerNumber % 2 === 0 ? "female" : "male";
    }
  }

  const maleNames = ["ethan", "caleb", "james", "john", "david", "michael", "daniel", "peter"];
  const femaleNames = ["amy", "mary", "sarah", "grace", "jane", "linda", "cori", "kathleen"];

  if (maleNames.includes(normalized)) return "male";
  if (femaleNames.includes(normalized)) return "female";
  return undefined;
}

function softenForDialogue(lengthScale: number, turn: DialogueTurn): number {
  const punctuation = turn.text.match(/[,.!?]/g)?.length || 0;
  const conversationalBump = punctuation > 0 ? 0.04 : 0.02;
  return Math.min(Math.max(lengthScale + conversationalBump, 0.65), 1.35);
}

function buildAudioHeaders(params: {
  filename: string;
  byteLength: number;
  engineMode: string;
  prosody?: ProsodyResult;
  debug?: boolean;
}): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "audio/wav",
    "Content-Length": params.byteLength.toString(),
    "Content-Disposition": `inline; filename="${params.filename}"`,
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "X-Engine-Mode": params.engineMode,
  };

  if (params.prosody) {
    headers["X-Prosody-Mode"] = params.prosody.segments.length > 1 ? "enhanced" : "normalized";
    headers["X-Prosody-Profile"] = params.prosody.profile.id;
    headers["X-Prosody-Segments"] = params.prosody.segments.length.toString();
    headers["X-Prosody-Normalized-Length"] = params.prosody.normalizedText.length.toString();
  }

  if (params.debug && process.env.NODE_ENV !== "production" && params.prosody) {
    headers["X-Prosody-Debug"] = encodeURIComponent(
      JSON.stringify({
        profile: params.prosody.profile.id,
        piperParams: params.prosody.piperParams,
        segments: params.prosody.segments.map((segment) => ({
          text: segment.text,
          pauseAfter: segment.pauseAfter,
          pauseType: segment.pauseType,
          reason: segment.reason,
        })),
      })
    );
  }

  return headers;
}

function synthesizeViaCli(params: {
  pythonBin: string;
  modelPath: string;
  text: string;
  speakerId: number;
  lengthScale: number;
  noiseScale: number;
  noiseWScale: number;
  sentenceSilence: number;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "piper-tts-"));
    const outputPath = path.join(tempDir, "speech.wav");
    const args = [
      "-m",
      "piper",
      "-m",
      params.modelPath,
      "-f",
      outputPath,
      "-s",
      params.speakerId.toString(),
      "--length-scale",
      params.lengthScale.toString(),
      "--noise-scale",
      params.noiseScale.toString(),
      "--noise-w-scale",
      params.noiseWScale.toString(),
      "--sentence-silence",
      params.sentenceSilence.toString(),
    ];

    const child = spawn(params.pythonBin, args, { stdio: ["pipe", "ignore", "pipe"] });
    let errOutput = "";

    child.stderr.on("data", (data) => {
      errOutput += data.toString();
    });

    child.on("close", (code) => {
      try {
        if (code === 0 && existsSync(outputPath)) {
          resolve(readFileSync(outputPath));
        } else {
          reject(new Error(`CLI exited with code ${code}: ${errOutput}`));
        }
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    child.on("error", (err) => {
      rmSync(tempDir, { recursive: true, force: true });
      reject(err);
    });

    // Write text to stdin and close stdin
    child.stdin.write(params.text);
    child.stdin.end();
  });
}

function concatenateWav(wavs: Buffer[], silenceSeconds: number | number[]): Buffer {
  if (wavs.length === 0) {
    throw new Error("No dialogue audio was generated.");
  }
  if (wavs.length === 1) {
    return wavs[0];
  }

  const first = parseWav(wavs[0]);
  const payloads: Buffer[] = [];

  wavs.forEach((wav, index) => {
    const parsed = parseWav(wav);
    if (
      parsed.audioFormat !== first.audioFormat ||
      parsed.numChannels !== first.numChannels ||
      parsed.sampleRate !== first.sampleRate ||
      parsed.bitsPerSample !== first.bitsPerSample
    ) {
      throw new Error("Dialogue voices produced incompatible WAV formats.");
    }

    const silence = index > 0 ? createSilence(first, getSilenceAt(silenceSeconds, index - 1)) : null;
    if (silence && silence.length > 0) {
      payloads.push(silence);
    }
    payloads.push(parsed.data);
  });

  const data = Buffer.concat(payloads);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(first.audioFormat, 20);
  header.writeUInt16LE(first.numChannels, 22);
  header.writeUInt32LE(first.sampleRate, 24);
  header.writeUInt32LE(first.byteRate, 28);
  header.writeUInt16LE(first.blockAlign, 32);
  header.writeUInt16LE(first.bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);

  return Buffer.concat([header, data]);
}

function parseWav(wav: Buffer) {
  if (wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Generated audio is not a WAV file.");
  }

  const fmtOffset = wav.indexOf("fmt ");
  const dataOffset = wav.indexOf("data");
  if (fmtOffset < 0 || dataOffset < 0) {
    throw new Error("Generated WAV is missing required chunks.");
  }

  const dataSize = wav.readUInt32LE(dataOffset + 4);
  const dataStart = dataOffset + 8;

  return {
    audioFormat: wav.readUInt16LE(fmtOffset + 8),
    numChannels: wav.readUInt16LE(fmtOffset + 10),
    sampleRate: wav.readUInt32LE(fmtOffset + 12),
    byteRate: wav.readUInt32LE(fmtOffset + 16),
    blockAlign: wav.readUInt16LE(fmtOffset + 20),
    bitsPerSample: wav.readUInt16LE(fmtOffset + 22),
    data: wav.subarray(dataStart, dataStart + dataSize),
  };
}

function createSilence(wavInfo: ReturnType<typeof parseWav>, seconds: number): Buffer {
  const frameCount = Math.round(wavInfo.sampleRate * seconds);
  const byteLength = frameCount * wavInfo.blockAlign;
  return Buffer.alloc(byteLength);
}

function getSilenceAt(value: number | number[], index: number): number {
  if (Array.isArray(value)) {
    return Math.max(0, value[index] || 0);
  }
  return Math.max(0, value);
}
