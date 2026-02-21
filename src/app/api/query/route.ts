import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type QueryResult = { summary: string; rows?: unknown[] };

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json().catch(() => ({}));
  const query = String(body?.query ?? "").trim().toLowerCase();

  if (!query) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  const now = new Date();

  // Whitelisted template 1: last 14 days distance + run count
  if (query.includes("last 14") || query.includes("14 days")) {
    const from = new Date(now);
    from.setDate(now.getDate() - 14);

    const { data, error } = await supabase
      .from("strava_activities")
      .select("distance_m")
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
        "I can currently answer: 'this week mileage' and 'last 14 days distance'. Ask one of those and I’ll return live data.",
    } satisfies QueryResult,
    { status: 200 },
  );
}
