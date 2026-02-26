"use client";

import { useEffect, useState } from "react";

type WellnessSnapshot = {
  sleep: {
    date: string | null;
    totalSleepMin: number | null;
    sleepScore: number | null;
    readinessScore: number | null;
  } | null;
  nutrition: {
    entriesLast24h: number;
    caloriesLast24h: number | null;
    proteinLast24h: number | null;
    carbsLast24h: number | null;
    hydrationLast24h: number | null;
    pendingRecognitionCount: number;
  } | null;
  dailyMetrics: {
    date: string | null;
    steps: number | null;
    hrv: number | null;
    stressAvg: number | null;
    bodyBatteryAvg: number | null;
    trainingReadiness: number | null;
    recoveryHours: number | null;
    vo2Max: number | null;
    restingHr: number | null;
  } | null;
  dataQuality: "none" | "partial" | "good";
  riskFlags: string[];
  insights: string[];
};

export function WellnessInputsPanel() {
  const [snapshot, setSnapshot] = useState<WellnessSnapshot | null>(null);
  const [sleepDate, setSleepDate] = useState(new Date().toISOString().slice(0, 10));
  const [sleepMin, setSleepMin] = useState("420");
  const [sleepScore, setSleepScore] = useState("");
  const [description, setDescription] = useState("");
  const [calories, setCalories] = useState("");
  const [proteinG, setProteinG] = useState("");
  const [carbsG, setCarbsG] = useState("");
  const [hydrationMl, setHydrationMl] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const contextResponse = await fetch("/api/wellness/context");

      const data = (await contextResponse.json()) as WellnessSnapshot & { error?: string };
      if (!contextResponse.ok) throw new Error(data.error ?? "Failed to load wellness context");
      setSnapshot(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load wellness context");
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const postSleep = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/wellness/sleep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sleepDate,
          totalSleepMin: Number(sleepMin || 0),
          sleepScore: sleepScore ? Number(sleepScore) : null,
          source: "manual",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(String(data?.error ?? "Failed to save sleep entry"));
      setMessage("Sleep entry saved.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save sleep entry");
    } finally {
      setSaving(false);
    }
  };

  const postNutrition = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/wellness/nutrition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description || null,
          calories: calories ? Number(calories) : null,
          proteinG: proteinG ? Number(proteinG) : null,
          carbsG: carbsG ? Number(carbsG) : null,
          hydrationMl: hydrationMl ? Number(hydrationMl) : null,
          photoUrl: photoUrl || null,
          source: photoUrl ? "camera" : "manual",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(String(data?.error ?? "Failed to save nutrition entry"));
      setMessage(photoUrl ? "Nutrition entry saved and meal-photo recognition queued." : "Nutrition entry saved.");
      setDescription("");
      setCalories("");
      setProteinG("");
      setCarbsG("");
      setHydrationMl("");
      setPhotoUrl("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save nutrition entry");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {message ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Wellness quality: <strong>{snapshot?.dataQuality ?? "unknown"}</strong>
        </p>
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Risk flags: <strong>{snapshot?.riskFlags.join(", ") || "none"}</strong>
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 p-3">
        <p className="mb-2 text-sm font-medium text-slate-800">Log sleep</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <input
            type="date"
            value={sleepDate}
            onChange={(event) => setSleepDate(event.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={sleepMin}
            onChange={(event) => setSleepMin(event.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="Total sleep (min)"
          />
          <input
            value={sleepScore}
            onChange={(event) => setSleepScore(event.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="Sleep score (optional)"
          />
        </div>
        <button
          type="button"
          onClick={() => void postSleep()}
          disabled={saving}
          className="mt-2 rounded-xl border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          Save sleep
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 p-3">
        <p className="mb-2 text-sm font-medium text-slate-800">Log nutrition / meal photo</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="Meal description"
          />
          <input
            value={photoUrl}
            onChange={(event) => setPhotoUrl(event.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="Meal photo URL (optional)"
          />
          <input
            value={calories}
            onChange={(event) => setCalories(event.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="Calories"
          />
          <input
            value={proteinG}
            onChange={(event) => setProteinG(event.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="Protein (g)"
          />
          <input
            value={carbsG}
            onChange={(event) => setCarbsG(event.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="Carbs (g)"
          />
          <input
            value={hydrationMl}
            onChange={(event) => setHydrationMl(event.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="Hydration (ml)"
          />
        </div>
        <button
          type="button"
          onClick={() => void postNutrition()}
          disabled={saving}
          className="mt-2 rounded-xl border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          Save nutrition
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
        <p className="font-medium text-slate-800">Latest snapshot</p>
        <p>
          Sleep: {snapshot?.sleep?.totalSleepMin ?? "n/a"} min · score {snapshot?.sleep?.sleepScore ?? "n/a"} · readiness {snapshot?.sleep?.readinessScore ?? "n/a"}
        </p>
        <p>
          Nutrition 24h: {snapshot?.nutrition?.entriesLast24h ?? 0} entries · calories {snapshot?.nutrition?.caloriesLast24h ?? "n/a"} · protein {snapshot?.nutrition?.proteinLast24h ?? "n/a"}g
        </p>
        <p>
          Daily metrics: HRV {snapshot?.dailyMetrics?.hrv ?? "n/a"} · stress {snapshot?.dailyMetrics?.stressAvg ?? "n/a"} · body battery {snapshot?.dailyMetrics?.bodyBatteryAvg ?? "n/a"} · readiness {snapshot?.dailyMetrics?.trainingReadiness ?? "n/a"}
        </p>
        <p>Pending meal recognition: {snapshot?.nutrition?.pendingRecognitionCount ?? 0}</p>
      </div>

    </div>
  );
}
