"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Accessibility,
  Navigation,
  GitBranch,
  Sparkles,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Circle,
  CheckSquare,
  ArrowRight,
  Footprints,
  Train,
  Car,
  Ticket,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Itinerary, ItineraryNode, BookingLink, TransportOption } from "@/types";

// ============================================================
// BranchingTimeline — The core "Decision Tree" UI
// ============================================================

interface BranchingTimelineProps {
  itinerary: Itinerary;
  onNodeSelect?: (nodeId: string) => void;
  onBranchSwitch?: (nodeId: string, branchLabel: string) => void;
  // Selection mode
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  // onToggle receives the clicked nodeId + ALL nodeIds in the same slot (primary + alternatives)
  // so the caller can enforce one-selection-per-slot (radio behavior)
  onToggle?: (nodeId: string, slotNodeIds: string[]) => void;
  onFinalize?: () => void;
  isFinalizing?: boolean;
  className?: string;
}

const NODE_TYPE_ICONS: Record<string, string> = {
  activity: "🎯",
  meal: "🍜",
  transport: "🚇",
  accommodation: "🏨",
  event: "🎭",
  rest: "☕",
  pivot: "🔄",
};

const BUDGET_COLORS: Record<string, string> = {
  budget: "text-emerald-400 bg-emerald-400/10",
  "mid-range": "text-blue-400 bg-blue-400/10",
  premium: "text-violet-400 bg-violet-400/10",
  luxury: "text-amber-400 bg-amber-400/10",
};

// ── Timezone utilities ────────────────────────────────────────
const DEST_TO_IANA: Array<[string, string]> = [
  ["tokyo", "Asia/Tokyo"], ["japan", "Asia/Tokyo"], ["osaka", "Asia/Tokyo"], ["kyoto", "Asia/Tokyo"],
  ["london", "Europe/London"], ["uk", "Europe/London"], ["england", "Europe/London"],
  ["paris", "Europe/Paris"], ["france", "Europe/Paris"],
  ["berlin", "Europe/Berlin"], ["germany", "Europe/Berlin"],
  ["rome", "Europe/Rome"], ["italy", "Europe/Rome"],
  ["madrid", "Europe/Madrid"], ["spain", "Europe/Madrid"],
  ["amsterdam", "Europe/Amsterdam"],
  ["new york", "America/New_York"], ["nyc", "America/New_York"], ["boston", "America/New_York"], ["miami", "America/New_York"],
  ["chicago", "America/Chicago"],
  ["los angeles", "America/Los_Angeles"], ["seattle", "America/Los_Angeles"], ["san francisco", "America/Los_Angeles"],
  ["denver", "America/Denver"],
  ["dubai", "Asia/Dubai"], ["uae", "Asia/Dubai"],
  ["singapore", "Asia/Singapore"],
  ["bangkok", "Asia/Bangkok"], ["thailand", "Asia/Bangkok"],
  ["sydney", "Australia/Sydney"], ["melbourne", "Australia/Sydney"], ["australia", "Australia/Sydney"],
  ["auckland", "Pacific/Auckland"], ["new zealand", "Pacific/Auckland"],
  ["beijing", "Asia/Shanghai"], ["shanghai", "Asia/Shanghai"], ["china", "Asia/Shanghai"],
  ["hong kong", "Asia/Hong_Kong"],
  ["seoul", "Asia/Seoul"], ["korea", "Asia/Seoul"],
  ["mumbai", "Asia/Kolkata"], ["delhi", "Asia/Kolkata"], ["india", "Asia/Kolkata"],
  ["istanbul", "Europe/Istanbul"], ["turkey", "Europe/Istanbul"],
  ["toronto", "America/Toronto"], ["canada", "America/Toronto"],
  ["vancouver", "America/Vancouver"],
];

function destToIANA(destination: string): string {
  const lower = destination.toLowerCase();
  for (const [key, iana] of DEST_TO_IANA) {
    if (lower.includes(key)) return iana;
  }
  return "UTC";
}

function getTZAbbr(ianaTimezone: string, date: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZoneName: "short", timeZone: ianaTimezone }).formatToParts(date);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch { return ""; }
}

function formatInTZ(date: Date, ianaTimezone: string): string {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: ianaTimezone });
}

function buildTimeDisplay(iso: string, destIANA: string): { time: string; tzAbbr: string } {
  const date = new Date(iso);
  return { time: formatInTZ(date, destIANA), tzAbbr: getTZAbbr(destIANA, date) };
}

function parseISODate(iso: string): string {
  if (!iso) return "";
  return iso.split("T")[0];
}

function formatDayHeader(dateStr: string, dayIndex: number): string {
  if (!dateStr) return `Day ${dayIndex + 1}`;
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  } catch { return `Day ${dayIndex + 1}`; }
}

// ── Transport tag computation ─────────────────────────────────
// Parse a human-readable cost string to a comparable number.
// "Free" → 0, "¥200" → 200, "~¥1,500–3,000" → 1500, "$5.50" → 5
function parseCost(costStr: string | undefined): number {
  if (!costStr) return Infinity;
  const lower = costStr.toLowerCase().trim();
  if (lower === "free" || lower === "¥0" || lower === "$0" || lower === "€0") return 0;
  const match = lower.match(/[\d][0-9,]*/);
  if (!match) return Infinity;
  return parseInt(match[0].replace(/,/g, ""), 10);
}

// Derive fastest/cheapest from actual data — never trust LLM-provided tags.
// Returns per-index flags so the UI can annotate correctly.
export function computeTransportTags(
  options: TransportOption[]
): { fastest: boolean; cheapest: boolean }[] {
  if (options.length === 0) return [];

  const durations = options.map((o) => o.duration_minutes ?? Infinity);
  const costs = options.map((o) => parseCost(o.cost_estimate));

  const minDuration = Math.min(...durations);
  const minCost = Math.min(...costs);

  return options.map((_, i) => ({
    fastest: durations[i] === minDuration,
    // cheapest only meaningful if at least one option has a known cost
    cheapest: costs[i] === minCost && minCost !== Infinity,
  }));
}

// ── Transport connector between two activities ────────────────
const TRANSPORT_MODE_ICONS: Record<string, React.ReactNode> = {
  walk: <Footprints className="w-3.5 h-3.5" />,
  train: <Train className="w-3.5 h-3.5" />,
  subway: <Train className="w-3.5 h-3.5" />,
  bus: <Train className="w-3.5 h-3.5" />,
  taxi: <Car className="w-3.5 h-3.5" />,
  uber: <Car className="w-3.5 h-3.5" />,
};

function TransportConnector({
  node,
  destIANA,
}: {
  node: ItineraryNode;
  destIANA: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const options: TransportOption[] = node.transport_options ?? [];
  const timeDisplay = node.start_time ? buildTimeDisplay(node.start_time, destIANA) : null;
  // Compute tags from real data — never trust LLM-provided tags
  const computedTags = computeTransportTags(options);

  // Pick the first 3 options for the collapsed summary
  const summary = options.slice(0, 3);

  return (
    <div className="relative flex items-stretch gap-3 py-1 my-1">
      {/* Vertical stem */}
      <div className="flex flex-col items-center w-7 shrink-0">
        <div className="w-px flex-1 bg-zinc-800" />
        <div className="w-5 h-5 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center shrink-0">
          <ArrowRight className="w-2.5 h-2.5 text-zinc-600" />
        </div>
        <div className="w-px flex-1 bg-zinc-800" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 py-1">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full text-left"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-zinc-500 font-medium">{node.title}</span>
            {timeDisplay && (
              <span className="text-xs text-zinc-700">
                {timeDisplay.time} {timeDisplay.tzAbbr}
              </span>
            )}
            {summary.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {summary.map((opt, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-full px-2 py-0.5"
                  >
                    {TRANSPORT_MODE_ICONS[opt.mode] ?? <ArrowRight className="w-3 h-3" />}
                    {opt.duration_minutes}min
                    {opt.cost_estimate && opt.cost_estimate !== "Free" && (
                      <span className="text-zinc-600">· {opt.cost_estimate}</span>
                    )}
                  </span>
                ))}
              </div>
            )}
            {options.length > 0 && (
              <span className="ml-auto text-zinc-700">
                {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </span>
            )}
          </div>
        </button>

        <AnimatePresence>
          {expanded && options.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden mt-2"
            >
              <div className="space-y-1.5 pl-1">
                {options.map((opt, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 py-1.5 px-3 rounded-xl bg-zinc-900/60 border border-zinc-800/60"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-zinc-500 shrink-0">
                        {TRANSPORT_MODE_ICONS[opt.mode] ?? <ArrowRight className="w-3.5 h-3.5" />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs text-zinc-300 font-medium truncate">{opt.label}</p>
                        <p className="text-xs text-zinc-600">
                          {opt.duration_minutes}min
                          {opt.cost_estimate ? ` · ${opt.cost_estimate}` : ""}
                          {opt.accessibility_note ? ` · ♿ ${opt.accessibility_note}` : ""}
                        </p>
                      </div>
                    </div>
                    {computedTags[i]?.fastest && (
                      <span className="text-xs text-blue-400 shrink-0">Fastest</span>
                    )}
                    {computedTags[i]?.cheapest && (
                      <span className="text-xs text-emerald-400 shrink-0">Cheapest</span>
                    )}
                    {opt.booking_link && (
                      <a
                        href={opt.booking_link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors border border-zinc-700"
                      >
                        {opt.booking_link.label ?? "Go"}
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Booking link chip ─────────────────────────────────────────
function BookingLinkChip({ link }: { link: BookingLink }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors border border-zinc-700 hover:border-zinc-500"
    >
      {link.label}
      <ExternalLink className="w-3 h-3 opacity-60" />
    </a>
  );
}

// ── Activity node card ────────────────────────────────────────
function NodeCard({
  node,
  isActive,
  isAlternative,
  onSelect,
  onExpand,
  isExpanded,
  destIANA,
  selectionMode,
  isSelected,
  onToggle,
}: {
  node: ItineraryNode;
  isActive: boolean;
  isAlternative?: boolean;
  onSelect?: () => void;
  onExpand?: () => void;
  isExpanded: boolean;
  destIANA: string;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggle?: () => void;
}) {
  const timeDisplay = node.start_time ? buildTimeDisplay(node.start_time, destIANA) : null;
  const isEvent = node.type === "event";
  const ticketLinks = isEvent ? (node.booking_links ?? []).filter((l) => l.category === "event") : [];
  const otherLinks = isEvent ? (node.booking_links ?? []).filter((l) => l.category !== "event") : (node.booking_links ?? []);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: isAlternative ? 20 : 0, y: isAlternative ? 0 : 10 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      className={cn(
        "relative rounded-2xl border transition-all duration-200 overflow-hidden",
        isEvent && !selectionMode && !isSelected
          ? "border-amber-500/40 bg-amber-500/5 shadow-lg shadow-amber-500/5"
          : isActive && !selectionMode
          ? "border-violet-500/50 bg-zinc-900/80 shadow-lg shadow-violet-500/10"
          : isSelected
          ? "border-violet-500/60 bg-violet-500/5 shadow-md shadow-violet-500/10"
          : isAlternative
          ? "border-zinc-700/50 bg-zinc-900/40 hover:border-zinc-600 hover:bg-zinc-900/60"
          : "border-zinc-800/50 bg-zinc-900/60 hover:border-zinc-700",
        node.is_pivot && !isEvent && "border-amber-500/40 bg-amber-500/5",
        selectionMode && !isAlternative && "cursor-pointer"
      )}
      onClick={selectionMode && !isAlternative && onToggle ? onToggle : undefined}
    >
      {/* Active indicator */}
      {isActive && !selectionMode && !isEvent && (
        <div className="absolute inset-y-0 left-0 w-0.5 bg-gradient-to-b from-violet-500 to-indigo-500 rounded-full" />
      )}
      {/* Event glow bar */}
      {isEvent && (
        <div className="absolute inset-y-0 left-0 w-0.5 bg-gradient-to-b from-amber-400 to-orange-500 rounded-full" />
      )}

      <div className="p-4">
        {/* Event banner — shown above content for ticketed events */}
        {isEvent && ticketLinks.length > 0 && !selectionMode && (
          <div className="flex items-center justify-between gap-2 mb-3 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-center gap-2 min-w-0">
              <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-xs font-semibold text-amber-300 truncate">Live event on your visit date</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
              {ticketLinks.slice(0, 2).map((link, i) => (
                <a
                  key={i}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-black transition-colors"
                >
                  <Ticket className="w-3 h-3" />
                  {link.label ?? "Buy Tickets"}
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-start gap-3">
          {/* Checkbox in selection mode (only for primary nodes) */}
          {selectionMode && !isAlternative && (
            <div className="shrink-0 mt-0.5">
              {isSelected
                ? <CheckCircle2 className="w-5 h-5 text-violet-400" />
                : <Circle className="w-5 h-5 text-zinc-600" />}
            </div>
          )}

          <div className="text-2xl shrink-0 mt-0.5">
            {NODE_TYPE_ICONS[node.type] || "📍"}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                {node.branch_label && node.branch_label !== "A" && (
                  <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide mr-2">
                    {node.branch_label}
                  </span>
                )}
                <h3 className={cn(
                  "font-semibold leading-tight",
                  isEvent ? "text-amber-100" : isActive ? "text-white" : "text-zinc-200"
                )}>
                  {node.title}
                </h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {node.is_pivot && !isEvent && (
                  <span className="flex items-center gap-1 text-xs text-amber-400">
                    <AlertTriangle className="w-3 h-3" /> Pivot
                  </span>
                )}
                {isEvent && (
                  <span className="flex items-center gap-1 text-xs text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
                    <Ticket className="w-3 h-3" /> Event
                  </span>
                )}
                {node.budget_tier && (
                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", BUDGET_COLORS[node.budget_tier])}>
                    {node.budget_estimate || node.budget_tier}
                  </span>
                )}
              </div>
            </div>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-zinc-500">
              {timeDisplay && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 shrink-0" />
                  {timeDisplay.time}
                  {timeDisplay.tzAbbr && <span className="text-zinc-600">{timeDisplay.tzAbbr}</span>}
                  <span className="text-zinc-600">· {node.duration_minutes}min</span>
                </span>
              )}
              {node.location?.address && (
                <span className="flex items-center gap-1 truncate max-w-[200px]">
                  <MapPin className="w-3 h-3 shrink-0" />
                  {node.location.address}
                </span>
              )}
              {node.accessibility_verified && (
                <span className="flex items-center gap-1 text-emerald-500">
                  <Accessibility className="w-3 h-3" /> Accessible
                </span>
              )}
            </div>

            {node.why_selected && (
              <div className="flex items-start gap-1.5 mt-2 text-xs text-violet-400/80 italic">
                <Sparkles className="w-3 h-3 shrink-0 mt-0.5" />
                <span>{node.why_selected}</span>
              </div>
            )}
          </div>
        </div>

        {/* Expand / details (hidden in selection mode) */}
        {!selectionMode && (
          <>
            <button
              onClick={onExpand}
              className="w-full flex items-center justify-between mt-3 pt-3 border-t border-zinc-800/60 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <span className="text-xs">
                {node.booking_links?.length
                  ? `${node.booking_links.length} link${node.booking_links.length > 1 ? "s" : ""}${isEvent && ticketLinks.length ? ` · ${ticketLinks.length} ticket option${ticketLinks.length > 1 ? "s" : ""}` : ""}`
                  : "Details"}
              </span>
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>

            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="pt-3 space-y-3">
                    {node.description && (
                      <p className="text-sm text-zinc-400 leading-relaxed">{node.description}</p>
                    )}
                    {node.accessibility_notes && (
                      <div className="flex items-start gap-2 text-xs text-emerald-400 bg-emerald-400/5 rounded-lg p-2.5">
                        <Accessibility className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{node.accessibility_notes}</span>
                      </div>
                    )}
                    {node.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {node.tags.map((tag) => (
                          <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Ticket links — prominent section for events */}
                    {isEvent && ticketLinks.length > 0 && (
                      <div>
                        <p className="text-xs text-amber-400/80 mb-2 font-semibold uppercase tracking-wide flex items-center gap-1">
                          <Ticket className="w-3 h-3" /> Buy Tickets
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {ticketLinks.map((link, i) => (
                            <a
                              key={i}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 hover:text-amber-200 transition-colors border border-amber-500/30 hover:border-amber-500/50"
                            >
                              <Ticket className="w-3 h-3" />
                              {link.label}
                              <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Other links */}
                    {otherLinks.length > 0 && (
                      <div>
                        <p className="text-xs text-zinc-500 mb-2 font-medium uppercase tracking-wide">
                          {isEvent ? "Venue / Maps" : "Book / Navigate"}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {otherLinks.map((link, i) => (
                            <BookingLinkChip key={i} link={link} />
                          ))}
                        </div>
                      </div>
                    )}

                    {!isActive && (
                      <button
                        onClick={onSelect}
                        className="w-full mt-1 py-2 px-4 rounded-xl bg-violet-600/20 hover:bg-violet-600/30 text-violet-400 hover:text-violet-300 text-sm font-medium transition-colors border border-violet-500/20 hover:border-violet-500/40"
                      >
                        Switch to this plan
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────
export function BranchingTimeline({
  itinerary,
  onNodeSelect,
  onBranchSwitch,
  selectionMode = false,
  selectedIds = new Set(),
  onToggle,
  onFinalize,
  isFinalizing = false,
  className,
}: BranchingTimelineProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const destIANA = destToIANA(itinerary.destination ?? "");

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
      return next;
    });
  };

  // Build child map (branch alternatives)
  const childMap = new Map<string, ItineraryNode[]>();
  itinerary.nodes?.forEach((n) => {
    if (n.parent_id) {
      const children = childMap.get(n.parent_id) || [];
      children.push(n);
      childMap.set(n.parent_id, children);
    }
  });

  // Root nodes sorted chronologically
  const rootNodes = (itinerary.nodes?.filter((n) => !n.parent_id) || []).sort((a, b) => {
    const ta = a.start_time ?? "";
    const tb = b.start_time ?? "";
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });

  // Split: transport vs activity root nodes
  const isTransportNode = (n: ItineraryNode) => n.type === "transport";

  // Group root nodes by date for multi-day display
  const dateGroups = new Map<string, ItineraryNode[]>();
  for (const node of rootNodes) {
    const dateKey = parseISODate(node.start_time) || "unknown";
    const group = dateGroups.get(dateKey) || [];
    group.push(node);
    dateGroups.set(dateKey, group);
  }
  const sortedDates = Array.from(dateGroups.keys()).sort();
  const isMultiDay = sortedDates.length > 1;

  // Activity root nodes (not transport) for selection count
  const activityRootNodes = rootNodes.filter((n) => !isTransportNode(n));

  if (!rootNodes.length) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-16 text-zinc-600", className)}>
        <GitBranch className="w-8 h-8 mb-3 opacity-40" />
        <p className="text-sm">No itinerary yet. Ask Planit to plan your day!</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-1 pb-20", className)}>
      {/* Timeline header */}
      <div className="flex items-center gap-2 mb-4 px-1">
        <Navigation className="w-4 h-4 text-violet-400" />
        <h2 className="text-sm font-semibold text-zinc-300">{itinerary.title}</h2>
        <span className="text-xs text-zinc-600">·</span>
        <span className="text-xs text-zinc-500">{itinerary.destination}</span>
      </div>

      {sortedDates.map((dateKey, dayIndex) => {
        const dayNodes = dateGroups.get(dateKey)!;
        const dayLabel = formatDayHeader(dateKey, dayIndex);

        return (
          <div key={dateKey} className="space-y-1">
            {isMultiDay && (
              <div className="flex items-center gap-2 py-2 px-1 mt-4 first:mt-0">
                <Calendar className="w-3.5 h-3.5 text-violet-400/70" />
                <span className="text-xs font-semibold text-violet-400/80 uppercase tracking-wider">
                  Day {dayIndex + 1} · {dayLabel}
                </span>
                <div className="flex-1 h-px bg-zinc-800/60" />
              </div>
            )}

            {dayNodes.map((node, index) => {
              const isTransport = isTransportNode(node);
              const isLastInDay = index === dayNodes.length - 1;

              if (isTransport) {
                return <TransportConnector key={node.id} node={node} destIANA={destIANA} />;
              }

              const alternatives = childMap.get(node.id) || [];
              const isActive = node.is_active;
              // All IDs in this slot (primary + alternatives) for radio-group behavior
              const slotNodeIds = [node.id, ...alternatives.map((a) => a.id)];

              return (
                <div key={node.id} className="relative">
                  {!isLastInDay && !isTransportNode(dayNodes[index + 1] ?? {} as ItineraryNode) && (
                    <div className="absolute left-7 top-full w-0.5 h-3 bg-zinc-800 z-10" />
                  )}

                  <NodeCard
                    node={node}
                    isActive={isActive}
                    isExpanded={expandedNodes.has(node.id)}
                    onSelect={() => onNodeSelect?.(node.id)}
                    onExpand={() => toggleExpand(node.id)}
                    destIANA={destIANA}
                    selectionMode={selectionMode}
                    isSelected={selectedIds.has(node.id)}
                    onToggle={() => onToggle?.(node.id, slotNodeIds)}
                  />

                  {/* Alternatives — full cards outside selection, compact radio in selection mode */}
                  {alternatives.length > 0 && (
                    <div className="ml-6 mt-2 space-y-2 relative">
                      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-zinc-800/60 rounded-full" />

                      {!selectionMode && (
                        <div className="flex items-center gap-1.5 pl-3 mb-1">
                          <GitBranch className="w-3 h-3 text-zinc-600" />
                          <span className="text-xs text-zinc-600">Alternatives</span>
                        </div>
                      )}

                      {alternatives.map((alt) =>
                        selectionMode ? (
                          // Compact radio option in selection mode
                          <button
                            key={alt.id}
                            onClick={() => onToggle?.(alt.id, slotNodeIds)}
                            className={cn(
                              "w-full flex items-center gap-2.5 pl-3 pr-3 py-2.5 rounded-xl border text-left transition-all",
                              selectedIds.has(alt.id)
                                ? "border-violet-500/60 bg-violet-500/5"
                                : "border-zinc-800/50 bg-zinc-900/40 hover:border-zinc-700"
                            )}
                          >
                            {selectedIds.has(alt.id)
                              ? <CheckCircle2 className="w-4 h-4 text-violet-400 shrink-0" />
                              : <Circle className="w-4 h-4 text-zinc-600 shrink-0" />}
                            <span className="text-xs font-semibold text-zinc-500 shrink-0 uppercase">
                              {alt.branch_label || "Alt"}
                            </span>
                            <span className="text-sm text-zinc-300 truncate flex-1">{alt.title}</span>
                            {alt.budget_estimate && (
                              <span className={cn("text-xs shrink-0", BUDGET_COLORS[alt.budget_tier]?.split(" ")[0])}>
                                {alt.budget_estimate}
                              </span>
                            )}
                          </button>
                        ) : (
                          <div key={alt.id} className="pl-3">
                            <NodeCard
                              node={alt}
                              isActive={alt.is_active}
                              isAlternative
                              isExpanded={expandedNodes.has(alt.id)}
                              onSelect={() => { onNodeSelect?.(alt.id); onBranchSwitch?.(node.id, alt.branch_label || "B"); }}
                              onExpand={() => toggleExpand(alt.id)}
                              destIANA={destIANA}
                            />
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Sticky finalize CTA in selection mode */}
      <AnimatePresence>
        {selectionMode && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl shadow-black/60 px-5 py-3">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-violet-400" />
                <span className="text-sm text-zinc-300">
                  {selectedIds.size === 0
                    ? "Select activities to build your plan"
                    : `${selectedIds.size} activit${selectedIds.size === 1 ? "y" : "ies"} selected`}
                </span>
              </div>
              {selectedIds.size > 0 && (
                <button
                  onClick={onFinalize}
                  disabled={isFinalizing}
                  className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                >
                  {isFinalizing ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Planning…
                    </>
                  ) : (
                    <>
                      Plan with these
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
