import { NextRequest, NextResponse } from "next/server";
import { buildCockpitPayload } from "@/lib/mobile/cockpit";
import { createAdminClient } from "@/lib/supabase/admin";
import { featureFlags } from "@/lib/feature-flags";

function buildCheckinMessage(payload: Awaited<ReturnType<typeof buildCockpitPayload>>) {
  const focus = payload.quickInsights[0] ?? "Train consistently and keep quality controlled.";
  const workoutHint = payload.todayPlan.workouts.length
    ? `Today's plan has ${payload.todayPlan.workouts.length} workout(s).`
    : "No workout is scheduled today.";

  return (
    `Daily check-in: readiness is ${payload.readiness.score.toFixed(0)} (${payload.readiness.status}). ` +
    `Load ratio is ${payload.readiness.loadRatio.toFixed(2)} and monotony is ${payload.readiness.monotony.toFixed(2)}. ` +
    `${focus} ${workoutHint}`
  );
}

function matchesServiceToken(request: NextRequest, expected: string) {
  const bearer = request.headers.get("authorization");
  if (bearer?.startsWith("Bearer ") && bearer.slice(7) === expected) return true;
  const tokenHeader = request.headers.get("x-job-token");
  return tokenHeader === expected;
}

export async function POST(request: NextRequest) {
  if (!featureFlags.dailyCheckinV1) {
    return NextResponse.json({ error: "Check-in feature is disabled" }, { status: 404 });
  }

  const token = process.env.CHECKIN_JOB_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "CHECKIN_JOB_TOKEN is required to run this service endpoint." },
      { status: 500 },
    );
  }
  if (!matchesServiceToken(request, token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const today = new Date().toISOString().slice(0, 10);

    const userSources = await Promise.all([
      admin.from("athlete_profiles").select("user_id"),
      admin.from("training_plans").select("user_id"),
      admin.from("coach_threads").select("user_id"),
    ]);

    const userIds = new Set<string>();
    for (const source of userSources) {
      (source.data ?? []).forEach((row) => {
        const id = row.user_id ? String(row.user_id) : "";
        if (id) userIds.add(id);
      });
    }

    if (!userIds.size) {
      return NextResponse.json({ ok: true, processed: 0 });
    }

    let processed = 0;
    for (const userId of userIds) {
      const payload = await buildCockpitPayload({ supabase: admin, userId });
      const body = buildCheckinMessage(payload);

      await admin
        .from("coach_checkins")
        .upsert(
          {
            user_id: userId,
            checkin_date: today,
            body,
            readiness_score: payload.readiness.score,
            metadata: {
              loadRatio: payload.readiness.loadRatio,
              monotony: payload.readiness.monotony,
              generatedAt: new Date().toISOString(),
            },
          },
          { onConflict: "user_id,checkin_date" },
        );
      processed += 1;
    }

    return NextResponse.json({ ok: true, processed });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown check-in job error" },
      { status: 500 },
    );
  }
}
