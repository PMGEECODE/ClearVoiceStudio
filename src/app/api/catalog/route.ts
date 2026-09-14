import { NextResponse } from "next/server";
import fs from "fs";
import { getPiperDir, PIPER_SERVER_URL } from "@/lib/piper";

export interface CatalogVoice {
  id: string;
  name: string;
  languageFamily: string;
  languageCode: string;
  languageName: string;
  countryName: string;
  quality: string;
  numSpeakers: number;
  sampleUrl: string;
  isInstalled: boolean;
  sizeBytes?: number;
}

interface RawVoiceItem {
  name?: string;
  quality?: string;
  num_speakers?: number;
  language?: {
    family?: string;
    code?: string;
    name_english?: string;
    country_english?: string;
  };
  files?: Record<string, { size_bytes?: number }>;
}

let cachedCatalog: CatalogVoice[] | null = null;
let lastFetchTime = 0;

export async function GET() {
  const now = Date.now();
  const piperDir = getPiperDir();

  // Re-check installed status even if using cached catalog
  const getInstalledSet = (): Set<string> => {
    try {
      if (fs.existsSync(/* turbopackIgnore: true */ piperDir)) {
        const files = fs.readdirSync(/* turbopackIgnore: true */ piperDir);
        return new Set(
          files
            .filter((f) => f.endsWith(".onnx"))
            .map((f) => f.replace(/\.onnx$/, ""))
        );
      }
    } catch {
      // ignore
    }
    return new Set<string>();
  };

  const installedSet = getInstalledSet();

  // Return cached if fetched within the last 10 minutes
  if (cachedCatalog && now - lastFetchTime < 600000) {
    const updated = cachedCatalog.map((v) => ({
      ...v,
      isInstalled: installedSet.has(v.id),
    }));
    return NextResponse.json({ voices: updated });
  }

  try {
    // 1. Attempt to fetch all-voices from Piper server or HuggingFace
    let rawVoices: Record<string, RawVoiceItem> = {};

    try {
      const serverRes = await fetch(`${PIPER_SERVER_URL}/all-voices`, {
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      });
      if (serverRes.ok) {
        rawVoices = (await serverRes.json()) as Record<string, RawVoiceItem>;
      }
    } catch {
      // Fallback directly to Hugging Face voices.json
      const hfRes = await fetch(
        "https://huggingface.co/rhasspy/piper-voices/resolve/main/voices.json?download=true",
        { signal: AbortSignal.timeout(6000) }
      );
      if (hfRes.ok) {
        rawVoices = (await hfRes.json()) as Record<string, RawVoiceItem>;
      }
    }

    const catalog: CatalogVoice[] = Object.entries(rawVoices).map(
      ([key, data]) => {
        const lang = data.language || {};
        const family = lang.family || key.split("_")[0] || "en";
        const code = lang.code || "en_US";
        const name = data.name || "voice";
        const quality = data.quality || "medium";
        const numSpeakers = data.num_speakers || 1;

        // HuggingFace / Piper official sample URL structure
        const sampleUrl = `https://rhasspy.github.io/piper-samples/samples/${family}/${code}/${name}/${quality}/speaker_0.mp3`;

        // Calculate approximate size
        let sizeBytes = 63000000;
        if (data.files) {
          for (const fileKey in data.files) {
            if (fileKey.endsWith(".onnx")) {
              sizeBytes = data.files[fileKey].size_bytes || sizeBytes;
              break;
            }
          }
        }

        return {
          id: key,
          name: name,
          languageFamily: family,
          languageCode: code,
          languageName: lang.name_english || code,
          countryName: lang.country_english || "",
          quality: quality,
          numSpeakers: numSpeakers,
          sampleUrl: sampleUrl,
          isInstalled: installedSet.has(key),
          sizeBytes: sizeBytes,
        };
      }
    );

    // Sort: English first, then alphabetical by language and name
    catalog.sort((a, b) => {
      const aIsEn = a.languageCode.startsWith("en");
      const bIsEn = b.languageCode.startsWith("en");
      if (aIsEn && !bIsEn) return -1;
      if (!aIsEn && bIsEn) return 1;
      return a.id.localeCompare(b.id);
    });

    cachedCatalog = catalog;
    lastFetchTime = now;

    return NextResponse.json({ voices: catalog });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load voice catalog";
    return NextResponse.json(
      { error: message, voices: [] },
      { status: 500 }
    );
  }
}
