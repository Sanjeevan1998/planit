"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin,
  Clock,
  DollarSign,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Accessibility,
  Info,
  Navigation,
  GitBranch,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Itinerary, ItineraryNode, BookingLink } from "@/types";

// ============================================================
// BranchingTimeline — The core "Decision Tree" UI
// Renders the itinerary as a visual branching timeline.
// Users can click branches to switch the active plan.
// ============================================================

interface BranchingTimelineProps {
  itinerary: Itinerary;
  onNodeSelect?: (nodeId: string) => void;
  onBranchSwitch?: (nodeId: string, branchLabel: string) => void;
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

function NodeCard({
  node,
  isActive,
  isAlternative,
  onSelect,
  onExpand,
  isExpanded,
}: {
  node: ItineraryNode;
  isActive: boolean;
  isAlternative?: boolean;
  onSelect?: () => void;
  onExpand?: () => void;
  isExpanded: boolean;
}) {
  const startTime = node.start_time
    ? new Date(node.start_time).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: isAlternative ? 20 : 0, y: isAlternative ? 0 : 10 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      className={cn(
        "relative rounded-2xl border transition-all duration-200 overflow-hidden",
        isActive
          ? "border-violet-500/50 bg-zinc-900/80 shadow-lg shadow-violet-500/10"
          : isAlternative
          ? "border-zinc-700/50 bg-zinc-900/40 hover:border-zinc-600 hover:bg-zinc-900/60"
          : "border-zinc-800/50 bg-zinc-900/60 hover:border-zinc-700",
        node.is_pivot && "border-amber-500/40 bg-amber-500/5"
      )}
    >
      {/* Active indicator */}
      {isActive && (
        <div className="absolute inset-y-0 left-0 w-0.5 bg-gradient-to-b from-violet-500 to-indigo-500 rounded-full" />
      )}

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start gap-3">
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
                <h3
                  className={cn(
                    "font-semibold leading-tight",
                    isActive ? "text-white" : "text-zinc-200"
                  )}
                >
                  {node.title}
                </h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {node.is_pivot && (
                  <span className="flex items-center gap-1 text-xs text-amber-400">
                    <AlertTriangle className="w-3 h-3" />
                    Pivot
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
              {startTime && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {startTime} · {node.duration_minutes}min
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
                  <Accessibility className="w-3 h-3" />
                  Accessible
                </span>
              )}
            </div>

            {/* Why selected chip */}
            {node.why_selected && (
              <div className="flex items-start gap-1.5 mt-2 text-xs text-violet-400/80 italic">
                <Sparkles className="w-3 h-3 shrink-0 mt-0.5" />
                <span>{node.why_selected}</span>
              </div>
            )}
          </div>
        </div>

        {/* Expand button */}
        <button
          onClick={onExpand}
          className="w-full flex items-center justify-between mt-3 pt-3 border-t border-zinc-800/60 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <span className="text-xs">
            {node.booking_links?.length
              ? `${node.booking_links.length} booking link${node.booking_links.length > 1 ? "s" : ""}`
              : "Details"}
          </span>
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Expanded details */}
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
                {/* Description */}
                {node.description && (
                  <p className="text-sm text-zinc-400 leading-relaxed">{node.description}</p>
                )}

                {/* Accessibility notes */}
                {node.accessibility_notes && (
                  <div className="flex items-start gap-2 text-xs text-emerald-400 bg-emerald-400/5 rounded-lg p-2.5">
                    <Accessibility className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{node.accessibility_notes}</span>
                  </div>
                )}

                {/* Tags */}
                {node.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {node.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Booking links */}
                {node.booking_links?.length > 0 && (
                  <div>
                    <p className="text-xs text-zinc-500 mb-2 font-medium uppercase tracking-wide">
                      Book / Navigate
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {node.booking_links.map((link, i) => (
                        <BookingLinkChip key={i} link={link} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Select branch button */}
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
      </div>
    </motion.div>
  );
}

export function BranchingTimeline({
  itinerary,
  onNodeSelect,
  onBranchSwitch,
  className,
}: BranchingTimelineProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  // Group nodes: primary path (branch_label "A" or null) + alternatives
  const rootNodes = itinerary.nodes?.filter((n) => !n.parent_id) || [];
  const childMap = new Map<string, ItineraryNode[]>();

  itinerary.nodes?.forEach((n) => {
    if (n.parent_id) {
      const children = childMap.get(n.parent_id) || [];
      children.push(n);
      childMap.set(n.parent_id, children);
    }
  });

  if (!rootNodes.length) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-16 text-zinc-600", className)}>
        <GitBranch className="w-8 h-8 mb-3 opacity-40" />
        <p className="text-sm">No itinerary yet. Ask Planit to plan your day!</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-1", className)}>
      {/* Timeline header */}
      <div className="flex items-center gap-2 mb-4 px-1">
        <Navigation className="w-4 h-4 text-violet-400" />
        <h2 className="text-sm font-semibold text-zinc-300">{itinerary.title}</h2>
        <span className="text-xs text-zinc-600">·</span>
        <span className="text-xs text-zinc-500">{itinerary.destination}</span>
      </div>

      {rootNodes.map((node, index) => {
        const alternatives = childMap.get(node.id) || [];
        const isActive = node.is_active;

        return (
          <div key={node.id} className="relative">
            {/* Vertical connector line */}
            {index < rootNodes.length - 1 && (
              <div className="absolute left-7 top-full w-0.5 h-3 bg-zinc-800 z-10" />
            )}

            {/* Primary node */}
            <NodeCard
              node={node}
              isActive={isActive}
              isExpanded={expandedNodes.has(node.id)}
              onSelect={() => onNodeSelect?.(node.id)}
              onExpand={() => toggleExpand(node.id)}
            />

            {/* Branch alternatives */}
            {alternatives.length > 0 && (
              <div className="ml-6 mt-2 space-y-2 relative">
                {/* Branch line */}
                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-zinc-800/60 rounded-full" />

                <div className="flex items-center gap-1.5 pl-3 mb-1">
                  <GitBranch className="w-3 h-3 text-zinc-600" />
                  <span className="text-xs text-zinc-600">Alternatives</span>
                </div>

                {alternatives.map((alt) => (
                  <div key={alt.id} className="pl-3">
                    <NodeCard
                      node={alt}
                      isActive={alt.is_active}
                      isAlternative
                      isExpanded={expandedNodes.has(alt.id)}
                      onSelect={() => {
                        onNodeSelect?.(alt.id);
                        onBranchSwitch?.(node.id, alt.branch_label || "B");
                      }}
                      onExpand={() => toggleExpand(alt.id)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
