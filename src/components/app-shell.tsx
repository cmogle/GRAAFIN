"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TopNav } from "@/components/top-nav";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/query", label: "Query" },
  { href: "/plan", label: "Plan" },
  { href: "/alerts", label: "Alerts" },
  { href: "/profile", label: "Profile" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-white">
      <TopNav />
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[240px_1fr] lg:px-8">
        <aside className="h-fit rounded-3xl border border-slate-200/80 bg-white/90 p-3 shadow-sm backdrop-blur">
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Workspace</p>
          <nav className="space-y-1">
            {tabs.map((tab) => {
              const active = pathname === tab.href;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    "block rounded-xl px-3 py-2 text-sm transition",
                    active
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="space-y-6">{children}</main>
      </div>
    </div>
  );
}
