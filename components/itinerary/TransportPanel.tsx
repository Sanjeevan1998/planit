"use client";

import { motion } from "framer-motion";
import { ExternalLink, Clock, Zap, DollarSign, Accessibility } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TransportOption } from "@/types";

const MODE_ICONS: Record<string, string> = {
  walk: "🚶",
  train: "🚇",
  subway: "🚇",
  bus: "🚌",
  taxi: "🚕",
  uber: "🚗",
  bike: "🚲",
  tram: "🚋",
  ferry: "⛴️",
  car_rental: "🚙",
};

const TAG_STYLES: Record<string, string> = {
  fastest: "bg-amber-400/10 text-amber-400 border-amber-400/20",
  cheapest: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  most_accessible: "bg-blue-400/10 text-blue-400 border-blue-400/20",
  eco: "bg-teal-400/10 text-teal-400 border-teal-400/20",
  scenic: "bg-violet-400/10 text-violet-400 border-violet-400/20",
};

const TAG_ICONS: Record<string, React.ReactNode> = {
  fastest: <Zap className="w-3 h-3" />,
  cheapest: <DollarSign className="w-3 h-3" />,
  most_accessible: <Accessibility className="w-3 h-3" />,
};

interface TransportPanelProps {
  options: TransportOption[];
  onSelect?: (option: TransportOption) => void;
  className?: string;
}

export function TransportPanel({ options, onSelect, className }: TransportPanelProps) {
  if (!options.length) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide px-1">
        Getting there
      </p>
      {options.map((opt, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 hover:border-zinc-700 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">{MODE_ICONS[opt.mode] || "🚀"}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-zinc-200 truncate">{opt.label}</span>
                {opt.tags?.map((tag) => (
                  <span
                    key={tag}
                    className={cn(
                      "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium",
                      TAG_STYLES[tag] || "bg-zinc-800 text-zinc-400 border-zinc-700"
                    )}
                  >
                    {TAG_ICONS[tag]}
                    {tag.replace("_", " ")}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {opt.duration_minutes}min
                </span>
                {opt.cost_estimate && <span>{opt.cost_estimate}</span>}
              </div>
              {opt.accessibility_note && (
                <p className="mt-1 text-xs text-blue-400/80 flex items-center gap-1">
                  <Accessibility className="w-3 h-3" />
                  {opt.accessibility_note}
                </p>
              )}
            </div>
            {opt.booking_link && (
              <a
                href={opt.booking_link.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onSelect?.(opt)}
                className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-medium transition-colors"
              >
                {opt.booking_link.platform}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
