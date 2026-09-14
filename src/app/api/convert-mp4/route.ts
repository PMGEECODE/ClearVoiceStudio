import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode") || "audio"; // "audio" or "video"

    const audioArrayBuffer = await req.arrayBuffer();
    if (!audioArrayBuffer || audioArrayBuffer.byteLength < 44) {
      return NextResponse.json(
        { error: "Valid WAV audio data is required for conversion." },
        { status: 400 }
      );
    }

    const inputBuffer = Buffer.from(audioArrayBuffer);

    const convertedBuffer = await new Promise<Buffer>((resolve, reject) => {
      let ffmpegArgs: string[];

      if (mode === "video") {
        // Render 1280x720 HD visual soundwave MP4 video
        ffmpegArgs = [
          "-y",
          "-i",
          "pipe:0",
          "-filter_complex",
          "[0:a]showwaves=s=1280x720:mode=line:colors=0x2dd4bf:scale=sqrt[v]",
          "-map",
          "[v]",
          "-map",
          "0:a",
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          "-shortest",
          "-movflags",
          "frag_keyframe+empty_moov+default_base_moof",
          "-f",
          "mp4",
          "pipe:1",
        ];
      } else {
        // Compressed MP3 audio for sharing and broad player compatibility.
        ffmpegArgs = [
          "-y",
          "-i",
          "pipe:0",
          "-c:a",
          "libmp3lame",
          "-b:a",
          "192k",
          "-f",
          "mp3",
          "pipe:1",
        ];
      }

      const ffmpeg = spawn("ffmpeg", ffmpegArgs, {
        stdio: ["pipe", "pipe", "pipe"],
      });

      const chunks: Buffer[] = [];
      let errLog = "";

      ffmpeg.stdout.on("data", (chunk) => {
        chunks.push(chunk);
      });

      ffmpeg.stderr.on("data", (data) => {
        errLog += data.toString();
      });

      ffmpeg.on("close", (code) => {
        if (code === 0 && chunks.length > 0) {
          resolve(Buffer.concat(chunks));
        } else {
          reject(new Error(`FFmpeg exited with code ${code}: ${errLog.slice(-400)}`));
        }
      });

      ffmpeg.on("error", (err) => {
        reject(err);
      });

      ffmpeg.stdin.write(inputBuffer);
      ffmpeg.stdin.end();
    });

    const filename = mode === "video" ? "speech_video.mp4" : "speech.mp3";
    const contentType = mode === "video" ? "video/mp4" : "audio/mpeg";

    return new NextResponse(new Uint8Array(convertedBuffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": convertedBuffer.byteLength.toString(),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Conversion failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
