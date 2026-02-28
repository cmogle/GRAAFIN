"use client";

import { useState, useMemo } from "react";
import { SectionCard } from "@/components/section-card";
import { MetricSelector } from "@/components/analysis/metric-selector";
import { SeasonalHeatmap } from "@/components/analysis/seasonal-heatmap";
import { YearOverlayChart } from "@/components/analysis/year-overlay-chart";
import { TrainingWellnessOverlay } from "@/components/analysis/training-wellness-overlay";
import { RecoveryScatter } from "@/components/analysis/recovery-scatter";
import { CorrelationMatrix } from "@/components/analysis/correlation-matrix";
import { MetricScatter } from "@/components/analysis/metric-scatter";
import { ThresholdCards } from "@/components/analysis/threshold-cards";
import { QueryPanel } from "@/components/analysis/query-panel";
import {
  type DailyMetricRow,
  type SleepRow,
  type MetricKey,
  HEATMAP_METRICS,
  CORRELATION_METRICS,
  METRIC_LABELS,
  toSeasonalHeatmap,
  toYearOverYearSeries,
  toWeeklyTrainingWellness,
  toRecoveryEvents,
  computeCorrelationMatrix,
  computeScatterPair,
  computeThresholdSplit,
  computeMedian,
  findTopCorrelations,
} from "@/lib/analysis/transforms";

type Props = {
  metrics: DailyMetricRow[];
  sleep: SleepRow[];
  loadFacts: { date: string; loadScore: number }[];
  athleteId: number;
};

export function AnalysisDashboard({ metrics, sleep, loadFacts, athleteId }: Props) {
  // Section A state
  const [heatmapMetric, setHeatmapMetric] = useState<MetricKey>("resting_hr");

  // Section C state
  const [selectedPair, setSelectedPair] = useState<{
    fieldA: MetricKey;
    fieldB: MetricKey;
  } | null>(null);

  // Section A computations
  const heatmapCells = useMemo(
    () => toSeasonalHeatmap(metrics, sleep, heatmapMetric),
    [metrics, sleep, heatmapMetric],
  );
  const heatmapYears = useMemo(() => {
    const s = new Set(heatmapCells.map((c) => c.year));
    return [...s].sort();
  }, [heatmapCells]);
  const yearOverlay = useMemo(
    () => toYearOverYearSeries(metrics, sleep, heatmapMetric),
    [metrics, sleep, heatmapMetric],
  );

  // Section B computations
  const weeklyTW = useMemo(
    () => toWeeklyTrainingWellness(loadFacts, metrics, sleep),
    [loadFacts, metrics, sleep],
  );
  const recoveryEvents = useMemo(() => toRecoveryEvents(weeklyTW), [weeklyTW]);

  // Section C computations
  const correlationCells = useMemo(
    () => computeCorrelationMatrix(metrics, sleep, CORRELATION_METRICS),
    [metrics, sleep],
  );
  const topCorrelations = useMemo(
    () => findTopCorrelations(correlationCells),
    [correlationCells],
  );

  const scatterPoints = useMemo(() => {
    if (!selectedPair) return null;
    return computeScatterPair(metrics, sleep, selectedPair.fieldA, selectedPair.fieldB);
  }, [metrics, sleep, selectedPair]);

  const selectedR = useMemo(() => {
    if (!selectedPair) return 0;
    const cell = correlationCells.find(
      (c) => c.fieldA === selectedPair.fieldA && c.fieldB === selectedPair.fieldB,
    );
    return cell?.r ?? 0;
  }, [correlationCells, selectedPair]);

  const selectedN = useMemo(() => {
    if (!selectedPair) return 0;
    const cell = correlationCells.find(
      (c) => c.fieldA === selectedPair.fieldA && c.fieldB === selectedPair.fieldB,
    );
    return cell?.n ?? 0;
  }, [correlationCells, selectedPair]);

  const thresholdSplits = useMemo(() => {
    return topCorrelations.map((tc) => {
      const median = computeMedian(metrics, sleep, tc.fieldA);
      return computeThresholdSplit(metrics, sleep, tc.fieldA, tc.fieldB, median);
    });
  }, [metrics, sleep, topCorrelations]);

  // Summary stats
  const dateRange = metrics.length
    ? `${metrics[0].metric_date} to ${metrics[metrics.length - 1].metric_date}`
    : "No data";
  const totalDays = metrics.length;

  return (
    <div className="space-y-6">
      {/* Header stats */}
      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-medium">
          {totalDays.toLocaleString()} days
        </span>
        <span className="rounded-lg bg-slate-100 px-2.5 py-1">{dateRange}</span>
        <span className="rounded-lg bg-slate-100 px-2.5 py-1">
          {sleep.length.toLocaleString()} sleep sessions
        </span>
      </div>

      {/* Section A: Your Body's Calendar */}
      <SectionCard title="Your Body's Calendar">
        <p className="mb-4 text-sm text-slate-500">
          Seasonal patterns across {heatmapYears.length} years. Each cell is one week,
          colored by the weekly average. Look for recurring patterns by row.
        </p>
        <div className="mb-4">
          <MetricSelector
            value={heatmapMetric}
            onChange={setHeatmapMetric}
            options={HEATMAP_METRICS}
          />
        </div>
        <SeasonalHeatmap
          cells={heatmapCells}
          years={heatmapYears}
          metricKey={heatmapMetric}
        />
        <div className="mt-6">
          <h4 className="mb-2 text-sm font-medium text-slate-700">
            Year-over-year overlay: {METRIC_LABELS[heatmapMetric]}
          </h4>
          <YearOverlayChart
            data={yearOverlay.data}
            years={yearOverlay.years}
            metricLabel={METRIC_LABELS[heatmapMetric]}
          />
        </div>
      </SectionCard>

      {/* Section B: Training Cost */}
      <SectionCard title="Training Cost">
        <p className="mb-4 text-sm text-slate-500">
          How training load impacts your body. Bars show weekly training load,
          lines show how wellness metrics respond. Use the slider to zoom into specific periods.
        </p>
        <TrainingWellnessOverlay data={weeklyTW} />
        <div className="mt-6">
          <h4 className="mb-2 text-sm font-medium text-slate-700">
            Recovery after load spikes
          </h4>
          <RecoveryScatter events={recoveryEvents} />
        </div>
      </SectionCard>

      {/* Section C: Personal Correlations */}
      <SectionCard title="Personal Correlations">
        <p className="mb-4 text-sm text-slate-500">
          How your metrics relate to each other. Teal = move together, rose = move opposite.
          Click any cell to see the scatter plot.
        </p>
        <CorrelationMatrix
          cells={correlationCells}
          fields={CORRELATION_METRICS}
          onSelect={(fieldA, fieldB) => setSelectedPair({ fieldA, fieldB })}
          selected={selectedPair}
        />
        {selectedPair && scatterPoints && (
          <div className="mt-6">
            <h4 className="mb-2 text-sm font-medium text-slate-700">
              {METRIC_LABELS[selectedPair.fieldA]} vs {METRIC_LABELS[selectedPair.fieldB]}
            </h4>
            <MetricScatter
              points={scatterPoints}
              fieldA={selectedPair.fieldA}
              fieldB={selectedPair.fieldB}
              r={selectedR}
              n={selectedN}
            />
          </div>
        )}
        {thresholdSplits.length > 0 && (
          <div className="mt-6">
            <h4 className="mb-3 text-sm font-medium text-slate-700">
              Strongest relationships — threshold analysis
            </h4>
            <ThresholdCards splits={thresholdSplits} />
          </div>
        )}
      </SectionCard>

      {/* Query Panel */}
      <QueryPanel athleteId={athleteId} />
    </div>
  );
}
