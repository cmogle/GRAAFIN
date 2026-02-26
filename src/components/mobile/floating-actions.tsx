"use client";

import Link from "next/link";
import { Plus, Bot } from "lucide-react";
import { useState } from "react";

export function FloatingActions() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-24 right-4 z-30 lg:bottom-8 lg:right-8">
      {open ? (
        <div className="mb-2 flex flex-col items-end gap-2">
          <Link
            href="/plan#plan-workout-form"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Log workout
          </Link>
          <Link
            href="/coach"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm"
          >
            <Bot className="h-4 w-4" />
            Ask coach
          </Link>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open quick actions"
        className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg transition-transform hover:scale-[1.03]"
      >
        <Plus className={`h-6 w-6 transition-transform ${open ? "rotate-45" : "rotate-0"}`} />
      </button>
    </div>
  );
}
