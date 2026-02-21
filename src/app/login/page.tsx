"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Activity } from "lucide-react";

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
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="flex items-center gap-2">
          <Activity className="h-6 w-6 text-accent" />
          <h1 className="text-xl font-semibold text-card-foreground">
            Fionnuala Run Coach
          </h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Track marathon progress against plan in one place.
        </p>

        <button
          onClick={onGoogleLogin}
          disabled={loading}
          className="mt-6 w-full rounded-xl bg-accent px-4 py-3 text-sm font-medium text-accent-foreground transition-opacity disabled:opacity-60"
        >
          {loading ? "Redirecting..." : "Continue with Google"}
        </button>

        {error && (
          <p className="mt-3 text-sm text-destructive">{error}</p>
        )}

        <div className="mt-6 rounded-xl bg-muted p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Onboarding checklist</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Sign in with Google</li>
            <li>Connect Strava</li>
            <li>Import training plan</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
