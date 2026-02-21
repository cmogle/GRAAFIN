"use client";

import Link from "next/link";
import { Activity } from "lucide-react";

export function TopNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-slate-900">
          <Activity className="h-5 w-5 text-blue-600" />
          Fionnuala Run Coach
        </Link>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">Data status on Dashboard</span>
      </div>
    </header>
  );
}
