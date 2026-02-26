import { NextRequest, NextResponse } from "next/server";

function matchesServiceToken(request: NextRequest, expected: string) {
  const bearer = request.headers.get("authorization");
  if (bearer?.startsWith("Bearer ") && bearer.slice(7) === expected) return true;
  const tokenHeader = request.headers.get("x-job-token");
  return tokenHeader === expected;
}

async function responsePreview(resp: Response): Promise<string | null> {
  const text = await resp.text().catch(() => "");
  const trimmed = text.trim();
  if (!trimmed) return null;
  return trimmed.length > 220 ? `${trimmed.slice(0, 220)}...` : trimmed;
}

export async function POST(request: NextRequest) {
  const token = process.env.CHECKIN_JOB_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "CHECKIN_JOB_TOKEN is required." }, { status: 500 });
  }
  if (!matchesServiceToken(request, token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const webhookUrl = process.env.STRAVA_SYNC_WEBHOOK_URL;
  const webhookToken = process.env.STRAVA_SYNC_WEBHOOK_TOKEN;
  if (!webhookUrl) {
    return NextResponse.json(
      { error: "STRAVA_SYNC_WEBHOOK_URL is required for daily sync jobs." },
      { status: 500 },
    );
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(webhookToken ? { Authorization: `Bearer ${webhookToken}` } : {}),
    },
    body: JSON.stringify({ source: "daily-cron-08-gst" }),
    signal: AbortSignal.timeout(12_000),
  }).catch(() => null);

  if (!response || !response.ok) {
    const preview = response ? await responsePreview(response) : null;
    return NextResponse.json(
      {
        ok: false,
        message: "Daily Strava sync trigger did not confirm success.",
        remoteStatus: response?.status ?? null,
        remoteBodyPreview: preview,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
