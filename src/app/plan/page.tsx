import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
export default function PlanPage() {
  return <AppShell><h1 className="text-2xl font-semibold text-slate-900">Training Plan & Objectives</h1><SectionCard title="Marathon Objective"><div className="grid gap-3 sm:grid-cols-2"><input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Goal race date" /><input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Goal finish time" /><input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Goal pace" /><input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Target weekly volume" /></div></SectionCard><SectionCard title="Weekly Plan Table"><div className="text-sm text-slate-600">Editable plan table placeholder.</div></SectionCard></AppShell>;
}
