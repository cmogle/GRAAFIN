import { AppShell } from "@/components/app-shell";
import { KpiCard } from "@/components/kpi-card";
import { SectionCard } from "@/components/section-card";
export default function AlertsPage() {
  return <AppShell><h1 className="text-2xl font-semibold text-slate-900">Readiness & Alerts</h1><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><KpiCard label="Readiness" value="72" sub="Yellow" status="yellow" /><KpiCard label="Load" value="68" /><KpiCard label="Consistency" value="80" /><KpiCard label="Recovery" value="74" /></div><SectionCard title="Alerts Timeline"><ul className="space-y-2 text-sm"><li className="rounded-lg bg-amber-50 p-2">Load spike risk: ACWR up this week.</li><li className="rounded-lg bg-red-50 p-2">Long-run drift {">"} 8% in last session.</li></ul></SectionCard></AppShell>;
}
