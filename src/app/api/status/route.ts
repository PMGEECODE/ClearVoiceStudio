import { NextResponse } from "next/server";
import { PIPER_SERVER_URL, ensurePiperServer } from "@/lib/piper";

export async function GET() {
  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    let res = await fetch(`${PIPER_SERVER_URL}/info`, {
      signal: controller.signal,
      cache: "no-store",
    }).catch(() => null);
    clearTimeout(timeout);

    // Auto-heal: If Piper HTTP server isn't running, trigger background launch
    if (!res || !res.ok) {
      const started = await ensurePiperServer();
      if (started) {
        res = await fetch(`${PIPER_SERVER_URL}/info`, { cache: "no-store" }).catch(() => null);
      }
    }

    if (res && res.ok) {
      const data = await res.json();
      const latency = Date.now() - startTime;
      return NextResponse.json({
        status: "online",
        latencyMs: latency,
        voice: data.voice,
        last: data.last,
      });
    }

    return NextResponse.json(
      {
        status: "offline",
        error: "Voice engine initializing",
      },
      { status: 503 }
    );
  } catch {
    return NextResponse.json(
      {
        status: "offline",
        error: "Voice engine service unavailable",
      },
      { status: 503 }
    );
  }
}
