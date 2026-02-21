import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
export default function QueryPage() {
  return <AppShell><h1 className="text-2xl font-semibold text-slate-900">Query Coach</h1><div className="grid gap-4 xl:grid-cols-2"><SectionCard title="Ask a question"><div className="space-y-3"><div className="rounded-lg border border-slate-200 p-3 text-slate-500">Am I on track this week?</div><div className="flex gap-2"><input className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Ask about your training..." /><button className="rounded-lg bg-slate-900 px-4 py-2 text-white">Ask</button></div></div></SectionCard><SectionCard title="Answer + Results"><div className="h-64 rounded-xl border border-dashed border-slate-300 bg-slate-50" /></SectionCard></div></AppShell>;
}
