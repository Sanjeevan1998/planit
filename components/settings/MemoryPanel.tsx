"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, Plus, Trash2, Loader2, Tag, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserMemory, MemoryCategory } from "@/types";

// ── Types ─────────────────────────────────────────────────────

interface MemoryPanelProps {
  userId: string;
}

// ── Constants ─────────────────────────────────────────────────

const CATEGORY_COLORS: Record<MemoryCategory, string> = {
  likes: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  dislikes: "text-red-400 bg-red-400/10 border-red-400/20",
  allergies: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  accessibility: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  budget: "text-violet-400 bg-violet-400/10 border-violet-400/20",
  vibe: "text-pink-400 bg-pink-400/10 border-pink-400/20",
  transport: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20",
  accommodation: "text-orange-400 bg-orange-400/10 border-orange-400/20",
  activity: "text-lime-400 bg-lime-400/10 border-lime-400/20",
  custom: "text-zinc-400 bg-zinc-400/10 border-zinc-400/20",
};

const ALL_CATEGORIES: MemoryCategory[] = [
  "likes", "dislikes", "allergies", "accessibility",
  "budget", "vibe", "transport", "accommodation", "activity", "custom",
];

// ── MemoryPanel ────────────────────────────────────────────────

export function MemoryPanel({ userId }: MemoryPanelProps) {
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newCategory, setNewCategory] = useState<MemoryCategory>("likes");
  const [isAdding, setIsAdding] = useState(false);
  const [filterCategory, setFilterCategory] = useState<MemoryCategory | "all">("all");

  const fetchMemories = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/memory?user_id=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setMemories(data.memories ?? []);
      }
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  const handleDelete = async (key: string) => {
    setDeletingKey(key);
    try {
      await fetch(`/api/memory?user_id=${userId}&key=${encodeURIComponent(key)}`, {
        method: "DELETE",
      });
      setMemories((prev) => prev.filter((m) => m.key !== key));
    } finally {
      setDeletingKey(null);
    }
  };

  const handleAdd = async () => {
    if (!newKey.trim() || !newValue.trim()) return;
    setIsAdding(true);
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          memory: {
            key: newKey.trim(),
            value: newValue.trim(),
            category: newCategory,
            source: "text",
            confidence: 1,
          },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMemories((prev) => {
          const idx = prev.findIndex((m) => m.key === newKey.trim());
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = data.memory;
            return next;
          }
          return [data.memory, ...prev];
        });
        setNewKey("");
        setNewValue("");
        setShowAddForm(false);
      }
    } finally {
      setIsAdding(false);
    }
  };

  const filtered = filterCategory === "all"
    ? memories
    : memories.filter((m) => m.category === filterCategory);

  return (
    <div className="flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-zinc-800/60">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <Brain className="w-3.5 h-3.5 text-violet-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-200">AI Memory</h2>
            <p className="text-xs text-zinc-500">{memories.length} items learned</p>
          </div>
        </div>
        <button
          onClick={() => setShowAddForm((v) => !v)}
          className={cn(
            "w-7 h-7 rounded-lg flex items-center justify-center transition-colors",
            showAddForm
              ? "bg-violet-600/20 text-violet-400"
              : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
          )}
          title="Add memory"
        >
          {showAddForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Add form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-zinc-800/60"
          >
            <div className="px-4 py-3 space-y-2">
              <input
                type="text"
                placeholder="Key (e.g. prefers_vegan)"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className="w-full text-xs bg-zinc-800/60 border border-zinc-700/50 rounded-lg px-3 py-2 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500/50"
              />
              <input
                type="text"
                placeholder="Value (e.g. yes)"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                className="w-full text-xs bg-zinc-800/60 border border-zinc-700/50 rounded-lg px-3 py-2 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500/50"
              />
              <div className="flex gap-2">
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as MemoryCategory)}
                  className="flex-1 text-xs bg-zinc-800/60 border border-zinc-700/50 rounded-lg px-2 py-2 text-zinc-300 focus:outline-none focus:border-violet-500/50"
                >
                  {ALL_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <button
                  onClick={handleAdd}
                  disabled={isAdding || !newKey.trim() || !newValue.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isAdding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  Add
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Category filter chips */}
      <div className="px-4 py-2 flex gap-1.5 flex-wrap border-b border-zinc-800/60">
        <button
          onClick={() => setFilterCategory("all")}
          className={cn(
            "text-xs px-2 py-0.5 rounded-full border transition-colors",
            filterCategory === "all"
              ? "bg-zinc-700 border-zinc-600 text-zinc-200"
              : "border-zinc-800 text-zinc-500 hover:text-zinc-400"
          )}
        >
          all
        </button>
        {ALL_CATEGORIES.filter((c) => memories.some((m) => m.category === c)).map((c) => (
          <button
            key={c}
            onClick={() => setFilterCategory(filterCategory === c ? "all" : c)}
            className={cn(
              "text-xs px-2 py-0.5 rounded-full border transition-colors",
              filterCategory === c
                ? CATEGORY_COLORS[c]
                : "border-zinc-800 text-zinc-500 hover:text-zinc-400"
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Memory list */}
      <div className="px-4 py-3 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8">
            <Brain className="w-8 h-8 text-zinc-800 mx-auto mb-2" />
            <p className="text-xs text-zinc-600">
              {memories.length === 0
                ? "No memories yet. As you chat, AI will learn your preferences."
                : "No memories in this category."}
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filtered.map((memory) => (
              <motion.div
                key={memory.key}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.15 }}
                className="group flex items-start gap-2 p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/40 hover:border-zinc-700/60 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span
                      className={cn(
                        "text-[10px] font-medium px-1.5 py-0.5 rounded-full border",
                        CATEGORY_COLORS[memory.category] ?? "text-zinc-400 bg-zinc-400/10 border-zinc-400/20"
                      )}
                    >
                      {memory.category}
                    </span>
                    <span className="text-xs font-medium text-zinc-300 truncate">{memory.key}</span>
                  </div>
                  <p className="text-xs text-zinc-500 leading-relaxed">{memory.value}</p>
                </div>
                <button
                  onClick={() => handleDelete(memory.key)}
                  disabled={deletingKey === memory.key}
                  className="opacity-0 group-hover:opacity-100 flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-all"
                  title="Delete"
                >
                  {deletingKey === memory.key
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Trash2 className="w-3 h-3" />}
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-zinc-800/60">
        <p className="text-[11px] text-zinc-600 leading-relaxed flex items-start gap-1.5">
          <Tag className="w-3 h-3 mt-0.5 shrink-0" />
          AI learns your preferences from every conversation. Delete any memory to forget it.
        </p>
      </div>
    </div>
  );
}
