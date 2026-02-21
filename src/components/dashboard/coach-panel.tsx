export function CoachPanel({
  recommendation,
  warning,
  confidence,
}: {
  recommendation: string;
  warning: string | null;
  confidence: "Low" | "Medium" | "High";
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">What to do next</h3>
      <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{recommendation}</p>
      {warning ? <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{warning}</p> : null}
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">Signal confidence: {confidence}</p>
    </div>
  );
}
