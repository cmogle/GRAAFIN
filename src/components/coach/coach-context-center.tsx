"use client";

import { useEffect, useState } from "react";

type CoachState = {
  availabilityState: "normal" | "injury_adaptation" | "medical_hold" | "return_build";
  runningAllowed: boolean;
  expectedReturnDate: string | null;
  confidence: number;
};

type ContextPayload = {
  objective?: { goalRaceName?: string; goalRaceDate?: string | null } | null;
  coachState?: CoachState | null;
  activeBlock?: { weekIndex?: number | null; raceName?: string; raceDate?: string } | null;
};

export function CoachContextCenter() {
  const [context, setContext] = useState<ContextPayload | null>(null);
  const [expectedReturnDate, setExpectedReturnDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/coach/context");
      const data = (await response.json()) as ContextPayload & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Failed to load coach context");
      setContext(data);
      setExpectedReturnDate(data.coachState?.expectedReturnDate ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load coach context");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async (payload: {
    availabilityState?: CoachState["availabilityState"];
    runningAllowed?: boolean;
    note: string;
    expectedReturnDate?: string | null;
  }) => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/coach/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          expectedReturnDate: payload.expectedReturnDate,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(String(data?.error ?? "Failed to save context"));
      setContext((prev) => ({
        ...prev,
        coachState: data.coachState ?? prev?.coachState ?? null,
      }));
      setMessage("Coach context updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save context");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Loading coach context...</p>;
  }

  return (
    <div className="space-y-3">
      {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {message ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Goal race: <strong>{context?.objective?.goalRaceName ?? "Boston Marathon"}</strong>
        </p>
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Race date: <strong>{context?.objective?.goalRaceDate ?? "2026-04-20"}</strong>
        </p>
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Availability: <strong>{context?.coachState?.availabilityState ?? "normal"}</strong>
        </p>
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Block week: <strong>{context?.activeBlock?.weekIndex ?? "n/a"}</strong>
        </p>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="text-slate-700">Expected return date (optional)</span>
        <input
          type="date"
          value={expectedReturnDate}
          onChange={(event) => setExpectedReturnDate(event.target.value)}
          className="w-full rounded-xl border border-slate-300 px-3 py-2"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() =>
            void save({
              availabilityState: "medical_hold",
              runningAllowed: false,
              expectedReturnDate: expectedReturnDate || null,
              note: "Athlete updated state: not cleared to run.",
            })
          }
          className="rounded-lg border border-rose-200 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-60"
        >
          Set not cleared
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() =>
            void save({
              availabilityState: "return_build",
              runningAllowed: true,
              expectedReturnDate: expectedReturnDate || null,
              note: "Athlete updated state: easy running only.",
            })
          }
          className="rounded-lg border border-sky-200 px-3 py-1.5 text-sm text-sky-700 hover:bg-sky-50 disabled:opacity-60"
        >
          Set easy-only return
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() =>
            void save({
              availabilityState: "normal",
              runningAllowed: true,
              expectedReturnDate: expectedReturnDate || null,
              note: "Athlete confirmed normal availability.",
            })
          }
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          Set normal
        </button>
      </div>
    </div>
  );
}
