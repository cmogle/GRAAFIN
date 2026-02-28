import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { featureFlags } from "@/lib/feature-flags";

function matchesServiceToken(request: NextRequest, expected: string) {
  const bearer = request.headers.get("authorization");
  if (bearer?.startsWith("Bearer ") && bearer.slice(7) === expected) return true;
  return request.headers.get("x-job-token") === expected;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : String(entry ?? "").trim()))
    .filter((entry) => entry.length > 0);
}

function weekStartIso(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(+date)) return new Date().toISOString().slice(0, 10);
  const dayIndex = (date.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - dayIndex);
  return monday.toISOString().slice(0, 10);
}

type AggregateBucket = {
  weekStart: string;
  intent: string;
  seasonPhase: string;
  patternKey: string;
  queryCount: number;
  athletes: Set<string>;
  lowConfidenceCount: number;
  unresolvedCount: number;
};

export async function POST(request: NextRequest) {
  if (!featureFlags.coachWorkbenchV1) {
    return NextResponse.json({ error: "Coach workbench is disabled" }, { status: 404 });
  }

  const token = process.env.CHECKIN_JOB_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "CHECKIN_JOB_TOKEN is required." }, { status: 500 });
  }
  if (!matchesServiceToken(request, token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - 56 * 24 * 60 * 60 * 1000).toISOString();

    const eventsResponse = await admin
      .from("coach_query_events")
      .select("id,user_id,season_phase,metadata,created_at")
      .eq("global_eligible", true)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);

    const events = (eventsResponse.data ?? []).map((row) => {
      const record = asRecord(row);
      return {
        id: String(record.id ?? ""),
        userId: String(record.user_id ?? ""),
        seasonPhase: String(record.season_phase ?? "base"),
        metadata: asRecord(record.metadata),
        createdAt: String(record.created_at ?? new Date().toISOString()),
      };
    }).filter((row) => row.id.length > 0 && row.userId.length > 0);

    if (!events.length) {
      const prune = await admin.rpc("prune_coach_query_raw_text");
      return NextResponse.json({ ok: true, patternsUpserted: 0, prunedRows: prune.data ?? 0 });
    }

    const eventIds = events.map((event) => event.id);
    const featuresResponse = await admin
      .from("coach_query_features")
      .select("event_id,intent,topics,confidence")
      .in("event_id", eventIds)
      .limit(5000);

    const featureByEvent = new Map(
      (featuresResponse.data ?? []).map((row) => {
        const record = asRecord(row);
        return [
          String(record.event_id ?? ""),
          {
            intent: String(record.intent ?? "other"),
            topics: normalizeStringArray(record.topics),
            confidence: Number(record.confidence ?? 0.6),
          },
        ] as const;
      }),
    );

    const bucketMap = new Map<string, AggregateBucket>();

    for (const event of events) {
      const feature = featureByEvent.get(event.id);
      if (!feature) continue;

      const unresolvedQuestions = normalizeStringArray(event.metadata.unresolvedQuestions);
      const weekStart = weekStartIso(event.createdAt);
      const patternKey = feature.topics[0] ?? feature.intent;
      const key = `${weekStart}::${feature.intent}::${event.seasonPhase}::${patternKey}`;

      const bucket = bucketMap.get(key) ?? {
        weekStart,
        intent: feature.intent,
        seasonPhase: event.seasonPhase,
        patternKey,
        queryCount: 0,
        athletes: new Set<string>(),
        lowConfidenceCount: 0,
        unresolvedCount: 0,
      };

      bucket.queryCount += 1;
      bucket.athletes.add(event.userId);
      if (feature.confidence < 0.55) bucket.lowConfidenceCount += 1;
      if (unresolvedQuestions.length > 0) bucket.unresolvedCount += 1;
      bucketMap.set(key, bucket);
    }

    const payload = [...bucketMap.values()].map((bucket) => ({
      week_start: bucket.weekStart,
      intent: bucket.intent,
      season_phase: bucket.seasonPhase,
      pattern_key: bucket.patternKey,
      query_count: bucket.queryCount,
      athlete_count: bucket.athletes.size,
      low_confidence_rate: Number((bucket.lowConfidenceCount / Math.max(1, bucket.queryCount)).toFixed(2)),
      unresolved_rate: Number((bucket.unresolvedCount / Math.max(1, bucket.queryCount)).toFixed(2)),
      created_at: new Date().toISOString(),
    }));

    if (payload.length > 0) {
      const upsert = await admin
        .from("coach_global_query_patterns")
        .upsert(payload, { onConflict: "week_start,intent,season_phase,pattern_key" });
      if (upsert.error) {
        return NextResponse.json({ error: upsert.error.message }, { status: 500 });
      }
    }

    const pruneResult = await admin.rpc("prune_coach_query_raw_text");

    return NextResponse.json({
      ok: true,
      patternsUpserted: payload.length,
      processedEvents: events.length,
      prunedRows: Number(pruneResult.data ?? 0),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown coach-learning rollup error" },
      { status: 500 },
    );
  }
}
