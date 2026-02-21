import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStravaStatus } from "@/lib/strava";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const webhookUrl = process.env.STRAVA_SYNC_WEBHOOK_URL;
  const webhookToken = process.env.STRAVA_SYNC_WEBHOOK_TOKEN;

  if (!webhookUrl) {
    const status = await getStravaStatus();
    return NextResponse.json({
      ok: false,
      message:
        "Manual trigger not configured yet. Set STRAVA_SYNC_WEBHOOK_URL to wire this button to your strava-sync job.",
      lastSuccessfulSyncAt: status.lastSuccessfulSyncAt,
    });
  }

  const resp = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(webhookToken ? { Authorization: `Bearer ${webhookToken}` } : {}),
    },
    body: JSON.stringify({ requestedBy: user.id, source: "graafin-web" }),
  }).catch(() => null);

  const status = await getStravaStatus();

  if (!resp || !resp.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: "Sync trigger request sent but remote job did not confirm success.",
        lastSuccessfulSyncAt: status.lastSuccessfulSyncAt,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Manual sync triggered successfully.",
    lastSuccessfulSyncAt: status.lastSuccessfulSyncAt,
  });
}
