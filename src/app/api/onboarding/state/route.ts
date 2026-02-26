import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPrimaryAthleteId } from "@/lib/athlete";

export async function GET() {
  const supabase = await createClient();
  const athleteId = getPrimaryAthleteId();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [{ count: stravaActivities }, { count: activePlans }, { count: coachMessages }] = await Promise.all([
    supabase
      .from("strava_activities")
      .select("id", { count: "exact", head: true })
      .eq("athlete_id", athleteId),
    supabase
      .from("training_plans")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_active", true),
    supabase
      .from("coach_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);

  const stepAuth = true;
  const stepStrava = (stravaActivities ?? 0) > 0;
  const stepPlan = (activePlans ?? 0) > 0;
  const stepCoach = (coachMessages ?? 0) > 0;

  return NextResponse.json({
    steps: [
      { key: "auth", label: "Account connected", done: stepAuth },
      { key: "strava", label: "Strava activity available", done: stepStrava },
      { key: "plan", label: "Training plan created", done: stepPlan },
      { key: "coach", label: "First coach conversation", done: stepCoach },
    ],
    complete: stepAuth && stepStrava && stepPlan && stepCoach,
  });
}
