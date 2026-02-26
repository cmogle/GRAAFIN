export function NarrativeHeader({
  summary,
  phase,
  athlete = "Fionnuala",
}: {
  summary: string;
  phase: string;
  athlete?: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Training cockpit</p>
      <h1 className="mt-1 text-2xl font-semibold text-slate-900">{athlete} · {phase}</h1>
      <p className="mt-2 text-sm text-slate-600">{summary}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href="/plan"
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          View this week’s plan
        </a>
        <a
          href="/coach"
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Ask coach
        </a>
      </div>
    </div>
  );
}
