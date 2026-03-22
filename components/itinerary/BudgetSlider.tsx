"use client";

import { cn } from "@/lib/utils";
import type { BudgetTier } from "@/types";

interface BudgetSliderProps {
  value: BudgetTier;
  onChange: (tier: BudgetTier) => void;
  className?: string;
}

const TIERS: { value: BudgetTier; label: string; emoji: string; description: string }[] = [
  { value: "budget", label: "Budget", emoji: "💰", description: "Free – $30/activity" },
  { value: "mid-range", label: "Mid-range", emoji: "🎯", description: "$30 – $100/activity" },
  { value: "premium", label: "Premium", emoji: "✨", description: "$100 – $300/activity" },
  { value: "luxury", label: "Luxury", emoji: "💎", description: "$300+/activity" },
];

export function BudgetSlider({ value, onChange, className }: BudgetSliderProps) {
  const currentIndex = TIERS.findIndex((t) => t.value === value);

  return (
    <div className={cn("space-y-3", className)}>
      {/* Segment control */}
      <div className="flex rounded-xl bg-zinc-800/60 p-1 gap-1">
        {TIERS.map((tier) => (
          <button
            key={tier.value}
            onClick={() => onChange(tier.value)}
            className={cn(
              "flex-1 flex flex-col items-center py-2 px-1 rounded-lg text-xs font-medium transition-all",
              value === tier.value
                ? "bg-violet-600 text-white shadow-lg shadow-violet-500/20"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50"
            )}
          >
            <span className="text-base mb-0.5">{tier.emoji}</span>
            <span>{tier.label}</span>
          </button>
        ))}
      </div>

      {/* Range slider */}
      <div className="relative px-1">
        <input
          type="range"
          min={0}
          max={3}
          value={currentIndex}
          onChange={(e) => onChange(TIERS[parseInt(e.target.value)].value)}
          className="w-full h-1.5 bg-zinc-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-500 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-lg"
          style={{
            background: `linear-gradient(to right, #7c3aed ${(currentIndex / 3) * 100}%, #3f3f46 ${(currentIndex / 3) * 100}%)`,
          }}
        />
        {/* Track labels */}
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-zinc-600">Budget</span>
          <span className="text-[10px] text-zinc-600">Luxury</span>
        </div>
      </div>

      {/* Current tier description */}
      {TIERS[currentIndex] && (
        <div className="text-center text-xs text-zinc-500">
          {TIERS[currentIndex].description}
        </div>
      )}
    </div>
  );
}
