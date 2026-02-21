import { AppShell } from "@/components/app-shell";
import { KpiCard } from "@/components/kpi-card";
import { SectionCard } from "@/components/section-card";
import {
  AlertTriangle,
  ShieldAlert,
  Info,
  Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Severity = "red" | "amber" | "blue" | "green";

interface AlertItem {
  severity: Severity;
  title: string;
  description: string;
  timestamp: string;
  action: string;
}

const severityConfig: Record<
  Severity,
  { bg: string; text: string; icon: typeof AlertTriangle; label: string }
> = {
  red: {
    bg: "bg-destructive-muted",
    text: "text-destructive",
    icon: ShieldAlert,
    label: "High Risk",
  },
  amber: {
    bg: "bg-warning-muted",
    text: "text-warning",
    icon: AlertTriangle,
    label: "Caution",
  },
  blue: {
    bg: "bg-accent-muted",
    text: "text-accent",
    icon: Info,
    label: "Info",
  },
  green: {
    bg: "bg-success-muted",
    text: "text-success",
    icon: Info,
    label: "Positive",
  },
};

const alertTimeline: AlertItem[] = [
  {
    severity: "red",
    title: "Long-run cardiac drift elevated",
    description:
      "HR drift exceeded 8% in the last 3 km of Sunday's long run, suggesting accumulated fatigue or pacing issues.",
    timestamp: "Sun, 15 Feb 2026 - 14:32",
    action: "Add an extra easy day before next quality session.",
  },
  {
    severity: "amber",
    title: "ACWR trending high",
    description:
      "Acute:chronic workload ratio is 1.35 this week — above the 1.3 threshold. Monitor closely.",
    timestamp: "Sat, 14 Feb 2026 - 08:00",
    action: "Reduce next interval session volume by 15%.",
  },
  {
    severity: "amber",
    title: "Sleep disruption pattern",
    description:
      "3 of the last 5 nights had elevated resting HR, suggesting inadequate recovery.",
    timestamp: "Fri, 13 Feb 2026 - 07:15",
    action: "Prioritize 8h+ sleep before Thursday tempo.",
  },
  {
    severity: "blue",
    title: "Weekly volume on track",
    description:
      "You have completed 52.4 km of your 65 km target with 2 sessions remaining.",
    timestamp: "Thu, 12 Feb 2026 - 20:00",
    action: "Continue as planned.",
  },
  {
    severity: "green",
    title: "Consistency streak",
    description:
      "5 of 6 planned sessions completed last week. Great compliance.",
    timestamp: "Mon, 9 Feb 2026 - 09:00",
    action: "Maintain current routine.",
  },
];

const recommendations = [
  "Reduce next quality session volume by 15% to manage ACWR.",
  "Add a 20-minute easy shakeout before Thursday's tempo to pre-warm legs.",
  "Consider replacing Saturday's easy run with cross-training if fatigue persists.",
];

export default function AlertsPage() {
  return (
    <AppShell>
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Readiness & Alerts
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Training load monitoring and coaching recommendations.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Readiness Score"
          value="72"
          sub="Moderate"
          status="yellow"
        />
        <KpiCard label="Load Score" value="68" sub="Elevated" status="yellow" />
        <KpiCard
          label="Consistency"
          value="83%"
          sub="Strong"
          status="green"
        />
        <KpiCard
          label="Recovery"
          value="74"
          sub="Adequate"
          status="neutral"
        />
      </div>

      {/* Readiness trend */}
      <SectionCard title="Readiness Trend (14 Days)">
        <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border bg-muted/50">
          <div className="flex flex-col items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Line chart visualization area
            </span>
            <div className="flex gap-3">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-accent" />
                Readiness
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-warning" />
                Load
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-success" />
                Recovery
              </span>
            </div>
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* Alerts timeline */}
        <div className="xl:col-span-2">
          <SectionCard title="Alerts Timeline">
            <div className="flex flex-col gap-3">
              {alertTimeline.map((alert) => {
                const config = severityConfig[alert.severity];
                const Icon = config.icon;
                return (
                  <div
                    key={alert.title}
                    className={cn(
                      "rounded-xl p-4",
                      config.bg
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <Icon
                        className={cn(
                          "mt-0.5 h-4 w-4 shrink-0",
                          config.text
                        )}
                      />
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {alert.title}
                          </span>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                              config.text,
                              config.bg
                            )}
                          >
                            {config.label}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {alert.description}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                          <span className="text-muted-foreground">
                            {alert.timestamp}
                          </span>
                          <span className="font-medium text-foreground">
                            Recommended: {alert.action}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>

        {/* Recommendations */}
        <SectionCard title="Recommended Actions">
          <ul className="flex flex-col gap-3">
            {recommendations.map((rec) => (
              <li key={rec} className="flex items-start gap-3 text-sm">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <span className="leading-relaxed text-foreground">{rec}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </AppShell>
  );
}
