"use client";

import { motion } from "framer-motion";
import { Search, Calendar, UtensilsCrossed, Map } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────

interface BuildingSpinnerProps {
  step: "building" | "adding_food" | "finalizing" | "suggesting";
}

// ── Step config ──────────────────────────────────────────────────

const STEP_CONFIG = {
  suggesting: {
    icon: Search,
    message: "Searching for activities and events...",
    subtext: "Using Google Search for real-time data",
    color: "text-violet-400",
    ringColor: "border-violet-500",
  },
  building: {
    icon: Calendar,
    message: "Scheduling your activities across the days...",
    subtext: "Optimising for timing and travel distance",
    color: "text-violet-400",
    ringColor: "border-violet-500",
  },
  adding_food: {
    icon: UtensilsCrossed,
    message: "Finding authentic local food spots...",
    subtext: "Sourcing non-tourist restaurants from local guides",
    color: "text-emerald-400",
    ringColor: "border-emerald-500",
  },
  finalizing: {
    icon: Map,
    message: "Mapping your route and adding transport...",
    subtext: "Calculating walking routes and transit options",
    color: "text-blue-400",
    ringColor: "border-blue-500",
  },
} as const;

// ── BuildingSpinner ──────────────────────────────────────────────

export function BuildingSpinner({ step }: BuildingSpinnerProps) {
  const config = STEP_CONFIG[step];
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col items-center justify-center min-h-[60vh] px-4 py-12"
    >
      {/* Spinner + icon */}
      <div className="relative mb-8">
        {/* Outer spinning ring */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
          className={cn(
            "w-20 h-20 rounded-full border-4 border-transparent",
            config.ringColor,
            "border-t-transparent"
          )}
          style={{ borderTopColor: "transparent" }}
        />

        {/* Inner pulsing icon */}
        <motion.div
          animate={{ scale: [0.95, 1.05, 0.95] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <Icon className={cn("w-7 h-7", config.color)} />
        </motion.div>
      </div>

      {/* Message */}
      <motion.div
        key={step}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="text-center space-y-2"
      >
        <p className="text-base font-semibold text-zinc-200">
          {config.message}
        </p>
        <p className="text-sm text-zinc-500">{config.subtext}</p>
      </motion.div>

      {/* Animated dots */}
      <div className="flex items-center gap-1.5 mt-6">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.2,
              ease: "easeInOut",
            }}
            className={cn("w-1.5 h-1.5 rounded-full", {
              "bg-violet-400": step === "suggesting" || step === "building",
              "bg-emerald-400": step === "adding_food",
              "bg-blue-400": step === "finalizing",
            })}
          />
        ))}
      </div>
    </motion.div>
  );
}
