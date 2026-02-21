"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Activity, ArrowRight, CheckCircle2 } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Animated running‑track SVG that draws itself on mount              */
/* ------------------------------------------------------------------ */
function TrackLines() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      preserveAspectRatio="none"
      viewBox="0 0 400 800"
    >
      {/* Curved track lanes */}
      {[0, 1, 2, 3, 4].map((i) => (
        <path
          key={i}
          d={`M ${60 + i * 30} 0 Q ${120 + i * 25} 400 ${60 + i * 30} 800`}
          fill="none"
          stroke="currentColor"
          className="text-accent/[0.06]"
          strokeWidth="1.5"
          strokeDasharray="800"
          strokeDashoffset="800"
          style={{
            animation: `dash-draw 2s cubic-bezier(0.65, 0, 0.35, 1) ${0.3 + i * 0.15}s forwards`,
          }}
        />
      ))}
      {/* Horizontal hash marks */}
      {[200, 400, 600].map((y, i) => (
        <line
          key={y}
          x1="40"
          y1={y}
          x2="220"
          y2={y}
          stroke="currentColor"
          className="text-accent/[0.04]"
          strokeWidth="1"
          strokeDasharray="180"
          strokeDashoffset="180"
          style={{
            animation: `dash-draw 1s ease ${1.2 + i * 0.2}s forwards`,
          }}
        />
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Floating pace‑stat pill                                           */
/* ------------------------------------------------------------------ */
function StatPill({
  label,
  value,
  delay,
}: {
  label: string;
  value: string;
  delay: string;
}) {
  return (
    <div
      className="animate-fade-up flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-4 py-2 text-xs font-medium backdrop-blur-sm"
      style={{ animationDelay: delay }}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-foreground">{value}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Onboarding step row                                                */
/* ------------------------------------------------------------------ */
function StepRow({
  step,
  label,
  delay,
}: {
  step: number;
  label: string;
  delay: string;
}) {
  return (
    <li
      className="animate-slide-right flex items-center gap-3 opacity-0"
      style={{ animationDelay: delay }}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-semibold text-accent">
        {step}
      </span>
      <span className="text-sm text-muted-foreground">{label}</span>
      <CheckCircle2 className="ml-auto h-4 w-4 text-accent/30" />
    </li>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */
export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) throw error;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-foreground px-5 py-12">
      {/* ---- background track art ---- */}
      <TrackLines />

      {/* ---- faint radial glow ---- */}
      <div
        aria-hidden="true"
        className="animate-fade-in pointer-events-none absolute left-1/2 top-1/3 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-30"
        style={{
          background:
            "radial-gradient(circle, rgba(37,99,235,0.25) 0%, transparent 70%)",
          animationDelay: "0.6s",
        }}
      />

      {/* ---- content card ---- */}
      <div className="relative z-10 flex w-full max-w-sm flex-col items-center">
        {/* logo mark with pulse */}
        <div
          className="animate-scale-in relative mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent"
          style={{ animationDelay: "0.1s" }}
        >
          <Activity className="h-8 w-8 text-accent-foreground" strokeWidth={2.5} />
          {/* pulsing ring */}
          <span className="animate-pulse-ring absolute inset-0 rounded-2xl" />
        </div>

        {/* heading */}
        <h1
          className="animate-fade-up text-center text-3xl font-bold tracking-tight text-card sm:text-4xl"
          style={{ animationDelay: "0.25s" }}
        >
          <span className="text-balance">Fionnuala Run Coach</span>
        </h1>

        <p
          className="animate-fade-up mt-3 max-w-xs text-center text-sm leading-relaxed text-muted-foreground"
          style={{ animationDelay: "0.4s" }}
        >
          Marathon training tracked, analysed, and coached in one place.
        </p>

        {/* floating stat pills */}
        <div
          className="mt-6 flex flex-wrap items-center justify-center gap-2"
        >
          <StatPill label="Avg pace" value="5:12 /km" delay="0.7s" />
          <StatPill label="Week" value="47.2 km" delay="0.85s" />
          <StatPill label="Runs" value="5" delay="1.0s" />
        </div>

        {/* CTA button */}
        <button
          onClick={onGoogleLogin}
          disabled={loading}
          className="animate-fade-up group relative mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-accent px-6 py-4 text-base font-semibold text-accent-foreground shadow-lg shadow-accent/25 transition-all hover:shadow-xl hover:shadow-accent/30 active:scale-[0.98] disabled:opacity-60"
          style={{ animationDelay: "0.55s" }}
        >
          {/* Google icon */}
          <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 0 0 1 12c0 1.94.47 3.77 1.18 5.07l3.66-2.98z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          <span>{loading ? "Redirecting..." : "Continue with Google"}</span>
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </button>

        {error && (
          <p className="mt-3 text-center text-sm text-destructive">{error}</p>
        )}

        {/* Onboarding steps */}
        <div
          className="animate-fade-up mt-10 w-full rounded-2xl border border-border/10 bg-card/5 p-5 backdrop-blur-sm"
          style={{ animationDelay: "1.1s" }}
        >
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-accent">
            Get started in 3 steps
          </p>
          <ol className="flex flex-col gap-3">
            <StepRow step={1} label="Sign in with Google" delay="1.25s" />
            <StepRow step={2} label="Connect Strava" delay="1.4s" />
            <StepRow step={3} label="Import training plan" delay="1.55s" />
          </ol>
        </div>

        {/* bottom tagline */}
        <p
          className="animate-fade-in mt-8 text-center text-xs text-muted-foreground/50"
          style={{ animationDelay: "1.8s" }}
        >
          Powered by Strava. Built for marathon runners.
        </p>
      </div>
    </div>
  );
}
