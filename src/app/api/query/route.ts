import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { marathonBlockPatterns, RunActivity } from "@/lib/metrics/dashboard";
import { getCachedRunComparison } from "@/lib/metrics/cache";
import { getPrimaryAthleteId } from "@/lib/athlete";

type QueryResult = { summary: string; rows?: unknown[]; chartData?: unknown[] };

function toRun(row: Record<string, unknown>): RunActivity {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? "Run"),
    startDate: String(row.start_date ?? new Date().toISOString()),
    distanceM: Number(row.distance_m ?? 0),
    movingTimeS: Number(row.moving_time_s ?? 0),
    averageSpeed: Number(row.average_speed ?? 0),
    averageHeartrate: row.average_heartrate ? Number(row.average_heartrate) : null,
  };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const athleteId = getPrimaryAthleteId();
  const body = await request.json().catch(() => ({}));
  const query = String(body?.query ?? "").trim().toLowerCase();
  const runId = typeof body?.runId === "string" ? body.runId : null;

  if (!query && !runId) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  const now = new Date();

  if (runId) {
    const { data, error } = await supabase
      .from("strava_activities")
      .select("id,name,type,start_date,distance_m,moving_time_s,average_speed,average_heartrate")
      .eq("athlete_id", athleteId)
      .eq("type", "Run")
      .order("start_date", { ascending: false })
      .limit(400);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const runs = (data ?? []).map((r) => toRun(r as Record<string, unknown>));
    const run = runs.find((r) => r.id === runId);
    if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

    const comp = await getCachedRunComparison(supabase, run, runs);
    return NextResponse.json({
      summary: `${run.name}: ${comp.paceDeltaPct >= 0 ? "faster" : "slower"} than ${comp.peerCount} similar ${comp.type} runs (${comp.paceDeltaPct.toFixed(1)}% vs baseline).`,
      rows: [comp],
    } satisfies QueryResult);
  }

  if (query.includes("marathon block") || query.includes("marathon pattern")) {
    const { data, error } = await supabase
      .from("strava_activities")
      .select("id,name,type,start_date,distance_m,moving_time_s,average_speed,average_heartrate")
      .eq("athlete_id", athleteId)
      .eq("type", "Run")
      .order("start_date", { ascending: false })
      .limit(800);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const runs = (data ?? []).map((r) => toRun(r as Record<string, unknown>));
    const blocks = marathonBlockPatterns(runs);

    return NextResponse.json({
      summary: `Found ${blocks.length} true marathon race blocks. July 2025 anomalous marathon-distance run excluded by rule.`,
      rows: blocks,
      chartData: blocks.map((b) => ({ raceDate: b.raceDate.slice(0, 10), avgWeeklyKm: b.avgWeeklyKm, racePaceSecPerKm: b.racePaceSecPerKm })),
    } satisfies QueryResult);
  }

  // Whitelisted template 1: last 14 days distance + run count
  if (query.includes("last 14") || query.includes("14 days")) {
    const from = new Date(now);
    from.setDate(now.getDate() - 14);

    const { data, error } = await supabase
      .from("strava_activities")
      .select("distance_m")
      .eq("athlete_id", athleteId)
      .eq("type", "Run")
      .gte("start_date", from.toISOString());

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = data ?? [];
    const totalKm = rows.reduce((sum, r) => sum + ((r.distance_m as number) || 0), 0) / 1000;
    const result: QueryResult = {
      summary: `Last 14 days: ${rows.length} runs, ${totalKm.toFixed(1)} km total.`,
      rows: rows.slice(0, 50),
    };
    return NextResponse.json(result);
  }

  // Whitelisted template 2: this week mileage
  if (query.includes("this week") || query.includes("on track")) {
    const startOfWeek = new Date(now);
    const day = startOfWeek.getDay();
    const diff = (day + 6) % 7;
    startOfWeek.setDate(startOfWeek.getDate() - diff);
    startOfWeek.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from("strava_activities")
      .select("distance_m")
      .eq("athlete_id", athleteId)
      .eq("type", "Run")
      .gte("start_date", startOfWeek.toISOString());

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows = data ?? [];
    const totalKm = rows.reduce((sum, r) => sum + ((r.distance_m as number) || 0), 0) / 1000;

    return NextResponse.json({
      summary: `This week so far: ${rows.length} runs, ${totalKm.toFixed(1)} km.`,
      rows: rows.slice(0, 50),
    } satisfies QueryResult);
  }

  return NextResponse.json(
    {
      summary:
        "I can answer: this week mileage, last 14 days distance, marathon block patterns, and run-specific category comparison (via runId).",
    } satisfies QueryResult,
    { status: 200 },
  );
}
