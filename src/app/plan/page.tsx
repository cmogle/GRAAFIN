import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { createClient } from "@/lib/supabase/server";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; // 0-6

function toSingle(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}

function valueOrEmpty(raw: FormDataEntryValue | null): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function normalizeUuid(raw: string | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  return v;
}

function parseNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function parseWorkoutId(raw: string | undefined): string | undefined {
  return normalizeUuid(raw) ?? undefined;
}

function parseTimeToSeconds(raw: string | undefined): number | null {
  if (!raw) return null;

  if (/^\d+$/.test(raw)) {
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
  }

  const parts = raw.split(":").map((part) => part.trim());
  if (parts.length === 0 || parts.length > 3) return null;

  const numbers = parts.map((part) => Number(part));
  if (numbers.some((n) => Number.isNaN(n) || n < 0)) return null;

  if (parts.length === 2) {
    const [minutes, seconds] = numbers;
    if (seconds > 59) return null;
    return minutes * 60 + seconds;
  }

  const [hours, minutes, seconds] = numbers;
  if (minutes > 59 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

function secondsToDisplay(totalSeconds: number | null): string {
  if (!totalSeconds || totalSeconds <= 0) return "";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours > 0) {
    return `${hours}:${String(remainingMinutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(remainingMinutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function mapWorkout(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? ""),
    planId: String(row.plan_id ?? ""),
    dayOfWeek: Number(row.day_of_week ?? 0),
    workoutOrder: Number(row.workout_order ?? 0),
    name: String(row.workout_name ?? ""),
    distanceKm: row.workout_distance_km == null ? null : Number(row.workout_distance_km),
    durationMin: row.workout_duration_min == null ? null : Number(row.workout_duration_min),
    status: String(row.workout_status ?? "Planned"),
    type: row.workout_type == null ? null : String(row.workout_type),
    intensity: row.workout_intensity == null ? null : String(row.workout_intensity),
    notes: row.workout_notes == null ? null : String(row.workout_notes),
  };
}

function mapObjective(row: Record<string, unknown> | null) {
  if (!row) return null;
  return {
    id: String(row.id ?? ""),
    goalRaceName: String(row.goal_race_name ?? ""),
    goalRaceDate: row.goal_race_date == null ? "" : String(row.goal_race_date),
    targetFinishSeconds: row.target_finish_seconds == null ? null : Number(row.target_finish_seconds),
    targetWeeklyVolumeKm: row.target_weekly_volume_km == null ? null : Number(row.target_weekly_volume_km),
    notes: row.notes == null ? null : String(row.notes),
  };
}

function mapPlan(row: Record<string, unknown> | null) {
  if (!row) return null;
  return {
    id: String(row.id ?? ""),
    objectiveId: row.objective_id == null ? null : String(row.objective_id),
    planName: String(row.plan_name ?? ""),
    planWeekStart: row.plan_week_start == null ? "" : String(row.plan_week_start),
    notes: row.notes == null ? null : String(row.notes),
  };
}

export async function saveObjectiveAction(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const objectiveId = parseWorkoutId(valueOrEmpty(formData.get("objectiveId")));
  const goalRaceName = valueOrEmpty(formData.get("goalRaceName"));

  if (!goalRaceName) {
    redirect("/plan?error=" + encodeURIComponent("Objective name is required."));
  }

  const goalRaceDateRaw = valueOrEmpty(formData.get("goalRaceDate"));
  const targetFinishSecondsRaw = valueOrEmpty(formData.get("targetFinishTime"));
  const targetWeeklyVolumeRaw = valueOrEmpty(formData.get("targetWeeklyVolumeKm"));
  const objectiveNotes = valueOrEmpty(formData.get("objectiveNotes"));

  const targetFinishSeconds = parseTimeToSeconds(targetFinishSecondsRaw);
  if (targetFinishSecondsRaw && targetFinishSeconds === null) {
    redirect("/plan?error=" + encodeURIComponent("Target finish time must be ss, mm:ss, or hh:mm:ss."));
  }

  const targetWeeklyVolume = parseNumber(targetWeeklyVolumeRaw);
  if (targetWeeklyVolumeRaw && targetWeeklyVolume === null) {
    redirect("/plan?error=" + encodeURIComponent("Target weekly volume must be a valid number."));
  }

  if (objectiveId) {
    const { data, error } = await supabase
      .from("training_objectives")
      .update({
        goal_race_name: goalRaceName,
        goal_race_date: goalRaceDateRaw || null,
        target_finish_seconds: targetFinishSeconds,
        target_weekly_volume_km: targetWeeklyVolume,
        notes: objectiveNotes || null,
      })
      .eq("id", objectiveId)
      .eq("user_id", user.id)
      .select("id");

    if (error) {
      redirect(`/plan?error=${encodeURIComponent("Failed to update objective: " + error.message)}`);
    }

    if (!data || data.length === 0) {
      redirect("/plan?error=" + encodeURIComponent("Objective no longer exists."));
    }
  } else {
    const { error } = await supabase.from("training_objectives").insert({
      user_id: user.id,
      goal_race_name: goalRaceName,
      goal_race_date: goalRaceDateRaw || null,
      target_finish_seconds: targetFinishSeconds,
      target_weekly_volume_km: targetWeeklyVolume,
      notes: objectiveNotes || null,
      is_active: true,
    });

    if (error) {
      redirect(`/plan?error=${encodeURIComponent("Failed to create objective: " + error.message)}`);
    }
  }

  revalidatePath("/plan");
  redirect("/plan?success=" + encodeURIComponent("Objective saved."));
}

export async function savePlanAction(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const planId = parseWorkoutId(valueOrEmpty(formData.get("planId")));
  const objectiveId = parseWorkoutId(valueOrEmpty(formData.get("objectiveId")));
  const planName = valueOrEmpty(formData.get("planName"));

  if (!planName) {
    redirect("/plan?error=" + encodeURIComponent("Plan name is required."));
  }

  const planWeekStart = valueOrEmpty(formData.get("planWeekStart"));
  const planNotes = valueOrEmpty(formData.get("planNotes"));

  let activePlanId = planId;

  if (planId) {
    const { data, error } = await supabase
      .from("training_plans")
      .update({
        objective_id: objectiveId,
        plan_name: planName,
        plan_week_start: planWeekStart || null,
        notes: planNotes || null,
        is_active: true,
      })
      .eq("id", planId)
      .eq("user_id", user.id)
      .select("id");

    if (error) {
      redirect(`/plan?error=${encodeURIComponent("Failed to update plan: " + error.message)}`);
    }

    if (!data || data.length === 0) {
      redirect("/plan?error=" + encodeURIComponent("Plan no longer exists."));
    }
  } else {
    const { data: insertedPlan, error } = await supabase
      .from("training_plans")
      .insert({
        user_id: user.id,
        objective_id: objectiveId,
        plan_name: planName,
        plan_week_start: planWeekStart || null,
        notes: planNotes || null,
        is_active: false,
      })
      .select("id")
      .single();

    if (error) {
      redirect(`/plan?error=${encodeURIComponent("Failed to create plan: " + error.message)}`);
    }

    activePlanId = insertedPlan?.id ?? null;
    if (!activePlanId) {
      redirect("/plan?error=" + encodeURIComponent("Could not create plan."));
    }

    const activate = await supabase
      .from("training_plans")
      .update({ is_active: true })
      .eq("id", activePlanId)
      .eq("user_id", user.id);

    if (activate.error) {
      redirect(`/plan?error=${encodeURIComponent("Failed to activate plan: " + activate.error.message)}`);
    }
  }

  const { error: clearDefaultError } = await supabase
    .from("training_plans")
    .update({ is_active: false })
    .eq("user_id", user.id)
    .neq("id", activePlanId);

  if (clearDefaultError) {
    redirect(`/plan?error=${encodeURIComponent("Plan saved, but failed to normalize active plan state: " + clearDefaultError.message)}`);
  }

  revalidatePath("/plan");
  redirect("/plan?success=" + encodeURIComponent("Plan saved."));
}

export async function saveWorkoutAction(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const workoutId = parseWorkoutId(valueOrEmpty(formData.get("workoutId")));
  const planId = normalizeUuid(valueOrEmpty(formData.get("planId")));

  if (!planId) {
    redirect("/plan?error=" + encodeURIComponent("Save a plan first before adding workouts."));
  }

  const dayOfWeek = valueOrEmpty(formData.get("dayOfWeek"));
  const workoutName = valueOrEmpty(formData.get("workoutName"));
  const workoutDistanceRaw = valueOrEmpty(formData.get("workoutDistanceKm"));
  const workoutDurationRaw = valueOrEmpty(formData.get("workoutDurationMin"));
  const workoutStatusRaw = valueOrEmpty(formData.get("workoutStatus"));
  const workoutType = valueOrEmpty(formData.get("workoutType"));
  const workoutIntensity = valueOrEmpty(formData.get("workoutIntensity"));
  const workoutNotes = valueOrEmpty(formData.get("workoutNotes"));
  const workoutOrderRaw = valueOrEmpty(formData.get("workoutOrder"));

  if (!workoutName) {
    redirect("/plan?error=" + encodeURIComponent("Workout name is required."));
  }

  const dayOfWeekNumber = Number(dayOfWeek);
  if (!Number.isInteger(dayOfWeekNumber) || dayOfWeekNumber < 0 || dayOfWeekNumber > 6) {
    redirect("/plan?error=" + encodeURIComponent("Day of week is required."));
  }

  const distanceKm = parseNumber(workoutDistanceRaw);
  if (workoutDistanceRaw && distanceKm === null) {
    redirect("/plan?error=" + encodeURIComponent("Distance must be a valid number."));
  }

  const durationMin = parseNumber(workoutDurationRaw);
  if (workoutDurationRaw && (durationMin === null || durationMin <= 0)) {
    redirect("/plan?error=" + encodeURIComponent("Duration must be a positive number."));
  }

  const workoutOrder = parseNumber(workoutOrderRaw);
  if (workoutOrderRaw && (workoutOrder === null || workoutOrder < 0)) {
    redirect("/plan?error=" + encodeURIComponent("Order must be a valid non-negative number."));
  }

  const payload = {
    user_id: user.id,
    plan_id: planId,
    day_of_week: dayOfWeekNumber,
    workout_order: workoutOrder ?? 0,
    workout_name: workoutName,
    workout_distance_km: distanceKm,
    workout_duration_min: durationMin,
    workout_status: (workoutStatusRaw || "Planned").slice(0, 20),
    workout_type: workoutType || null,
    workout_intensity: workoutIntensity || null,
    workout_notes: workoutNotes || null,
  };

  if (workoutId) {
    const { data, error } = await supabase
      .from("training_plan_workouts")
      .update(payload)
      .eq("id", workoutId)
      .eq("user_id", user.id)
      .select("id");

    if (error) {
      redirect(`/plan?error=${encodeURIComponent("Failed to update workout: " + error.message)}`);
    }

    if (!data || data.length === 0) {
      redirect("/plan?error=" + encodeURIComponent("Workout no longer exists."));
    }
  } else {
    const { error } = await supabase.from("training_plan_workouts").insert(payload);

    if (error) {
      redirect(`/plan?error=${encodeURIComponent("Failed to create workout: " + error.message)}`);
    }
  }

  revalidatePath("/plan");
  if (workoutId) {
    redirect("/plan?success=" + encodeURIComponent("Workout saved."));
  }

  redirect("/plan?success=" + encodeURIComponent("Workout added."));
}

export async function deleteWorkoutAction(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const workoutId = parseWorkoutId(valueOrEmpty(formData.get("workoutId")));

  if (!workoutId) {
    redirect("/plan?error=" + encodeURIComponent("Missing workout identifier."));
  }

  const { data: deletedRows, error } = await supabase
    .from("training_plan_workouts")
    .delete()
    .eq("id", workoutId)
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    redirect(`/plan?error=${encodeURIComponent("Failed to delete workout: " + error.message)}`);
  }

  if (!deletedRows || deletedRows.length === 0) {
    redirect("/plan?error=" + encodeURIComponent("Workout no longer exists."));
  }

  revalidatePath("/plan");
  redirect("/plan?success=" + encodeURIComponent("Workout deleted."));
}

export default async function PlanPage({
  searchParams,
}: {
  searchParams?: { error?: string | string[]; success?: string | string[]; editingWorkoutId?: string | string[] };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: objectiveRows } = await supabase
    .from("training_objectives")
    .select("id,goal_race_name,goal_race_date,target_finish_seconds,target_weekly_volume_km,notes")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1);

  const objective = mapObjective((objectiveRows?.[0] as Record<string, unknown> | undefined) ?? null);

  const { data: planRows } = await supabase
    .from("training_plans")
    .select("id,objective_id,plan_name,plan_week_start,notes")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1);

  const plan = mapPlan((planRows?.[0] as Record<string, unknown> | undefined) ?? null);

  const { data: workoutRows } = plan
    ? await supabase
        .from("training_plan_workouts")
        .select(
          "id,plan_id,day_of_week,workout_order,workout_name,workout_distance_km,workout_duration_min,workout_status,workout_type,workout_intensity,workout_notes",
        )
        .eq("plan_id", plan.id)
        .order("day_of_week", { ascending: true })
        .order("workout_order", { ascending: true })
        .order("created_at", { ascending: true })
    : { data: [] };

  const workouts = (workoutRows ?? []).map((row) => mapWorkout(row as Record<string, unknown>));

  const successMessage = toSingle(searchParams?.success);
  const errorMessage = toSingle(searchParams?.error);
  const editingWorkout = workouts.find((workout) => workout.id === toSingle(searchParams?.editingWorkoutId)) ?? null;

  return (
    <AppShell>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Training plan & objectives</h1>
        <p className="mt-1 text-sm text-slate-600">Build a focused plan, then track execution day by day.</p>
      </div>

      {successMessage ? (
        <SectionCard title="Success">
          <p className="text-sm text-emerald-700">{decodeURIComponent(successMessage)}</p>
        </SectionCard>
      ) : null}

      {errorMessage ? (
        <SectionCard title="Action error">
          <p className="text-sm text-rose-700">{decodeURIComponent(errorMessage)}</p>
        </SectionCard>
      ) : null}

      <SectionCard title="Primary objective">
        <form action={saveObjectiveAction} className="grid gap-3">
          <input type="hidden" name="objectiveId" value={objective?.id ?? ""} />
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1 text-sm">
              <span className="text-slate-700">Goal race</span>
              <input
                name="goalRaceName"
                defaultValue={objective?.goalRaceName ?? ""}
                required
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
                placeholder="Goal race (for example Boston Marathon)"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700">Goal race date</span>
              <input
                type="date"
                name="goalRaceDate"
                defaultValue={objective?.goalRaceDate ?? ""}
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700">Target finish time</span>
              <input
                name="targetFinishTime"
                defaultValue={secondsToDisplay(objective?.targetFinishSeconds ?? null)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
                placeholder="hh:mm:ss"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700">Target weekly volume (km)</span>
              <input
                name="targetWeeklyVolumeKm"
                type="number"
                min="0"
                step="0.1"
                defaultValue={objective?.targetWeeklyVolumeKm ?? ""}
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
                placeholder="52"
              />
            </label>
          </div>
          <label className="space-y-1 text-sm">
            <span className="text-slate-700">Objective notes</span>
            <textarea
              name="objectiveNotes"
              defaultValue={objective?.notes ?? ""}
              className="min-h-20 w-full rounded-xl border border-slate-300 px-3 py-2"
              placeholder="Event strategy, terrain notes, and constraints"
            />
          </label>
          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Save objective
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Weekly plan">
        <form action={savePlanAction} className="grid gap-3">
          <input type="hidden" name="planId" value={plan?.id ?? ""} />
          <input type="hidden" name="objectiveId" value={objective?.id ?? ""} />
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="text-slate-700">Plan name</span>
              <input
                name="planName"
                required
                defaultValue={plan?.planName ?? ""}
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
                placeholder="Base phase plan"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700">Week start (optional)</span>
              <input
                type="date"
                name="planWeekStart"
                defaultValue={plan?.planWeekStart ?? ""}
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700">Plan notes</span>
              <input
                name="planNotes"
                defaultValue={plan?.notes ?? ""}
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
                placeholder="Focus: long aerobic build"
              />
            </label>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Save plan
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Workouts">
        {plan ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Selected plan: {plan.planName}</p>

            <form id="plan-workout-form" action={saveWorkoutAction} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3">
              <input type="hidden" name="planId" value={plan.id} />
              <input type="hidden" name="workoutId" value={editingWorkout?.id ?? ""} />
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
                <label className="space-y-1 text-sm">
                  <span className="text-slate-700">Day</span>
                  <select
                    name="dayOfWeek"
                    required
                    defaultValue={editingWorkout ? String(editingWorkout.dayOfWeek) : "0"}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  >
                    {WEEKDAYS.map((label, index) => (
                      <option value={index.toString()} key={label}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-slate-700">Workout</span>
                  <input
                    name="workoutName"
                    required
                    defaultValue={editingWorkout?.name ?? ""}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2"
                    placeholder="Easy run / Intervals / Long run"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-slate-700">Distance (km)</span>
                  <input
                    name="workoutDistanceKm"
                    type="number"
                    min="0"
                    step="0.1"
                    defaultValue={editingWorkout?.distanceKm ?? ""}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2"
                    placeholder="12.5"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-slate-700">Duration (min)</span>
                  <input
                    name="workoutDurationMin"
                    type="number"
                    min="1"
                    defaultValue={editingWorkout?.durationMin ?? ""}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2"
                    placeholder="60"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-slate-700">Status</span>
                  <select
                    name="workoutStatus"
                    defaultValue={editingWorkout?.status ?? "Planned"}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  >
                    <option>Planned</option>
                    <option>Complete</option>
                    <option>Missed</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-slate-700">Order</span>
                  <input
                    name="workoutOrder"
                    type="number"
                    min="0"
                    defaultValue={editingWorkout?.workoutOrder ?? ""}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2"
                    placeholder="0"
                  />
                </label>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="text-slate-700">Intensity</span>
                  <select
                    name="workoutIntensity"
                    defaultValue={editingWorkout?.intensity ?? ""}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  >
                    <option value="">Unknown</option>
                    <option value="easy">Easy</option>
                    <option value="steady">Steady</option>
                    <option value="tempo">Tempo</option>
                    <option value="threshold">Threshold</option>
                    <option value="interval">Interval</option>
                    <option value="long">Long</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-slate-700">Type</span>
                  <input
                    name="workoutType"
                    defaultValue={editingWorkout?.type ?? ""}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2"
                    placeholder="run / cross-train"
                  />
                </label>
              </div>
              <label className="space-y-1 text-sm">
                <span className="text-slate-700">Notes</span>
                <textarea
                  name="workoutNotes"
                  defaultValue={editingWorkout?.notes ?? ""}
                  className="min-h-20 w-full rounded-xl border border-slate-300 px-3 py-2"
                  placeholder="Example: 6 x 1k with 2 min recovery"
                />
              </label>
              <div className="flex items-center justify-end gap-2">
                <a
                  href={editingWorkout ? "/plan" : "/plan"}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Clear
                </a>
                <button
                  type="submit"
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  {editingWorkout ? "Save workout" : "Add workout"}
                </button>
              </div>
            </form>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-slate-500">
                  <tr>
                    <th className="px-2 py-2">Day</th>
                    <th className="px-2 py-2">Workout</th>
                    <th className="px-2 py-2">Distance</th>
                    <th className="px-2 py-2">Duration</th>
                    <th className="px-2 py-2">Intensity</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {workouts.map((workout) => (
                    <tr key={workout.id} className="border-t border-slate-100">
                      <td className="px-2 py-2 text-slate-800">{WEEKDAYS[workout.dayOfWeek]}</td>
                      <td className="px-2 py-2">
                        <p className="font-medium text-slate-800">{workout.name}</p>
                        <p className="text-xs text-slate-500">{workout.notes}</p>
                      </td>
                      <td className="px-2 py-2 text-slate-600">
                        {workout.distanceKm ? `${workout.distanceKm.toFixed(1)} km` : "-"}
                      </td>
                      <td className="px-2 py-2 text-slate-600">{workout.durationMin ? `${workout.durationMin} min` : "-"}</td>
                      <td className="px-2 py-2 text-slate-600">{workout.intensity ?? "-"}</td>
                      <td className="px-2 py-2">
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">{workout.status}</span>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex gap-2">
                          <a
                            href={`/plan?editingWorkoutId=${workout.id}#plan-workout-form`}
                            className="rounded-xl border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                          >
                            Edit
                          </a>
                          <form action={deleteWorkoutAction}>
                            <input type="hidden" name="workoutId" value={workout.id} />
                            <button
                              type="submit"
                              className="rounded-xl border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                            >
                              Delete
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            Create a plan first so workouts can be attached and tracked by day.
          </p>
        )}
      </SectionCard>
    </AppShell>
  );
}
