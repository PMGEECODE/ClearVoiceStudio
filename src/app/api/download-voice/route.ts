import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { getPiperDir, getPiperPython } from "@/lib/piper";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { voice } = body;

    if (!voice || typeof voice !== "string") {
      return NextResponse.json({ error: "Voice ID is required." }, { status: 400 });
    }

    const cleanVoice = voice.trim();
    const piperDir = getPiperDir();
    const piperPython = getPiperPython();

    // Check if already downloaded
    const onnxPath = path.join(piperDir, `${cleanVoice}.onnx`);
    const jsonPath = path.join(piperDir, `${cleanVoice}.onnx.json`);

    if (fs.existsSync(onnxPath) && fs.existsSync(jsonPath)) {
      return NextResponse.json({
        success: true,
        voice: cleanVoice,
        message: "Voice is already installed.",
        isInstalled: true,
      });
    }

    // Execute python download_voices
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        piperPython,
        [
          "-m",
          "piper.download_voices",
          "--download-dir",
          piperDir,
          cleanVoice,
        ],
        { stdio: ["ignore", "pipe", "pipe"] }
      );

      let stderr = "";
      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Download failed (code ${code}): ${stderr}`));
        }
      });

      child.on("error", (err) => {
        reject(err);
      });
    });

    return NextResponse.json({
      success: true,
      voice: cleanVoice,
      message: `Voice ${cleanVoice} downloaded successfully.`,
      isInstalled: true,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Download failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
