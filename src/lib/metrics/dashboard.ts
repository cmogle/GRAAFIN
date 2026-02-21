export type RunActivity = {
  id: string;
  name: string;
  startDate: string;
  distanceM: number;
  movingTimeS: number;
  averageSpeed: number;
  averageHeartrate: number | null;
};

export type RunBucket = "short" | "tempo" | "long" | "marathon";

const MARATHON_DISTANCE_M = 42195;
const ANOMALOUS_MARATHON_DATE = "2025-07";

function toWeekKey(isoDate: string) {
  const d = new Date(isoDate);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export function paceSecPerKm(run: Pick<RunActivity, "distanceM" | "movingTimeS">) {
  if (!run.distanceM || !run.movingTimeS) return 0;
  return run.movingTimeS / (run.distanceM / 1000);
}

export function classifyRunType(run: RunActivity): RunBucket {
  const km = run.distanceM / 1000;
  if (km >= 41.5) return "marathon";
  if (km >= 25) return "long";
  if (km >= 10) return "tempo";
  return "short";
}

export function distanceBandLabel(run: RunActivity) {
  const km = run.distanceM / 1000;
  if (km >= 41.5) return "40-43km (marathon)";
  if (km >= 32) return "32-40km";
  if (km >= 28) return "28-32km";
  if (km >= 24) return "24-28km";
  if (km >= 18) return "18-24km";
  if (km >= 12) return "12-18km";
  if (km >= 8) return "8-12km";
  return "0-8km";
}

export function filterTrueMarathons(runs: RunActivity[]) {
  return runs.filter((run) => {
    if (run.distanceM < MARATHON_DISTANCE_M - 700) return false;
    if (run.startDate.startsWith(ANOMALOUS_MARATHON_DATE)) return false;
    return true;
  });
}

export function weeklyDistanceTrend(runs: RunActivity[], weeks = 8) {
  const map = new Map<string, number>();
  for (const run of runs) {
    const key = toWeekKey(run.startDate);
    map.set(key, (map.get(key) ?? 0) + run.distanceM / 1000);
  }

  const now = new Date();
  const labels: { week: string; distanceKm: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - i * 7);
    const key = toWeekKey(d.toISOString());
    labels.push({ week: key, distanceKm: Number((map.get(key) ?? 0).toFixed(1)) });
  }
  return labels;
}

export function runTypeEvolution(runs: RunActivity[]) {
  const groups = new Map<string, RunActivity[]>();
  for (const run of runs) {
    const band = distanceBandLabel(run);
    const arr = groups.get(band) ?? [];
    arr.push(run);
    groups.set(band, arr);
  }

  return Array.from(groups.entries())
    .filter(([, group]) => group.length >= 2)
    .map(([type, group]) => {
      const sorted = [...group].sort((a, b) => +new Date(a.startDate) - +new Date(b.startDate));
      const latest = sorted[sorted.length - 1];
      const baselinePool = sorted.slice(0, -1);
      const baselinePace = baselinePool.length
        ? baselinePool.reduce((sum, r) => sum + paceSecPerKm(r), 0) / baselinePool.length
        : paceSecPerKm(latest);
      const latestPace = paceSecPerKm(latest);

      const hrBaselinePool = baselinePool.filter((r) => r.averageHeartrate != null);
      const baselineHr = hrBaselinePool.length
        ? hrBaselinePool.reduce((sum, r) => sum + (r.averageHeartrate ?? 0), 0) / hrBaselinePool.length
        : latest.averageHeartrate ?? 0;

      return {
        type,
        runCount: sorted.length,
        latestDate: latest.startDate,
        latestDistanceKm: Number((latest.distanceM / 1000).toFixed(1)),
        latestPaceSecPerKm: Math.round(latestPace),
        baselinePaceSecPerKm: Math.round(baselinePace),
        paceDeltaPct: baselinePace > 0 ? Number((((baselinePace - latestPace) / baselinePace) * 100).toFixed(1)) : 0,
        latestHr: latest.averageHeartrate,
        baselineHr: baselineHr ? Number(baselineHr.toFixed(1)) : null,
      };
    })
    .sort((a, b) => b.runCount - a.runCount)
    .slice(0, 6);
}

export function marathonBlockPatterns(runs: RunActivity[]) {
  const marathons = filterTrueMarathons(runs).sort((a, b) => +new Date(a.startDate) - +new Date(b.startDate));

  return marathons.map((race, idx) => {
    const raceTime = +new Date(race.startDate);
    const startWindow = raceTime - 12 * 7 * 24 * 60 * 60 * 1000;
    const blockRuns = runs.filter((r) => {
      const t = +new Date(r.startDate);
      return t >= startWindow && t < raceTime;
    });

    const weeklyKm = blockRuns.reduce((sum, r) => sum + r.distanceM, 0) / 1000 / 12;
    const longRunCount = blockRuns.filter((r) => r.distanceM / 1000 >= 25).length;

    return {
      blockId: `block-${idx + 1}`,
      raceId: race.id,
      raceName: race.name,
      raceDate: race.startDate,
      racePaceSecPerKm: Math.round(paceSecPerKm(race)),
      raceHr: race.averageHeartrate,
      blockRunCount: blockRuns.length,
      avgWeeklyKm: Number(weeklyKm.toFixed(1)),
      longRunCount,
      blockRuns: blockRuns
        .sort((a, b) => +new Date(a.startDate) - +new Date(b.startDate))
        .map((r) => ({ date: r.startDate.slice(0, 10), distanceKm: Number((r.distanceM / 1000).toFixed(1)), paceSecPerKm: Math.round(paceSecPerKm(r)) })),
    };
  });
}

export function compareRunVsCategory(run: RunActivity, allRuns: RunActivity[]) {
  const band = distanceBandLabel(run);
  const peers = allRuns.filter((r) => r.id !== run.id && distanceBandLabel(r) === band);

  const runPace = paceSecPerKm(run);
  const paceBaseline = peers.length ? peers.reduce((s, r) => s + paceSecPerKm(r), 0) / peers.length : runPace;

  const hrPeers = peers.filter((r) => r.averageHeartrate != null);
  const hrBaseline = hrPeers.length
    ? hrPeers.reduce((s, r) => s + (r.averageHeartrate ?? 0), 0) / hrPeers.length
    : (run.averageHeartrate ?? 0);

  return {
    type: band,
    peerCount: peers.length,
    runPace,
    paceBaseline,
    paceDeltaPct: paceBaseline > 0 ? Number((((paceBaseline - runPace) / paceBaseline) * 100).toFixed(1)) : 0,
    runHr: run.averageHeartrate,
    hrBaseline: hrBaseline || null,
    hrDelta: run.averageHeartrate != null && hrBaseline ? Number((run.averageHeartrate - hrBaseline).toFixed(1)) : null,
  };
}

export function formatPace(secondsPerKm: number) {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return "--";
  const min = Math.floor(secondsPerKm / 60);
  const sec = Math.round(secondsPerKm % 60)
    .toString()
    .padStart(2, "0");
  return `${min}:${sec}/km`;
}
