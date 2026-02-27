import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { featureFlags } from "@/lib/feature-flags";
import {
  isValidDateKey,
  MORNING_CAPTURE_FIELDS,
  MORNING_CAPTURE_FLOW_VERSION,
  type MorningMetricKey,
  type MorningMetrics,
  normalizeMetricValue,
  validateMorningMetricValue,
} from "@/lib/wellness/morning-capture";

type MorningReportPayload = {
  reportDate?: unknown;
  metrics?: Record<string, unknown> | null;
  source?: unknown;
  captureMeta?: {
    flowVersion?: unknown;
    skippedFields?: unknown;
    method?: unknown;
  } | null;
};

const METHOD_CONFIDENCE: Record<"voice" | "typed" | "mixed", number> = {
  voice: 0.9,
  mixed: 0.85,
  typed: 0.8,
};

function toMetricValue(key: MorningMetricKey, raw: unknown) {
  if (raw == null) return { value: null };
  if (typeof raw !== "number" && typeof raw !== "string") {
    return { error: `${key} must be numeric or null.` as string };
  }
  const parsed = typeof raw === "number" ? raw : Number(raw.trim());
  if (!Number.isFinite(parsed)) {
    return { error: `${key} is not a valid number.` as string };
  }
  const normalized = normalizeMetricValue(key, parsed);
  const validationError = validateMorningMetricValue(key, normalized);
  if (validationError) return { error: validationError };
  return { value: normalized };
}

export async function POST(request: NextRequest) {
  if (!featureFlags.wellnessMorningVoiceV1) {
    return NextResponse.json({ error: "Morning voice capture is disabled" }, { status: 404 });
  }
  if (!featureFlags.wellnessSleepV1) {
    return NextResponse.json({ error: "Sleep feature is disabled" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as MorningReportPayload;
  const reportDate = typeof body.reportDate === "string" ? body.reportDate.trim() : "";
  if (!isValidDateKey(reportDate)) {
    return NextResponse.json({ error: "reportDate must be YYYY-MM-DD" }, { status: 400 });
  }

  if (body.source !== "manual_voice") {
    return NextResponse.json({ error: "source must be manual_voice" }, { status: 400 });
  }

  const inputMetrics = body.metrics && typeof body.metrics === "object" ? body.metrics : {};
  const metrics: MorningMetrics = {
    sleepDurationMin: null,
    sleepScore: null,
    readiness: null,
    hrv: null,
    restingHr: null,
    steps: null,
    recoveryHours: null,
  };

  for (const field of MORNING_CAPTURE_FIELDS) {
    const candidate = toMetricValue(field.key, inputMetrics[field.key]);
    if ("error" in candidate) {
      return NextResponse.json({ error: candidate.error, field: field.key }, { status: 400 });
    }
    metrics[field.key] = candidate.value ?? null;
  }

  const methodRaw = body.captureMeta?.method;
  const method: "voice" | "typed" | "mixed" =
    methodRaw === "voice" || methodRaw === "typed" || methodRaw === "mixed" ? methodRaw : "mixed";

  const skippedFields = MORNING_CAPTURE_FIELDS.filter((field) => metrics[field.key] == null).map((field) => field.key);
  const savedFields = MORNING_CAPTURE_FIELDS.filter((field) => metrics[field.key] != null).map((field) => field.key);
  const now = new Date().toISOString();

  const commonRawData = {
    capture_method: "voice_morning_v1",
    flow_version: MORNING_CAPTURE_FLOW_VERSION,
    captured_at: now,
    capture_meta: {
      ...body.captureMeta,
      flowVersion: MORNING_CAPTURE_FLOW_VERSION,
      skippedFields,
      method,
    },
  };

  const sleepUpsert = await supabase
    .from("wellness_sleep_sessions")
    .upsert(
      {
        user_id: user.id,
        sleep_date: reportDate,
        total_sleep_min: metrics.sleepDurationMin,
        sleep_score: metrics.sleepScore,
        readiness_score: metrics.readiness,
        hrv: metrics.hrv,
        resting_hr: metrics.restingHr,
        source: "manual",
        confidence: METHOD_CONFIDENCE[method],
        raw_data: {
          ...commonRawData,
          metrics: {
            sleepDurationMin: metrics.sleepDurationMin,
            sleepScore: metrics.sleepScore,
            readiness: metrics.readiness,
            hrv: metrics.hrv,
            restingHr: metrics.restingHr,
          },
        },
      },
      { onConflict: "user_id,sleep_date,source" },
    );
  if (sleepUpsert.error) {
    return NextResponse.json({ error: sleepUpsert.error.message }, { status: 500 });
  }

  const dailyUpsert = await supabase
    .from("wellness_daily_metrics")
    .upsert(
      {
        user_id: user.id,
        metric_date: reportDate,
        source: "manual_voice",
        confidence: METHOD_CONFIDENCE[method],
        training_readiness: metrics.readiness,
        hrv: metrics.hrv,
        resting_hr: metrics.restingHr,
        steps: metrics.steps,
        recovery_hours: metrics.recoveryHours,
        raw_data: {
          ...commonRawData,
          metrics: {
            readiness: metrics.readiness,
            hrv: metrics.hrv,
            restingHr: metrics.restingHr,
            steps: metrics.steps,
            recoveryHours: metrics.recoveryHours,
          },
        },
      },
      { onConflict: "user_id,metric_date,source" },
    );
  if (dailyUpsert.error) {
    return NextResponse.json({ error: dailyUpsert.error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    savedAt: now,
    savedFields,
    skippedFields,
  });
}
