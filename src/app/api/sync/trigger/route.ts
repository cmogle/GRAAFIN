import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStravaStatus } from "@/lib/strava";

const HARD_MIN_SYNC_INTERVAL_MS = 3 * 60 * 1000;
const APP_LAUNCH_SYNC_INTERVAL_MS = 30 * 60 * 1000;
const STALE_ACTIVITY_WINDOW_MS = 6 * 60 * 60 * 1000;

type TriggerRequest = {
  source?: string;
  force?: boolean;
};

async function responsePreview(resp: Response): Promise<string | null> {
  const text = await resp.text().catch(() => "");
  const trimmed = text.trim();
  if (!trimmed) return null;
  return trimmed.length > 220 ? `${trimmed.slice(0, 220)}...` : trimmed;
}

function isLikelyNewActivityGap(status: Awaited<ReturnType<typeof getStravaStatus>>) {
  const latestStartDate = status.latestActivity?.startDate;
  const latestActivityMs = latestStartDate ? Date.parse(latestStartDate) : Number.NaN;
  if (!Number.isFinite(latestActivityMs)) return true;
  return Date.now() - latestActivityMs > STALE_ACTIVITY_WINDOW_MS;
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as TriggerRequest;
  const source = payload.source ?? "manual";
  const force = payload.force === true;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const status = await getStravaStatus();
  const lastSyncedAt = status.lastSuccessfulSyncAt ? Date.parse(status.lastSuccessfulSyncAt) : NaN;
  const msSinceLastSync = Number.isFinite(lastSyncedAt) ? Date.now() - lastSyncedAt : Number.POSITIVE_INFINITY;

  if (!force && Number.isFinite(lastSyncedAt) && msSinceLastSync < HARD_MIN_SYNC_INTERVAL_MS) {
    return NextResponse.json(
      {
        ok: true,
        skipped: true,
        message: "Sync was triggered very recently. Please wait a couple of minutes.",
        lastSuccessfulSyncAt: status.lastSuccessfulSyncAt,
      },
      { status: 200 },
    );
  }

  const appLaunchThrottled =
    source === "app-launch" &&
    !force &&
    Number.isFinite(lastSyncedAt) &&
    msSinceLastSync < APP_LAUNCH_SYNC_INTERVAL_MS &&
    !isLikelyNewActivityGap(status);

  if (appLaunchThrottled) {
    return NextResponse.json(
      {
        ok: true,
        skipped: true,
        message: "Launch sync skipped because a recent sync already completed.",
        lastSuccessfulSyncAt: status.lastSuccessfulSyncAt,
      },
      { status: 200 },
    );
  }

  const webhookUrl = process.env.STRAVA_SYNC_WEBHOOK_URL;
  const webhookToken = process.env.STRAVA_SYNC_WEBHOOK_TOKEN;

  if (!webhookUrl) {
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
    body: JSON.stringify({ requestedBy: user.id, source }),
    signal: AbortSignal.timeout(12_000),
  }).catch(() => null);

  if (!resp || !resp.ok) {
    const preview = resp ? await responsePreview(resp) : null;
    return NextResponse.json(
      {
        ok: false,
        message: "Sync trigger request sent but remote job did not confirm success.",
        lastSuccessfulSyncAt: status.lastSuccessfulSyncAt,
        remoteStatus: resp?.status ?? null,
        remoteBodyPreview: preview,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Manual sync request accepted.",
    lastSuccessfulSyncAt: status.lastSuccessfulSyncAt,
  });
}
