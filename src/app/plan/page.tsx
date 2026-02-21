"use client";

import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { KpiCard } from "@/components/kpi-card";
import { Save, RotateCcw, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type WorkoutType = "Easy" | "Intervals" | "Tempo" | "Long" | "Rest";
type PlanStatus = "Planned" | "Done" | "Skipped";

interface PlanRow {
  day: string;
  workoutType: WorkoutType;
  details: string;
  plannedDistance: string;
  plannedDuration: string;
  status: PlanStatus;
}

const statusStyles: Record<PlanStatus, string> = {
  Planned: "bg-accent-muted text-accent",
  Done: "bg-success-muted text-success",
  Skipped: "bg-muted text-muted-foreground",
};

const workoutTypeStyles: Record<WorkoutType, string> = {
  Easy: "bg-success-muted text-success",
  Intervals: "bg-destructive-muted text-destructive",
  Tempo: "bg-warning-muted text-warning",
  Long: "bg-accent-muted text-accent",
  Rest: "bg-muted text-muted-foreground",
};

const defaultPlan: PlanRow[] = [
  { day: "Monday", workoutType: "Easy", details: "Recovery jog", plannedDistance: "8 km", plannedDuration: "45 min", status: "Done" },
  { day: "Tuesday", workoutType: "Intervals", details: "6x1 km @ 4:10/km", plannedDistance: "12 km", plannedDuration: "55 min", status: "Done" },
  { day: "Wednesday", workoutType: "Easy", details: "Easy aerobic", plannedDistance: "10 km", plannedDuration: "55 min", status: "Done" },
  { day: "Thursday", workoutType: "Tempo", details: "4 km tempo @ 4:30/km", plannedDistance: "14 km", plannedDuration: "65 min", status: "Planned" },
  { day: "Friday", workoutType: "Rest", details: "Full rest", plannedDistance: "--", plannedDuration: "--", status: "Planned" },
  { day: "Saturday", workoutType: "Easy", details: "Shakeout run", plannedDistance: "6 km", plannedDuration: "30 min", status: "Planned" },
  { day: "Sunday", workoutType: "Long", details: "Long run w/ marathon pace", plannedDistance: "28 km", plannedDuration: "2h 20m", status: "Planned" },
];

export default function PlanPage() {
  const [objective, setObjective] = useState({
    goalRace: "Dublin Marathon 2026",
    goalDate: "2026-10-26",
    goalFinishTime: "03:15:00",
    goalWeeklyVolume: "80",
    notes: "",
  });

  const [plan] = useState<PlanRow[]>(defaultPlan);

  const totalPlannedKm = plan
    .filter((r) => r.plannedDistance !== "--")
    .reduce((sum, r) => sum + parseFloat(r.plannedDistance), 0);
  const keySessionCount = plan.filter(
    (r) => r.workoutType !== "Easy" && r.workoutType !== "Rest"
  ).length;
  const longRunDistance = plan.find((r) => r.workoutType === "Long")?.plannedDistance ?? "--";

  return (
    <AppShell>
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Training Plan & Objectives
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Capture your race objective and weekly workout structure.
        </p>
      </div>

      {/* Objective form */}
      <SectionCard title="Race Objective">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Goal Race
            </label>
            <input
              type="text"
              value={objective.goalRace}
              onChange={(e) =>
                setObjective({ ...objective, goalRace: e.target.value })
              }
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
              placeholder="e.g. Dublin Marathon"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Goal Race Date
            </label>
            <input
              type="date"
              value={objective.goalDate}
              onChange={(e) =>
                setObjective({ ...objective, goalDate: e.target.value })
              }
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Goal Finish Time
            </label>
            <input
              type="text"
              value={objective.goalFinishTime}
              onChange={(e) =>
                setObjective({ ...objective, goalFinishTime: e.target.value })
              }
              placeholder="hh:mm:ss"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Goal Weekly Volume (km)
            </label>
            <input
              type="number"
              value={objective.goalWeeklyVolume}
              onChange={(e) =>
                setObjective({
                  ...objective,
                  goalWeeklyVolume: e.target.value,
                })
              }
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">
              Notes (optional)
            </label>
            <textarea
              value={objective.notes}
              onChange={(e) =>
                setObjective({ ...objective, notes: e.target.value })
              }
              rows={2}
              placeholder="Any additional notes about your plan..."
              className="resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
          </div>
        </div>
        <div className="mt-4 flex gap-3">
          <button className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">
            <Save className="h-4 w-4" />
            Save Objective
          </button>
          <button className="inline-flex items-center gap-2 rounded-lg bg-muted px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-border transition-colors">
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
        </div>
      </SectionCard>

      {/* Summary strip */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Total Planned Weekly"
          value={`${totalPlannedKm} km`}
          status="neutral"
        />
        <KpiCard
          label="Key Sessions"
          value={`${keySessionCount}`}
          sub="Intervals + Tempo + Long"
          status="neutral"
        />
        <KpiCard
          label="Long Run"
          value={longRunDistance}
          status="neutral"
        />
      </div>

      {/* Weekly plan table */}
      <SectionCard title="Weekly Plan">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-3 font-medium">Day</th>
                <th className="px-3 py-3 font-medium">Type</th>
                <th className="px-3 py-3 font-medium">Details</th>
                <th className="px-3 py-3 font-medium text-right">Distance</th>
                <th className="px-3 py-3 font-medium text-right">Duration</th>
                <th className="px-3 py-3 font-medium text-center">Status</th>
                <th className="px-3 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {plan.map((row) => (
                <tr
                  key={row.day}
                  className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
                >
                  <td className="px-3 py-3 font-medium text-foreground">
                    {row.day}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                        workoutTypeStyles[row.workoutType]
                      )}
                    >
                      {row.workoutType}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {row.details}
                  </td>
                  <td className="px-3 py-3 text-right text-foreground">
                    {row.plannedDistance}
                  </td>
                  <td className="px-3 py-3 text-right text-muted-foreground">
                    {row.plannedDuration}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                        statusStyles[row.status]
                      )}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        aria-label={`Edit ${row.day}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive-muted hover:text-destructive transition-colors"
                        aria-label={`Delete ${row.day}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </AppShell>
  );
}
