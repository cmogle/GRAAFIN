import Link from "next/link";
import { TopNav } from "@/components/top-nav";
const tabs = [ { href: "/dashboard", label: "Dashboard" }, { href: "/query", label: "Query" }, { href: "/plan", label: "Plan" }, { href: "/alerts", label: "Alerts" }, { href: "/profile", label: "Profile" } ];
export function AppShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50"><TopNav /><div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[220px_1fr] lg:px-8"><aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><nav className="space-y-1">{tabs.map((tab) => <Link key={tab.href} href={tab.href} className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">{tab.label}</Link>)}</nav></aside><main className="space-y-6">{children}</main></div></div>;
}
