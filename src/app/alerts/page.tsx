import { AppShell } from "@/components/app-shell";
import { KpiCard } from "@/components/kpi-card";
import { SectionCard } from "@/components/section-card";

const alerts = [
  { level: "amber", text: "Load spike risk: ACWR climbed above 1.2 this week." },
  { level: "red", text: "Long-run heart-rate drift exceeded 8% in latest session." },
  { level: "blue", text: "Readiness improved after 2 low-intensity days." },
];

const levelClass: Record<string, string> = {
  amber: "bg-amber-50 text-amber-800",
  red: "bg-red-50 text-red-800",
  blue: "bg-blue-50 text-blue-800",
};

export default function AlertsPage() {
  return (
    <AppShell>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Readiness & Alerts</h1>
        <p className="mt-1 text-sm text-slate-600">Daily coaching signals based on training load, recovery and consistency.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Readiness" value="72" sub="Caution" status="yellow" />
        <KpiCard label="Load" value="68" sub="Moderate" status="neutral" />
        <KpiCard label="Consistency" value="80" sub="Strong" status="green" />
        <KpiCard label="Recovery" value="74" sub="Stable" status="green" />
      </div>

      <SectionCard title="Alerts timeline">
        <ul className="space-y-2 text-sm">
          {alerts.map((alert) => (
            <li key={alert.text} className={`rounded-xl p-3 ${levelClass[alert.level]}`}>
              {alert.text}
            </li>
          ))}
        </ul>
      </SectionCard>
    </AppShell>
  );
}
