"use client";

import { useEffect, useMemo, useState } from "react";
import { Pin, PinOff, EyeOff } from "lucide-react";

type CockpitSummary = {
  readiness: {
    score: number;
    status: string;
    loadRatio: number;
    monotony: number;
  };
  todayPlan: {
    workouts: Array<{ id: string }>;
  };
  quickInsights: string[];
};

type WorkbenchModule = {
  moduleKey: string;
  title: string;
  description: string;
  score: number;
  reason: string;
  pinned: boolean;
  visibility: "auto" | "manual_shown" | "manual_hidden";
  slotIndex: number;
  autoShown: boolean;
};

function moduleBody(module: WorkbenchModule, cockpit: CockpitSummary) {
  if (module.moduleKey === "readiness_focus") {
    return `Readiness ${cockpit.readiness.score.toFixed(0)} (${cockpit.readiness.status}) with load ratio ${cockpit.readiness.loadRatio.toFixed(2)}.`;
  }
  if (module.moduleKey === "load_risk") {
    return `Monotony ${cockpit.readiness.monotony.toFixed(2)} and ratio ${cockpit.readiness.loadRatio.toFixed(2)} are driving this view.`;
  }
  if (module.moduleKey === "plan_adherence") {
    return cockpit.todayPlan.workouts.length
      ? `${cockpit.todayPlan.workouts.length} workout(s) are scheduled today. Track execution consistency.`
      : "No workout is scheduled today; this module is suggesting a plan check-in.";
  }
  if (module.moduleKey === "query_theme_summary") {
    return module.reason;
  }
  if (module.moduleKey === "wellness_recovery") {
    return "Recovery and wellness-related questions are currently elevated in your query profile.";
  }
  if (module.moduleKey === "block_progress") {
    return "Race-block timing and progression topics are currently active in your coaching conversations.";
  }
  return module.description;
}

export function AdaptiveWorkbench({ cockpit }: { cockpit: CockpitSummary }) {
  const [modules, setModules] = useState<WorkbenchModule[]>([]);
  const [loading, setLoading] = useState(true);

  const visibleModules = useMemo(
    () => modules.filter((module) => module.autoShown).slice(0, 4),
    [modules],
  );
  const hiddenModules = useMemo(
    () => modules.filter((module) => module.visibility === "manual_hidden"),
    [modules],
  );

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/coach/workbench?surface=dashboard", { method: "GET" });
      if (!res.ok) throw new Error("Failed to load workbench modules");
      const data = (await res.json()) as { modules?: WorkbenchModule[] };
      setModules(Array.isArray(data.modules) ? data.modules : []);
    } catch {
      setModules([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const updateLayout = async (
    module: WorkbenchModule,
    patch: Partial<Pick<WorkbenchModule, "visibility" | "pinned" | "slotIndex">>,
    feedbackType: "module_open" | "module_hide",
  ) => {
    await fetch("/api/coach/workbench/layout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        surface: "dashboard",
        moduleKey: module.moduleKey,
        visibility: patch.visibility ?? module.visibility,
        pinned: patch.pinned ?? module.pinned,
        slotIndex: patch.slotIndex ?? module.slotIndex,
        score: module.score,
        reason: module.reason,
      }),
    });

    await fetch("/api/coach/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feedbackType,
        payload: { moduleKey: module.moduleKey, surface: "dashboard" },
      }),
    });

    await load();
  };

  if (loading) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        Loading adaptive workbench...
      </section>
    );
  }

  if (!visibleModules.length) return null;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Adaptive workbench</h2>
        <p className="text-xs text-slate-400">Guided auto layout</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {visibleModules.map((module) => (
          <article key={module.moduleKey} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-slate-900">{module.title}</p>
                <p className="mt-1 text-xs text-slate-600">{moduleBody(module, cockpit)}</p>
                <p className="mt-2 text-[11px] text-slate-500">Score {module.score.toFixed(2)} · {module.reason}</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    void updateLayout(
                      module,
                      { pinned: !module.pinned, visibility: "manual_shown" },
                      "module_open",
                    )
                  }
                  className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100"
                  aria-label={module.pinned ? "Unpin module" : "Pin module"}
                >
                  {module.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void updateLayout(
                      module,
                      { visibility: "manual_hidden", pinned: false },
                      "module_hide",
                    )
                  }
                  className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100"
                  aria-label="Hide module"
                >
                  <EyeOff className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {hiddenModules.length ? (
        <div className="mt-3 border-t border-slate-200 pt-3">
          <p className="mb-2 text-xs font-medium text-slate-500">Hidden modules</p>
          <div className="flex flex-wrap gap-2">
            {hiddenModules.map((module) => (
              <button
                key={module.moduleKey}
                type="button"
                onClick={() =>
                  void updateLayout(
                    module,
                    { visibility: "manual_shown" },
                    "module_open",
                  )
                }
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100"
              >
                Restore {module.title}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
