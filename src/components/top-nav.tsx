"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Bot, Menu } from "lucide-react";

export function TopNav() {
  const pathname = usePathname();
  const onCoachPage = pathname === "/coach" || pathname.startsWith("/coach/");

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur">
      <div className={`mx-auto flex max-w-5xl items-center justify-between px-4 sm:px-6 ${onCoachPage ? "h-12 sm:h-14" : "h-14"}`}>
        <Link href="/dashboard" className="flex items-center gap-2.5 font-semibold text-slate-900">
          <span className="rounded-xl bg-slate-900 p-1.5">
            <Activity className="h-4 w-4 text-white" />
          </span>
          GRAAFIN
        </Link>
        <div className="flex items-center gap-2">
          {!onCoachPage ? (
            <Link
              href="/coach"
              className="inline-flex min-h-10 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm"
            >
              <Bot className="h-3.5 w-3.5" />
              Coach
            </Link>
          ) : null}

          <details className="relative">
            <summary className={`inline-flex min-h-10 cursor-pointer list-none items-center gap-1 rounded-full border border-slate-200 bg-white py-1 text-xs font-medium text-slate-700 shadow-sm ${onCoachPage ? "px-2.5 sm:px-3" : "px-3"}`}>
              <Menu className="h-3.5 w-3.5" />
              {onCoachPage ? <span className="hidden sm:inline">Menu</span> : "Menu"}
            </summary>
            <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
              <Link
                href="/plan"
                className="block rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                Plan
              </Link>
              <Link
                href="/trends"
                className="block rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                Trends
              </Link>
              <Link
                href="/profile"
                className="block rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                Preferences
              </Link>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
