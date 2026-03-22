"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Clock, MapPin, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────

interface ActivitySuggestion {
  id: string;
  city: string;
  type: string;
  title: string;
  description: string;
  location: { lat: number; lng: number; address: string };
  duration_minutes: number;
  budget_tier: string;
  budget_estimate: string;
  tags: string[];
  why_selected: string;
  accessibility_verified: boolean;
  booking_links: Array<{
    platform: string;
    url: string;
    label: string;
    category: string;
  }>;
  is_event: boolean;
  event_date?: string;
  event_start?: string;
  event_end?: string;
}

interface ActivityConflict {
  date: string;
  time_slot: string;
  options: ActivitySuggestion[];
}

interface ConflictResolverProps {
  conflicts: ActivityConflict[];
  onResolved: (winnerIds: string[]) => void;
  isResolving?: boolean;
}

// ── Constants ────────────────────────────────────────────────────

const BUDGET_COLORS: Record<string, string> = {
  budget: "text-emerald-400 bg-emerald-400/10",
  "mid-range": "text-blue-400 bg-blue-400/10",
  premium: "text-violet-400 bg-violet-400/10",
  luxury: "text-amber-400 bg-amber-400/10",
};

// ── Helpers ──────────────────────────────────────────────────────

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatConflictDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

// ── OptionCard ───────────────────────────────────────────────────

interface OptionCardProps {
  option: ActivitySuggestion;
  isSelected: boolean;
  isDimmed: boolean;
  onSelect: () => void;
}

function OptionCard({ option, isSelected, isDimmed, onSelect }: OptionCardProps) {
  const budgetClass =
    BUDGET_COLORS[option.budget_tier] ?? "text-zinc-400 bg-zinc-400/10";
  const emoji = option.is_event ? "🎭" : "🎯";

  return (
    <motion.button
      whileHover={{ scale: isDimmed ? 1 : 1.01 }}
      whileTap={{ scale: 0.99 }}
      onClick={onSelect}
      className={cn(
        "relative w-full text-left rounded-2xl border p-4 transition-all duration-300",
        isSelected &&
          "border-violet-500 ring-1 ring-violet-500/30 bg-violet-500/5 shadow-lg shadow-violet-500/10",
        !isSelected &&
          !isDimmed &&
          "border-zinc-800/50 bg-zinc-900/60 hover:border-zinc-700 hover:bg-zinc-800/40",
        isDimmed && "border-zinc-800/30 bg-zinc-900/30 opacity-40"
      )}
    >
      {/* Selected indicator */}
      <AnimatePresence>
        {isSelected && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="absolute top-3 right-3 w-6 h-6 rounded-full bg-violet-500 flex items-center justify-center"
          >
            <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-start gap-2 mb-2 pr-8">
        <span className="text-xl leading-none mt-0.5">{emoji}</span>
        <h4 className="font-semibold text-zinc-200 text-sm leading-snug">
          {option.title}
        </h4>
      </div>

      {/* Description */}
      <p className="text-xs text-zinc-400 leading-relaxed mb-3 line-clamp-3">
        {option.description}
      </p>

      {/* Event time if applicable */}
      {option.is_event && option.event_start && (
        <div className="flex items-center gap-1.5 text-xs text-amber-400 mb-2">
          <Clock className="w-3 h-3" />
          <span>
            {option.event_start}
            {option.event_end ? ` – ${option.event_end}` : ""}
          </span>
        </div>
      )}

      {/* Location */}
      {option.location.address && (
        <div className="flex items-start gap-1.5 text-xs text-zinc-500 mb-3">
          <MapPin className="w-3 h-3 flex-shrink-0 mt-0.5" />
          <span className="line-clamp-1">{option.location.address}</span>
        </div>
      )}

      {/* Badges */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "text-xs font-medium px-2 py-0.5 rounded-full",
            budgetClass
          )}
        >
          {option.budget_estimate || option.budget_tier}
        </span>
        <span className="flex items-center gap-1 text-xs text-zinc-500 bg-zinc-800/60 px-2 py-0.5 rounded-full">
          <Clock className="w-3 h-3" />
          {formatDuration(option.duration_minutes)}
        </span>
      </div>
    </motion.button>
  );
}

// ── ConflictResolver ─────────────────────────────────────────────

export function ConflictResolver({ conflicts, onResolved, isResolving = false }: ConflictResolverProps) {
  const [selections, setSelections] = useState<Record<number, string>>({});

  const allResolved = conflicts.every((_, i) => selections[i] !== undefined);

  const handleSelect = (conflictIndex: number, optionId: string) => {
    if (isResolving) return;
    setSelections((prev) => ({ ...prev, [conflictIndex]: optionId }));
  };

  const handleConfirm = () => {
    if (isResolving) return;
    const winnerIds = Object.values(selections);
    onResolved(winnerIds);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 border-b border-zinc-800/60">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <h2 className="text-lg font-bold text-zinc-100">Scheduling Conflict</h2>
        </div>
        <p className="text-sm text-zinc-400 leading-relaxed">
          Two events overlap at the same time. Please choose one for each
          conflict.
        </p>
      </div>

      {/* Conflicts list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-8 pb-24">
        {conflicts.map((conflict, i) => {
          const selectedId = selections[i];

          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.1 }}
              className="space-y-3"
            >
              {/* Conflict header */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-zinc-800" />
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                    Conflict {conflicts.length > 1 ? i + 1 : ""}
                  </span>
                  <span className="text-sm font-medium text-zinc-300">
                    {formatConflictDate(conflict.date)}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-zinc-500">
                    <Clock className="w-3 h-3" />
                    {conflict.time_slot}
                  </span>
                </div>
                <div className="flex-1 h-px bg-zinc-800" />
              </div>

              {/* Option cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {conflict.options.map((option) => (
                  <OptionCard
                    key={option.id}
                    option={option}
                    isSelected={selectedId === option.id}
                    isDimmed={
                      selectedId !== undefined && selectedId !== option.id
                    }
                    onSelect={() => handleSelect(i, option.id)}
                  />
                ))}
              </div>

              {/* Resolution status */}
              <AnimatePresence>
                {selectedId && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-1.5 text-xs text-violet-400"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Conflict resolved
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 px-4 py-3 bg-zinc-950/90 backdrop-blur-md border-t border-zinc-800/60 flex items-center justify-between z-20">
        <span className="text-sm text-zinc-400">
          <span className="font-semibold text-zinc-200">
            {Object.keys(selections).length}
          </span>{" "}
          / {conflicts.length} resolved
        </span>
        <button
          onClick={handleConfirm}
          disabled={!allResolved || isResolving}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
            allResolved && !isResolving
              ? "bg-violet-500 hover:bg-violet-400 text-white shadow-lg shadow-violet-500/25"
              : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
          )}
        >
          {isResolving ? (
            <>
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Building your trip...
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              Confirm Choices
            </>
          )}
        </button>
      </div>
    </div>
  );
}
