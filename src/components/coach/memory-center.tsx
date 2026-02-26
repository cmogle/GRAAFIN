"use client";

import { useEffect, useState } from "react";
import { Download, Pencil, Save, Trash2, X } from "lucide-react";

type MemoryItem = {
  id: string;
  type: string;
  content: string;
  confidence: number;
  createdAt: string;
  updatedAt: string;
};

type MemoryResponse = { items: MemoryItem[] };

export function MemoryCenter() {
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftContent, setDraftContent] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/coach/memory");
      const data = (await res.json()) as MemoryResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load memory");
      setItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load memory");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onDelete = async (id: string) => {
    const res = await fetch(`/api/coach/memory/${id}`, { method: "DELETE" });
    if (res.ok) {
      setItems((prev) => prev.filter((item) => item.id !== id));
    }
  };

  const onSave = async (id: string) => {
    const trimmed = draftContent.trim();
    if (!trimmed) return;
    const res = await fetch(`/api/coach/memory/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: trimmed }),
    });
    const data = await res.json();
    if (!res.ok) return;
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, content: data.item.content, updatedAt: data.item.updatedAt } : item)),
    );
    setEditingId(null);
    setDraftContent("");
  };

  const exportMemory = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), items }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "graafin-coach-memory.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">Persistent memory used by the coach across sessions.</p>
        <button
          type="button"
          onClick={exportMemory}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
        >
          <Download className="h-3.5 w-3.5" />
          Export JSON
        </button>
      </div>

      {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Loading memory...</p> : null}

      {!loading && items.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-600">No memory items yet.</p>
      ) : null}

      {items.map((item) => (
        <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">{item.type}</p>
              {editingId === item.id ? (
                <textarea
                  className="mt-1 min-h-20 w-full rounded-xl border border-slate-300 px-2 py-2 text-sm"
                  value={draftContent}
                  onChange={(e) => setDraftContent(e.target.value)}
                />
              ) : (
                <p className="text-sm text-slate-800">{item.content}</p>
              )}
            </div>
            <div className="flex items-center gap-1">
              {editingId === item.id ? (
                <>
                  <button
                    type="button"
                    onClick={() => void onSave(item.id)}
                    className="rounded-lg border border-emerald-200 px-2 py-1 text-emerald-700 hover:bg-emerald-50"
                  >
                    <Save className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setDraftContent("");
                    }}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(item.id);
                    setDraftContent(item.content);
                  }}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-slate-700 hover:bg-slate-50"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => void onDelete(item.id)}
                className="rounded-lg border border-rose-200 px-2 py-1 text-rose-700 hover:bg-rose-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Confidence {(item.confidence * 100).toFixed(0)}% · Updated {new Date(item.updatedAt).toLocaleString()}
          </p>
        </article>
      ))}
    </div>
  );
}
