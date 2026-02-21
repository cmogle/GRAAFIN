"use client";

import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Key,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ConnectionStatus = "connected" | "active" | "not_configured";

interface ServiceConnection {
  name: string;
  status: ConnectionStatus;
  description: string;
}

const statusConfig: Record<
  ConnectionStatus,
  { bg: string; text: string; label: string; icon: typeof CheckCircle2 }
> = {
  connected: {
    bg: "bg-success-muted",
    text: "text-success",
    label: "Connected",
    icon: CheckCircle2,
  },
  active: {
    bg: "bg-accent-muted",
    text: "text-accent",
    label: "Active",
    icon: CheckCircle2,
  },
  not_configured: {
    bg: "bg-muted",
    text: "text-muted-foreground",
    label: "Not configured",
    icon: XCircle,
  },
};

const services: ServiceConnection[] = [
  { name: "Google", status: "connected", description: "OAuth sign-in provider" },
  { name: "Strava", status: "connected", description: "Activity data source" },
  { name: "Supabase", status: "active", description: "Database & auth backend" },
  { name: "OpenAI", status: "not_configured", description: "AI query engine" },
];

const envKeys = [
  { key: "NEXT_PUBLIC_SUPABASE_URL", present: true },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", present: true },
  { key: "STRAVA_SYNC_WEBHOOK_URL", present: false },
  { key: "OPENAI_API_KEY", present: false },
];

export default function ProfilePage() {
  const [dangerOpen, setDangerOpen] = useState(false);

  return (
    <AppShell>
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Profile & Connections
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your athlete profile and connected services.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Athlete profile */}
        <SectionCard title="Athlete Profile">
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Name
                </label>
                <input
                  type="text"
                  defaultValue="Fionnuala"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Timezone
                </label>
                <input
                  type="text"
                  defaultValue="Europe/Dublin"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Preferred Units
                </label>
                <select className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30">
                  <option>km / min/km</option>
                  <option>mi / min/mi</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Goal Race
                </label>
                <input
                  type="text"
                  defaultValue="Dublin Marathon 2026"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
                />
              </div>
            </div>
            <button className="w-fit rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">
              Save Profile
            </button>
          </div>
        </SectionCard>

        {/* Connected services */}
        <SectionCard title="Connected Services">
          <div className="flex flex-col gap-3">
            {services.map((service) => {
              const config = statusConfig[service.status];
              const Icon = config.icon;
              return (
                <div
                  key={service.name}
                  className="flex items-center justify-between rounded-xl border border-border bg-background p-3"
                >
                  <div className="flex items-center gap-3">
                    <Icon className={cn("h-4 w-4", config.text)} />
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        {service.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {service.description}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-medium",
                        config.bg,
                        config.text
                      )}
                    >
                      {config.label}
                    </span>
                    <button
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      aria-label={`Reconnect ${service.name}`}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>

      {/* Environment / Config */}
      <SectionCard title="Environment & Config">
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {envKeys.map((env) => (
              <div
                key={env.key}
                className="flex items-center gap-3 rounded-lg border border-border bg-background p-3"
              >
                <Key
                  className={cn(
                    "h-4 w-4 shrink-0",
                    env.present ? "text-success" : "text-muted-foreground"
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-mono text-xs text-foreground">
                    {env.key}
                  </div>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                    env.present
                      ? "bg-success-muted text-success"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {env.present ? "Set" : "Missing"}
                </span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Last sync run: --
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Last data refresh: --
            </span>
          </div>
        </div>
      </SectionCard>

      {/* Danger zone */}
      <div className="rounded-2xl border border-destructive/30 bg-card shadow-sm">
        <button
          onClick={() => setDangerOpen(!dangerOpen)}
          className="flex w-full items-center justify-between p-5 text-left"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-sm font-semibold uppercase tracking-wide text-destructive">
              Danger Zone
            </span>
          </div>
          {dangerOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        {dangerOpen && (
          <div className="border-t border-destructive/20 p-5">
            <p className="mb-4 text-sm text-muted-foreground">
              Disconnecting a service will remove its data access. This
              action requires confirmation.
            </p>
            <div className="flex flex-wrap gap-3">
              <button className="rounded-lg border border-destructive/30 bg-destructive-muted px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive hover:text-accent-foreground">
                Disconnect Google
              </button>
              <button className="rounded-lg border border-destructive/30 bg-destructive-muted px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive hover:text-accent-foreground">
                Disconnect Strava
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
