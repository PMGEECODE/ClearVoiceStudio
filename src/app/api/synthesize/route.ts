import { NextRequest, NextResponse } from "next/server";
import {
  parseScriptTurns,
  stripScriptTagsAndTimestamps,
  normalizeSpeakerLabel,
} from "@/lib/scriptAnalysis";
import { EmotionType, EMOTION_PROFILES } from "@/lib/emotionDetection";
import { buildWavFromPcm, concatenateWav } from "@/lib/wav";
import { voiceEngine, KOKORO_VOICES_CATALOG } from "@/lib/voice-engine";
import { DEFAULT_VOICE_ID, isVoiceDownloaded } from "@/lib/voiceStorage";
import { getClearVoiceLogPath, logServerEvent } from "@/lib/serverLog";
import { getProsodyProfile } from "@/lib/prosody";

interface DialogueTurn {
  speakerKey: string;
  speakerLabel: string;
  gender?: "male" | "female";
  text: string;
  emotion?: EmotionType;
  pauseDuration?: number;
  isPause?: boolean;
}

const DEFAULT_VOICE = DEFAULT_VOICE_ID;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      text,
      voice = DEFAULT_VOICE,
      speaker_id = 0,
      length_scale = 1.0,
      speaker_voices = {},
      prosody_enabled = true,
      prosody_profile = "conversational",
      emotion_mode = true,
      emotion_intensity = 0.7,
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
    };

    logServerEvent("synthesize", "Synthesis request received", {
      voice,
      textLength: trimmedText.length,
      platform: process.platform,
      emotionMode: emotion_mode !== false,
      prosodyProfile: prosody_enabled !== false ? String(prosody_profile) : "off",
    });

    const dialogueTurns = parseDialogueTurns(trimmedText);

    if (dialogueTurns.length > 1) {
      const dialogueResult = await synthesizeDialogue({
        turns: dialogueTurns,
        requestedVoice: String(voice || DEFAULT_VOICE),
        lengthScale: baseSynthesisParams.lengthScale,
        speakerVoices: normalizeSpeakerVoiceOverrides(speaker_voices),
        emotionMode: emotion_mode !== false,
        emotionIntensity: Number(emotion_intensity),
        prosodyEnabled: prosody_enabled !== false,
        prosodyProfile: String(prosody_profile),
        sentenceSilence: Number(body.sentence_silence) || 0.2,
      });

      return new NextResponse(new Uint8Array(dialogueResult.audioBuffer), {
        status: 200,
        headers: {
          "Content-Type": "audio/wav",
          "Content-Length": dialogueResult.audioBuffer.byteLength.toString(),
          "Content-Disposition": 'inline; filename="dialogue.wav"',
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "X-Engine-Mode": "kokoro_dialogue",
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

    // Single voice synthesis: clean timestamp brackets and speaker markers
    const cleanSynthesisText =
      dialogueTurns.length === 1
        ? dialogueTurns[0].text
        : stripScriptTagsAndTimestamps(trimmedText) || trimmedText;

    const requestedVoiceId = String(voice || DEFAULT_VOICE);
    const isInstalled = isVoiceDownloaded(requestedVoiceId);
    if (!isInstalled) {
      const voiceDef = KOKORO_VOICES_CATALOG.find((v) => v.id === requestedVoiceId);
      const name = voiceDef?.name || requestedVoiceId;
      return NextResponse.json(
        {
          error: `Voice "${name}" is not installed yet. Please download it from the Voice Catalog.`,
          requiresDownload: true,
          voiceId: requestedVoiceId,
        },
        { status: 409 }
      );
    }

    const kokoroResult = await voiceEngine.synthesize({
      text: cleanSynthesisText,
      voiceId: requestedVoiceId,
      lengthScale: baseSynthesisParams.lengthScale,
      sentenceSilence: Number(body.sentence_silence) || 0.2,
      prosodyEnabled: prosody_enabled !== false,
      prosodyProfile: String(prosody_profile),
      emotionMode: emotion_mode !== false,
      emotionIntensity: Number(emotion_intensity),
    });

    return new NextResponse(new Uint8Array(kokoroResult.audioBuffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": kokoroResult.audioBuffer.byteLength.toString(),
        "Content-Disposition": 'inline; filename="speech.wav"',
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "X-Engine-Mode": "kokoro_node_native",
        "X-Sample-Rate": "24000",
        "X-Prosody-Profile": prosody_enabled !== false ? String(prosody_profile) : "off",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Synthesis failed";
    logServerEvent("synthesize", "Synthesis failed", { error: message }, "error");
    return NextResponse.json(
      { error: `Synthesis error: ${message}`, logFile: getClearVoiceLogPath() },
      { status: 500 }
    );
  }
}

function parseDialogueTurns(input: string): DialogueTurn[] {
  const turns = parseScriptTurns(input);
  return turns.map((turn) => ({
    speakerKey: turn.speakerKey,
    speakerLabel: turn.speakerLabel,
    text: turn.text,
    emotion: turn.emotion,
    pauseDuration: turn.pauseDuration,
    isPause: turn.isPause,
  }));
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

/** Preserves the pre-emotion-mode dialogue timing when the feature is disabled. */
function legacyDialogueLengthScale(baseLengthScale: number, turn: DialogueTurn): number {
  const profile = turn.emotion ? EMOTION_PROFILES[turn.emotion] : null;
  const lengthScale = profile ? baseLengthScale * profile.lengthScaleMultiplier : baseLengthScale;
  return Math.min(Math.max(lengthScale, 0.6), 1.5);
}

function createSilenceWavBuffer(seconds: number, sampleRate = 24000): Buffer {
  const frameCount = Math.round(Math.max(0, seconds) * sampleRate);
  const pcm = Buffer.alloc(frameCount * 2); // 16-bit mono
  return buildWavFromPcm(pcm, {
    audioFormat: 1,
    numChannels: 1,
    sampleRate,
    bitsPerSample: 16,
  });
}

async function synthesizeDialogue(params: {
  turns: DialogueTurn[];
  requestedVoice: string;
  lengthScale: number;
  speakerVoices: Record<string, string>;
  emotionMode: boolean;
  emotionIntensity: number;
  prosodyEnabled: boolean;
  prosodyProfile: string;
  sentenceSilence: number;
}): Promise<{
  audioBuffer: Buffer;
  speakerVoiceMap: string[][];
}> {
  // Available voices for auto-assignment: installed voices
  const installedVoices = KOKORO_VOICES_CATALOG.filter((k) => isVoiceDownloaded(k.id)).map((k) => k.id);
  const availableVoices = installedVoices.length > 0 ? installedVoices : [DEFAULT_VOICE];

  const voiceBySpeaker = new Map<string, string>();
  const speakerLabels = new Map<string, string>();
  const chunks: Buffer[] = [];

  for (const turn of params.turns) {
    if (turn.isPause || (turn.text.trim().length === 0 && (turn.pauseDuration ?? 0) > 0)) {
      chunks.push(createSilenceWavBuffer(turn.pauseDuration ?? 1.0, 24000));
      continue;
    }

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

    const result = await voiceEngine.synthesize({
      text: turn.text,
      voiceId,
      lengthScale: params.emotionMode
        ? params.lengthScale
        : legacyDialogueLengthScale(params.lengthScale, turn),
      emotionMode: params.emotionMode,
      emotionIntensity: params.emotionIntensity,
      emotionHint: turn.emotion,
      prosodyEnabled: params.prosodyEnabled,
      prosodyProfile: params.prosodyProfile,
    });
    chunks.push(result.audioBuffer);
  }

  const dialogueGap = params.prosodyEnabled
    ? params.sentenceSilence * getProsodyProfile(params.prosodyProfile).sentenceSpacing
    : 0.12;
  const audioBuffer = concatenateWav(chunks, dialogueGap);
  const speakerVoiceMap = Array.from(voiceBySpeaker.entries()).map(([k, v]) => [
    speakerLabels.get(k) || k,
    v,
  ]);

  return {
    audioBuffer,
    speakerVoiceMap,
  };
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

  if (inferredGender) {
    const genderMatches = availableVoices.filter((v) => {
      const def = KOKORO_VOICES_CATALOG.find((k) => k.id === v);
      return def && def.gender === inferredGender;
    });
    if (genderMatches.length > 0) {
      const unused = genderMatches.find((v) => !usedVoiceIds.has(v));
      if (unused) return unused;
      return genderMatches[speakerIndex % genderMatches.length];
    }
  }

  const unused = availableVoices.find((v) => !usedVoiceIds.has(v));
  if (unused) return unused;

  return requestedExists ? requestedVoice : availableVoices[speakerIndex % availableVoices.length] || DEFAULT_VOICE;
}

function inferGenderFromSpeaker(label: string): "male" | "female" | undefined {
  const normalized = label.toLowerCase().replace(/\(.*?\)/g, "").trim();
  const speakerMatch = normalized.match(/^speaker\s*(\d+)$/);
  if (speakerMatch) {
    const num = Number(speakerMatch[1]);
    if (Number.isFinite(num)) {
      return num % 2 === 0 ? "female" : "male";
    }
  }

  const maleNames = ["alex", "marcus", "ethan", "caleb", "james", "john", "david", "michael", "daniel", "peter", "adam", "george", "lewis", "eric", "liam"];
  const femaleNames = ["heart", "bella", "sarah", "nicole", "emma", "isabella", "alice", "lily", "aoede", "jessica", "kore", "river", "mary", "jane"];

  for (const name of maleNames) {
    if (normalized.includes(name)) return "male";
  }
  for (const name of femaleNames) {
    if (normalized.includes(name)) return "female";
  }
  return undefined;
}
