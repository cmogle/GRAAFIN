import { NextRequest, NextResponse } from "next/server";
import { triggerRemoteStravaSync } from "@/lib/sync/remote-trigger";

function matchesServiceToken(request: NextRequest, expected: string) {
  const bearer = request.headers.get("authorization");
  if (bearer?.startsWith("Bearer ") && bearer.slice(7) === expected) return true;
  const tokenHeader = request.headers.get("x-job-token");
  return tokenHeader === expected;
}

export async function POST(request: NextRequest) {
  const token = process.env.CHECKIN_JOB_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "CHECKIN_JOB_TOKEN is required." }, { status: 500 });
  }
  if (!matchesServiceToken(request, token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const remote = await triggerRemoteStravaSync({
    source: "daily-cron-08-gst",
    force: false,
  });

  if (!remote.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: remote.message,
        remoteChannel: remote.channel,
        remoteStatus: remote.remoteStatus,
        remoteBodyPreview: remote.remoteBodyPreview,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, message: remote.message, remoteChannel: remote.channel });
}
