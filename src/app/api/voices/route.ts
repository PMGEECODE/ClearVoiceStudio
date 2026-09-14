import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getPiperDir, PIPER_SERVER_URL } from "@/lib/piper";

export interface VoiceModelInfo {
  id: string;
  name: string;
  language: string;
  country: string;
  quality: string;
  sampleRate: number;
  numSpeakers: number;
  speakers?: Record<string, number>;
}

interface RawVoiceConfig {
  language?: {
    name_english?: string;
    code?: string;
    country_english?: string;
  };
  audio?: {
    quality?: string;
    sample_rate?: number;
  };
  num_speakers?: number;
  speaker_id_map?: Record<string, number>;
}

export async function GET() {
  const piperDir = getPiperDir();

  // 1. Primary: Query the running Piper HTTP server
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`${PIPER_SERVER_URL}/voices`, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);

    if (res.ok) {
      const voicesDict = (await res.json()) as Record<string, RawVoiceConfig>;
      const voicesList: VoiceModelInfo[] = Object.entries(voicesDict).map(
        ([id, rawConfig]) => {
          const config = rawConfig || {};
          const langObj = config.language || {};
          const audioObj = config.audio || {};
          const numSpeakers = config.num_speakers || 1;
          const speakerIdMap = config.speaker_id_map || {};

          return {
            id,
            name: id.replace(/_/g, " "),
            language: langObj.name_english || langObj.code || "English",
            country: langObj.country_english || "US",
            quality: audioObj.quality || "medium",
            sampleRate: audioObj.sample_rate || 22050,
            numSpeakers,
            speakers: speakerIdMap,
          };
        }
      );

      if (voicesList.length > 0) {
        return NextResponse.json({ voices: voicesList, source: "server" });
      }
    }
  } catch {
    // Piper server not responding to /voices, proceed to local discovery
  }

  // 2. Fallback: Dynamic discovery of installed models in piperDir
  try {
    if (fs.existsSync(piperDir)) {
      const files = fs.readdirSync(piperDir);
      const onnxFiles = files.filter((f) => f.endsWith(".onnx"));

      const discovered: VoiceModelInfo[] = onnxFiles.map((f) => {
        const id = f.replace(/\.onnx$/, "");
        const jsonPath = path.join(piperDir, `${id}.onnx.json`);
        let config: RawVoiceConfig = {};
        if (fs.existsSync(jsonPath)) {
          try {
            config = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as RawVoiceConfig;
          } catch {
            // ignore
          }
        }

        const langObj = config.language || {};
        const audioObj = config.audio || {};
        const parts = id.split("-");
        const langCode = parts[0] || "en_US";
        const isGb = langCode.startsWith("en_GB");

        return {
          id,
          name: id.replace(/_/g, " "),
          language: langObj.name_english || (isGb ? "English (GB)" : "English (US)"),
          country: langObj.country_english || (isGb ? "United Kingdom" : "United States"),
          quality: audioObj.quality || parts[2] || "medium",
          sampleRate: audioObj.sample_rate || 22050,
          numSpeakers: config.num_speakers || 1,
          speakers: config.speaker_id_map || {},
        };
      });

      if (discovered.length > 0) {
        return NextResponse.json({ voices: discovered, source: "disk_discovery" });
      }
    }
  } catch {
    // ignore
  }

  const defaultModels: VoiceModelInfo[] = [
    {
      id: "en_US-lessac-medium",
      name: "en_US lessac medium",
      language: "English (US)",
      country: "United States",
      quality: "medium",
      sampleRate: 22050,
      numSpeakers: 1,
    },
    {
      id: "en_US-amy-medium",
      name: "en_US amy medium",
      language: "English (US)",
      country: "United States",
      quality: "medium",
      sampleRate: 22050,
      numSpeakers: 1,
    },
  ];

  return NextResponse.json({
    voices: defaultModels,
    source: "fallback",
  });
}
