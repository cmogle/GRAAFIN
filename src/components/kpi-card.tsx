import { cn } from "@/lib/utils";
type Status = "green" | "yellow" | "red" | "neutral";
const statusStyles: Record<Status, string> = { green: "bg-emerald-50 text-emerald-700", yellow: "bg-amber-50 text-amber-700", red: "bg-red-50 text-red-700", neutral: "bg-slate-100 text-slate-700" };
export function KpiCard({ label, value, sub, status = "neutral" }: { label: string; value: string; sub?: string; status?: Status; }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div><div className="text-2xl font-semibold text-slate-900">{value}</div>{sub ? <div className={cn("mt-2 inline-flex rounded-full px-2 py-1 text-xs", statusStyles[status])}>{sub}</div> : null}</div>;
}
