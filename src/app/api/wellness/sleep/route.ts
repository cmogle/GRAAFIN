import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { featureFlags } from "@/lib/feature-flags";

function toNumber(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

export async function POST(request: NextRequest) {
  if (!featureFlags.wellnessSleepV1) {
    return NextResponse.json({ error: "Sleep feature is disabled" }, { status: 404 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const sleepDate = typeof body.sleepDate === "string" ? body.sleepDate.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sleepDate)) {
    return NextResponse.json({ error: "sleepDate must be YYYY-MM-DD" }, { status: 400 });
  }

  const payload = {
    user_id: user.id,
    sleep_date: sleepDate,
    total_sleep_min: toNumber(body.totalSleepMin),
    rem_sleep_min: toNumber(body.remSleepMin),
    deep_sleep_min: toNumber(body.deepSleepMin),
    resting_hr: toNumber(body.restingHr),
    hrv: toNumber(body.hrv),
    sleep_score: toNumber(body.sleepScore),
    readiness_score: toNumber(body.readinessScore),
    source: typeof body.source === "string" ? body.source : "manual",
    confidence: toNumber(body.confidence) ?? 0.75,
    raw_data: body.rawData && typeof body.rawData === "object" ? body.rawData : {},
  };

  const { data, error } = await supabase
    .from("wellness_sleep_sessions")
    .upsert(payload, { onConflict: "user_id,sleep_date,source" })
    .select("id,sleep_date,total_sleep_min,sleep_score,readiness_score,created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
