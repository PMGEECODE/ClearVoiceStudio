import { NextRequest, NextResponse } from "next/server";
import { PROSODY_PROFILES, processTextForProsody } from "@/lib/prosody";

export async function GET() {
  return NextResponse.json({
    defaultProfile: process.env.PIPER_PROSODY_PROFILE || "conversational",
    profiles: Object.values(PROSODY_PROFILES).map((profile) => ({
      id: profile.id,
      label: profile.label,
      maxSegmentLength: profile.maxSegmentLength,
      pauseIntensity: profile.pauseIntensity,
      sentenceSpacing: profile.sentenceSpacing,
      clauseSpacing: profile.clauseSpacing,
      emphasis: profile.emphasis,
    })),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text = typeof body.text === "string" ? body.text.trim() : "";

    if (!text) {
      return NextResponse.json({ error: "Text is required." }, { status: 400 });
    }

    if (text.length > 50000) {
      return NextResponse.json(
        { error: "Text exceeds maximum supported length (50,000 characters)." },
        { status: 400 }
      );
    }

    const result = processTextForProsody(text, {
      profileId: String(body.prosody_profile || process.env.PIPER_PROSODY_PROFILE || "conversational"),
      lengthScale: Number(body.length_scale) || 1,
      noiseScale: Number(body.noise_scale) || 0.667,
      noiseWScale: Number(body.noise_w_scale) || 0.8,
      sentenceSilence: Number(body.sentence_silence) || 0.2,
      maxSegmentLength: Number(process.env.PIPER_PROSODY_MAX_SEGMENT_LENGTH) || undefined,
    });

    return NextResponse.json({
      originalText: result.originalText,
      normalizedText: result.normalizedText,
      profile: result.profile,
      piperParams: result.piperParams,
      segments: result.segments,
      before: {
        text,
      },
      after: {
        text: result.normalizedText,
        segments: result.segments.map((segment) => segment.text),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Prosody preview failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
