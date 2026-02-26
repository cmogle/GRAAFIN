"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, ArrowRight } from "lucide-react";

type OnboardingStep = {
  key: string;
  label: string;
  done: boolean;
};

type OnboardingState = {
  steps: OnboardingStep[];
  complete: boolean;
};

function nextStep(steps: OnboardingStep[]) {
  return steps.find((step) => !step.done) ?? null;
}

function nextAction(step: OnboardingStep | null) {
  if (!step) return { href: "/dashboard", label: "Open today cockpit" };
  if (step.key === "strava") return { href: "/profile", label: "Open profile connections" };
  if (step.key === "plan") return { href: "/plan", label: "Create first plan" };
  if (step.key === "coach") return { href: "/coach", label: "Start coach chat" };
  return { href: "/dashboard", label: "Open today cockpit" };
}

export function OnboardingFlowAgent() {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/onboarding/state");
        const data = (await res.json()) as OnboardingState & { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Failed to load onboarding status");
        setState(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load onboarding status");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  const upcoming = useMemo(() => nextStep(state?.steps ?? []), [state]);
  const action = nextAction(upcoming);

  if (loading) {
    return <p className="text-sm text-slate-500">Checking onboarding progress...</p>;
  }
  if (error) {
    return <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>;
  }
  if (!state) return null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700">
        {state.complete
          ? "Onboarding complete. Your daily cockpit and coach are fully active."
          : "Onboarding agent is guiding your next highest-impact step."}
      </p>

      <ul className="space-y-2">
        {state.steps.map((step) => (
          <li key={step.key} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
            {step.done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-slate-300" />}
            <span>{step.label}</span>
          </li>
        ))}
      </ul>

      <a
        href={action.href}
        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
      >
        {action.label}
        <ArrowRight className="h-4 w-4" />
      </a>
    </div>
  );
}
