"use client";

import { useMemo } from "react";
import { SectionCard } from "@/components/section-card";
import { PaceIntelligence } from "@/components/analysis/pace-intelligence";
import { FitnessFormTimeline } from "@/components/analysis/fitness-form-timeline";
import { MarathonBlockForensics } from "@/components/analysis/marathon-block-forensics";
import { RecoveryPerformanceLag } from "@/components/analysis/recovery-performance-lag";
import { LoadSweetSpot } from "@/components/analysis/load-sweet-spot";
import { QueryPanel } from "@/components/analysis/query-panel";
import type { DailyMetricRow, SleepRow } from "@/lib/analysis/transforms";
import type { DailyActivityFact, TrainingLoadPoint } from "@/lib/metrics/load";
import {
  type PerformanceActivity,
  computePaceEvolution,
  computeEfficiencySummary,
  computeFitnessForm,
  extractRaceSummaries,
  computeBlockForensics,
  computeLaggedCorrelations,
  computeLoadPaceRelationship,
} from "@/lib/analysis/performance-transforms";

type Props = {
  activities: PerformanceActivity[];
  metrics: DailyMetricRow[];
  sleep: SleepRow[];
  dailyFacts: DailyActivityFact[];
  loadSeries: TrainingLoadPoint[];
  athleteId: number;
};

export function PerformanceDashboard({
  activities,
  metrics,
  sleep,
  dailyFacts,
  loadSeries,
  athleteId,
}: Props) {
  // Section 1: Pace Intelligence
  const paceEvolution = useMemo(
    () => computePaceEvolution(activities),
    [activities],
  );
  const efficiencySummary = useMemo(
    () => computeEfficiencySummary(activities),
    [activities],
  );

  // Section 2: Fitness-Fatigue-Form
  const fitnessForm = useMemo(
    () => computeFitnessForm(loadSeries, activities),
    [loadSeries, activities],
  );
  const raceSummaries = useMemo(
    () => extractRaceSummaries(fitnessForm),
    [fitnessForm],
  );

  // Section 3: Marathon Block Forensics
  const blockForensics = useMemo(
    () => computeBlockForensics(activities, metrics, sleep),
    [activities, metrics, sleep],
  );

  // Section 4: Recovery → Performance Lag
  const lagResults = useMemo(
    () => computeLaggedCorrelations(dailyFacts, metrics, sleep, activities),
    [dailyFacts, metrics, sleep, activities],
  );

  // Section 5: Load Sweet Spot
  const loadPaceModel = useMemo(
    () => computeLoadPaceRelationship(dailyFacts, activities),
    [dailyFacts, activities],
  );
  const currentWeeklyKm = useMemo(() => {
    // Trailing 4-week average
    const recent = dailyFacts.slice(-28);
    const totalKm = recent.reduce((s, f) => s + f.runDistanceKm, 0);
    return totalKm / 4;
  }, [dailyFacts]);

  // Stats
  const runCount = activities.filter((a) => a.type.toLowerCase() === "run").length;
  const dateRange = dailyFacts.length
    ? `${dailyFacts[0].date} to ${dailyFacts[dailyFacts.length - 1].date}`
    : "No data";

  return (
    <div className="space-y-6">
      {/* Header stats */}
      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-medium">
          {runCount.toLocaleString()} runs
        </span>
        <span className="rounded-lg bg-slate-100 px-2.5 py-1">{dateRange}</span>
        <span className="rounded-lg bg-slate-100 px-2.5 py-1">
          {metrics.length.toLocaleString()} wellness days
        </span>
        <span className="rounded-lg bg-slate-100 px-2.5 py-1">
          {sleep.length.toLocaleString()} sleep sessions
        </span>
      </div>

      {/* Section 1: Pace Intelligence */}
      <SectionCard title="Pace Intelligence">
        <p className="mb-4 text-sm text-slate-500">
          Am I getting faster? Is my running efficiency improving (same pace at lower heart rate)?
        </p>
        <PaceIntelligence
          paceEvolution={paceEvolution}
          efficiencySummary={efficiencySummary}
        />
      </SectionCard>

      {/* Section 2: Fitness–Fatigue–Form */}
      <SectionCard title="Fitness–Fatigue–Form">
        <p className="mb-4 text-sm text-slate-500">
          Training fitness (CTL) vs fatigue (ATL). Positive form (TSB) means freshness exceeds fatigue — ideal for racing.
        </p>
        <FitnessFormTimeline
          data={fitnessForm}
          raceSummaries={raceSummaries}
        />
      </SectionCard>

      {/* Section 3: Marathon Block Forensics */}
      {blockForensics.length > 0 && (
        <SectionCard title="Marathon Block Forensics">
          <p className="mb-4 text-sm text-slate-500">
            What training patterns preceded the best races? Comparing 12-week preparation blocks.
          </p>
          <MarathonBlockForensics blocks={blockForensics} />
        </SectionCard>
      )}

      {/* Section 4: Recovery → Performance Lag */}
      <SectionCard title="Recovery → Performance">
        <p className="mb-4 text-sm text-slate-500">
          Does last night&apos;s sleep predict tomorrow&apos;s run quality? Which recovery metric matters most, and at what lag?
        </p>
        <RecoveryPerformanceLag results={lagResults} />
      </SectionCard>

      {/* Section 5: Load Sweet Spot */}
      <SectionCard title="Load Sweet Spot">
        <p className="mb-4 text-sm text-slate-500">
          What weekly training volume produces the best subsequent pace? Explore the volume–performance relationship.
        </p>
        <LoadSweetSpot
          model={loadPaceModel}
          currentWeeklyKm={currentWeeklyKm}
        />
      </SectionCard>

      {/* NL Query Panel (retained) */}
      <QueryPanel athleteId={athleteId} />
    </div>
  );
}
