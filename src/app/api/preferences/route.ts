import { NextRequest, NextResponse } from "next/server";
import { readPreferences, writePreferences } from "@/lib/preferences";

// ---------------------------------------------------------------------------
// GET /api/preferences — load stored user preferences
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const prefs = await readPreferences();
    return NextResponse.json(prefs);
  } catch {
    return NextResponse.json(
      { error: "Failed to load preferences" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/preferences — save one or many preference fields
// ---------------------------------------------------------------------------

export async function PATCH(req: NextRequest) {
  // Reject unexpected content types
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return NextResponse.json(
      { error: "Content-Type must be application/json" },
      { status: 415 }
    );
  }

  // Enforce a sane request size limit (16 KB is vastly more than needed)
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > 16_384) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Body must be a JSON object" },
      { status: 400 }
    );
  }

  try {
    const saved = await writePreferences(body as Record<string, unknown>);
    return NextResponse.json(saved);
  } catch (err) {
    if (err instanceof RangeError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    return NextResponse.json(
      { error: "Failed to save preferences" },
      { status: 500 }
    );
  }
}
