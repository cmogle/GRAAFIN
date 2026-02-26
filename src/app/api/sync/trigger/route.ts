import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStravaStatus } from "@/lib/strava";
import { triggerRemoteStravaSync } from "@/lib/sync/remote-trigger";

const HARD_MIN_SYNC_INTERVAL_MS = 3 * 60 * 1000;
const APP_LAUNCH_SYNC_INTERVAL_MS = 30 * 60 * 1000;
const STALE_ACTIVITY_WINDOW_MS = 6 * 60 * 60 * 1000;

type TriggerRequest = {
  source?: string;
  force?: boolean;
};

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

  const remote = await triggerRemoteStravaSync({
    requestedBy: user.id,
    source,
    force,
  });

  if (!remote.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: remote.message,
        lastSuccessfulSyncAt: status.lastSuccessfulSyncAt,
        remoteChannel: remote.channel,
        remoteStatus: remote.remoteStatus,
        remoteBodyPreview: remote.remoteBodyPreview,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: remote.message,
    remoteChannel: remote.channel,
    lastSuccessfulSyncAt: status.lastSuccessfulSyncAt,
  });
}
