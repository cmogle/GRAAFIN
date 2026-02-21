import { ReactNode } from "react";
export function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="mb-4 text-base font-semibold text-slate-900">{title}</h3>{children}</section>;
}
