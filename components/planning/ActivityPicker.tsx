"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  ExternalLink,
  Clock,
  MapPin,
  Ticket,
  Calendar,
} from "lucide-react";
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

interface CitySuggestions {
  city: string;
  date_range: { from: string; to: string };
  activities: ActivitySuggestion[];
  events: ActivitySuggestion[];
}

interface TripSuggestions {
  trip_title: string;
  destination: string;
  start_date: string;
  end_date: string;
  cities: CitySuggestions[];
}

interface ActivityPickerProps {
  suggestions: TripSuggestions;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onBuildTrip: () => void;
  isBuilding: boolean;
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

function formatEventDate(dateStr?: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatDateRange(from: string, to: string): string {
  const f = new Date(from + "T00:00:00");
  const t = new Date(to + "T00:00:00");
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (f.getFullYear() !== t.getFullYear()) {
    return `${f.toLocaleDateString("en-US", { ...opts, year: "numeric" })} – ${t.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
  }
  return `${f.toLocaleDateString("en-US", opts)} – ${t.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
}

// ── ActivityCard ─────────────────────────────────────────────────

interface ActivityCardProps {
  activity: ActivitySuggestion;
  isSelected: boolean;
  onToggle: (id: string) => void;
}

function ActivityCard({ activity, isSelected, onToggle }: ActivityCardProps) {
  const emoji = activity.type === "event" ? "🎭" : "🎯";
  const budgetClass =
    BUDGET_COLORS[activity.budget_tier] ?? "text-zinc-400 bg-zinc-400/10";

  return (
    <motion.button
      layout
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      onClick={() => onToggle(activity.id)}
      className={cn(
        "relative w-full text-left rounded-2xl border p-4 transition-all duration-200",
        "bg-zinc-900/60 hover:bg-zinc-800/60",
        isSelected
          ? "border-violet-500 ring-1 ring-violet-500/30 shadow-lg shadow-violet-500/10"
          : "border-zinc-800/50 hover:border-zinc-700"
      )}
    >
      {/* Selected overlay badge */}
      <AnimatePresence>
        {isSelected && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="absolute top-3 right-3 w-6 h-6 rounded-full bg-violet-500 flex items-center justify-center shadow-md"
          >
            <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-start gap-2 mb-2 pr-8">
        <span className="text-xl leading-none mt-0.5">{emoji}</span>
        <h3 className="font-semibold text-zinc-200 text-sm leading-snug">
          {activity.title}
        </h3>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap items-center gap-2 mb-2.5">
        <span
          className={cn(
            "text-xs font-medium px-2 py-0.5 rounded-full",
            budgetClass
          )}
        >
          {activity.budget_estimate || activity.budget_tier}
        </span>
        <span className="flex items-center gap-1 text-xs text-zinc-500 bg-zinc-800/60 px-2 py-0.5 rounded-full">
          <Clock className="w-3 h-3" />
          {formatDuration(activity.duration_minutes)}
        </span>
      </div>

      {/* Description */}
      <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2 mb-2">
        {activity.description}
      </p>

      {/* Why selected */}
      <p className="text-xs italic text-violet-400/80 leading-snug">
        ✦ {activity.why_selected}
      </p>
    </motion.button>
  );
}

// ── EventCard ────────────────────────────────────────────────────

interface EventCardProps {
  event: ActivitySuggestion;
  isSelected: boolean;
  onToggle: (id: string) => void;
}

function EventCard({ event, isSelected, onToggle }: EventCardProps) {
  const budgetClass =
    BUDGET_COLORS[event.budget_tier] ?? "text-zinc-400 bg-zinc-400/10";
  const ticketLink = event.booking_links.find((l) => l.category === "event");

  return (
    <motion.div
      layout
      className={cn(
        "rounded-2xl border transition-all duration-200",
        "bg-zinc-900/60",
        isSelected
          ? "border-amber-500/60 ring-1 ring-amber-500/20 shadow-lg shadow-amber-500/10"
          : "border-zinc-800/50 hover:border-amber-500/30"
      )}
    >
      <button
        onClick={() => onToggle(event.id)}
        className="w-full text-left p-4"
      >
        <div className="flex items-start justify-between gap-3">
          {/* Left: date + time */}
          <div className="flex-shrink-0 flex flex-col items-center bg-amber-400/10 border border-amber-400/20 rounded-xl px-3 py-2 min-w-[72px]">
            <span className="text-amber-300 text-xs font-semibold uppercase tracking-wide">
              {event.event_date
                ? formatEventDate(event.event_date).split(",")[0]
                : ""}
            </span>
            <span className="text-amber-200 text-base font-bold leading-none mt-0.5">
              {event.event_date
                ? formatEventDate(event.event_date).split(",")[1]?.trim()
                : ""}
            </span>
            {event.event_start && (
              <span className="text-amber-400/70 text-xs mt-1">
                {event.event_start}
                {event.event_end ? `–${event.event_end}` : ""}
              </span>
            )}
          </div>

          {/* Right: content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 mb-2">
              <span className="text-lg leading-none mt-0.5">🎭</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="font-semibold text-zinc-200 text-sm leading-snug">
                    {event.title}
                  </h3>
                  <span className="text-xs font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full">
                    LIVE EVENT
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-zinc-500 mb-1.5">
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{event.location.address}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "text-xs font-medium px-2 py-0.5 rounded-full",
                  budgetClass
                )}
              >
                {event.budget_estimate || event.budget_tier}
              </span>
            </div>
          </div>

          {/* Checkmark */}
          <div
            className={cn(
              "flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200",
              isSelected
                ? "bg-amber-500 border-amber-500"
                : "border-zinc-600 bg-transparent"
            )}
          >
            <AnimatePresence>
              {isSelected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                >
                  <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </button>

      {/* Ticket link */}
      {ticketLink && (
        <div className="px-4 pb-3">
          <a
            href={ticketLink.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/20 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Ticket className="w-3 h-3" />
            {ticketLink.label}
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </motion.div>
  );
}

// ── ActivityPicker ────────────────────────────────────────────────

export function ActivityPicker({
  suggestions,
  selectedIds,
  onToggle,
  onBuildTrip,
  isBuilding,
}: ActivityPickerProps) {
  const [activeCity, setActiveCity] = useState(
    suggestions.cities[0]?.city ?? ""
  );
  const [citySubTab, setCitySubTab] = useState<Record<string, "activities" | "events">>({});

  const selectedCount = selectedIds.size;

  const getSubTab = (city: string): "activities" | "events" =>
    citySubTab[city] ?? "activities";

  const setSubTab = (city: string, tab: "activities" | "events") => {
    setCitySubTab((prev) => ({ ...prev, [city]: tab }));
  };

  const activeData = suggestions.cities.find((c) => c.city === activeCity);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-zinc-800/60">
        <h1 className="text-lg font-bold text-zinc-100">{suggestions.trip_title}</h1>
        <div className="flex items-center gap-1.5 mt-1 text-sm text-zinc-400">
          <Calendar className="w-3.5 h-3.5" />
          <span>
            {formatDateRange(suggestions.start_date, suggestions.end_date)}
          </span>
        </div>
      </div>

      {/* City tabs */}
      {suggestions.cities.length > 1 && (
        <div className="flex items-center gap-1.5 px-4 pt-3 overflow-x-auto scrollbar-none">
          {suggestions.cities.map((c) => {
            const from = new Date(c.date_range.from + "T00:00:00");
            const to = new Date(c.date_range.to + "T00:00:00");
            const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
            return (
              <button
                key={c.city}
                onClick={() => setActiveCity(c.city)}
                className={cn(
                  "flex-shrink-0 flex flex-col items-center px-4 py-1.5 rounded-xl text-sm font-medium transition-all duration-200",
                  activeCity === c.city
                    ? "bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/40"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
                )}
              >
                <span>{c.city}</span>
                <span className="text-[10px] opacity-60 font-normal">{days}d · {c.date_range.from.slice(5)}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Sub-tabs: Activities / Events */}
      {activeData && (
        <div className="flex items-center gap-1 px-4 pt-3 pb-2">
          {(["activities", "events"] as const).map((tab) => {
            const count =
              tab === "activities"
                ? activeData.activities.length
                : activeData.events.length;
            return (
              <button
                key={tab}
                onClick={() => setSubTab(activeCity, tab)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 flex items-center gap-1.5",
                  getSubTab(activeCity) === tab
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                {tab === "activities" ? "🎯" : "🎭"}
                <span className="capitalize">{tab}</span>
                <span
                  className={cn(
                    "text-xs px-1.5 py-0.5 rounded-full",
                    getSubTab(activeCity) === tab
                      ? "bg-zinc-700 text-zinc-300"
                      : "bg-zinc-800/60 text-zinc-500"
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
          <span className="ml-auto text-xs text-zinc-500">
            {activeData.date_range &&
              formatDateRange(activeData.date_range.from, activeData.date_range.to)}
          </span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-24">
        <AnimatePresence mode="wait">
          {activeData && getSubTab(activeCity) === "activities" && (
            <motion.div
              key={`${activeCity}-activities`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2"
            >
              {activeData.activities.map((activity) => (
                <ActivityCard
                  key={activity.id}
                  activity={activity}
                  isSelected={selectedIds.has(activity.id)}
                  onToggle={onToggle}
                />
              ))}
              {activeData.activities.length === 0 && (
                <p className="col-span-2 text-center text-zinc-500 py-8 text-sm">
                  No activities available for this city.
                </p>
              )}
            </motion.div>
          )}

          {activeData && getSubTab(activeCity) === "events" && (
            <motion.div
              key={`${activeCity}-events`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col gap-3 pt-2"
            >
              {activeData.events.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  isSelected={selectedIds.has(event.id)}
                  onToggle={onToggle}
                />
              ))}
              {activeData.events.length === 0 && (
                <p className="text-center text-zinc-500 py-8 text-sm">
                  No events during this period.
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 px-4 py-3 bg-zinc-950/90 backdrop-blur-md border-t border-zinc-800/60 flex items-center justify-between z-20">
        <span className="text-sm text-zinc-400">
          <span className="font-semibold text-zinc-200">{selectedCount}</span>{" "}
          selected
        </span>
        <button
          onClick={onBuildTrip}
          disabled={selectedCount === 0 || isBuilding}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
            selectedCount > 0 && !isBuilding
              ? "bg-violet-500 hover:bg-violet-400 text-white shadow-lg shadow-violet-500/25"
              : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
          )}
        >
          {isBuilding ? "Building..." : "Build My Trip"}
          {!isBuilding && (
            <span className="text-base leading-none">→</span>
          )}
        </button>
      </div>
    </div>
  );
}
