"use client";

import { useEffect, useState } from "react";

type NutritionSnapshot = {
  nutrition: {
    entriesLast24h: number;
    caloriesLast24h: number | null;
    proteinLast24h: number | null;
    carbsLast24h: number | null;
    hydrationLast24h: number | null;
    pendingRecognitionCount: number;
  } | null;
  dataQuality: "none" | "partial" | "good";
  riskFlags: string[];
};

export function WellnessInputsPanel() {
  const [snapshot, setSnapshot] = useState<NutritionSnapshot | null>(null);
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
      const data = (await contextResponse.json()) as NutritionSnapshot & { error?: string };
      if (!contextResponse.ok) throw new Error(data.error ?? "Failed to load wellness context");
      setSnapshot(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load wellness context");
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

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

      {snapshot?.nutrition ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <p className="font-medium text-slate-800">Nutrition (last 24h)</p>
          <p>
            {snapshot.nutrition.entriesLast24h} entries · calories {snapshot.nutrition.caloriesLast24h ?? "n/a"} · protein {snapshot.nutrition.proteinLast24h ?? "n/a"}g
          </p>
          {snapshot.nutrition.pendingRecognitionCount > 0 ? (
            <p className="mt-1 text-xs text-slate-500">Pending meal recognition: {snapshot.nutrition.pendingRecognitionCount}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
