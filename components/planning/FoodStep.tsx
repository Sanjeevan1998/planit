"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  ChevronDown,
  MapPin,
  Clock,
  Sparkles,
  UtensilsCrossed,
  SkipForward,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────

interface FoodSuggestion {
  id: string;
  city: string;
  title: string;
  description: string;
  location: { lat: number; lng: number; address: string };
  meal_type: "breakfast" | "lunch" | "dinner" | "snack";
  cuisine: string;
  must_try_dishes: string[];
  why_authentic: string;
  budget_tier: string;
  budget_estimate: string;
  tags: string[];
  accessibility_verified: boolean;
  booking_links: Array<{
    platform: string;
    url: string;
    label: string;
    category: string;
  }>;
  tips?: string;
}

interface FoodAskStepProps {
  onDecide: (choice: "ai" | "pick" | "skip") => void;
  isLoading?: boolean;
}

interface FoodPickerProps {
  suggestions: FoodSuggestion[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onConfirm: () => void;
  isAdding: boolean;
}

// ── Constants ────────────────────────────────────────────────────

const BUDGET_COLORS: Record<string, string> = {
  budget: "text-emerald-400 bg-emerald-400/10",
  "mid-range": "text-blue-400 bg-blue-400/10",
  premium: "text-violet-400 bg-violet-400/10",
  luxury: "text-amber-400 bg-amber-400/10",
};

const MEAL_SECTIONS: Array<{
  type: "breakfast" | "lunch" | "dinner" | "snack";
  label: string;
  emoji: string;
}> = [
  { type: "breakfast", label: "Breakfast", emoji: "🌅" },
  { type: "lunch", label: "Lunch", emoji: "☀️" },
  { type: "dinner", label: "Dinner", emoji: "🌙" },
  { type: "snack", label: "Snacks", emoji: "🍡" },
];

// ── FoodAskStep ───────────────────────────────────────────────────

interface ChoiceOption {
  key: "ai" | "pick" | "skip";
  icon: React.ReactNode;
  title: string;
  description: string;
}

export function FoodAskStep({ onDecide, isLoading = false }: FoodAskStepProps) {
  const options: ChoiceOption[] = [
    {
      key: "ai",
      icon: <Sparkles className="w-5 h-5 text-violet-400" />,
      title: "Let AI Choose",
      description: "We'll find authentic local spots for each meal",
    },
    {
      key: "pick",
      icon: <UtensilsCrossed className="w-5 h-5 text-emerald-400" />,
      title: "I'll Pick",
      description: "Browse our curated non-tourist restaurant list",
    },
    {
      key: "skip",
      icon: <SkipForward className="w-5 h-5 text-zinc-400" />,
      title: "Skip for now",
      description: "Jump straight to your itinerary",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center min-h-[60vh] px-4 py-12"
    >
      <div className="w-full max-w-lg">
        {/* Card */}
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/60 p-6 shadow-xl">
          {/* Header */}
          <div className="text-center mb-6">
            <span className="text-4xl">🍽️</span>
            <h2 className="mt-3 text-xl font-bold text-zinc-100">
              Add food to your trip?
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              Great food is often the best part of travel
            </p>
          </div>

          {/* Options */}
          <div className="flex flex-col sm:flex-row gap-3">
            {options.map((opt, i) => (
              <motion.button
                key={opt.key}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: i * 0.07 }}
                onClick={() => !isLoading && onDecide(opt.key)}
                disabled={isLoading}
                className={cn(
                  "flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border transition-all duration-200 text-center",
                  "bg-zinc-900/60 border-zinc-800/50",
                  !isLoading &&
                    "hover:border-zinc-600 hover:bg-zinc-800/50 cursor-pointer",
                  opt.key === "ai" &&
                    !isLoading &&
                    "hover:border-violet-500/50 hover:bg-violet-500/5",
                  opt.key === "pick" &&
                    !isLoading &&
                    "hover:border-emerald-500/50 hover:bg-emerald-500/5",
                  isLoading && "cursor-not-allowed opacity-60"
                )}
              >
                <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center">
                  {opt.icon}
                </div>
                <span className="font-semibold text-sm text-zinc-200">
                  {opt.title}
                </span>
                <span className="text-xs text-zinc-500 leading-snug">
                  {opt.description}
                </span>
              </motion.button>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── FoodCard ──────────────────────────────────────────────────────

interface FoodCardProps {
  suggestion: FoodSuggestion;
  isSelected: boolean;
  onToggle: (id: string) => void;
}

function FoodCard({ suggestion, isSelected, onToggle }: FoodCardProps) {
  const budgetClass =
    BUDGET_COLORS[suggestion.budget_tier] ?? "text-zinc-400 bg-zinc-400/10";

  return (
    <motion.button
      layout
      whileHover={{ scale: 1.005 }}
      whileTap={{ scale: 0.995 }}
      onClick={() => onToggle(suggestion.id)}
      className={cn(
        "relative w-full text-left rounded-2xl border p-4 transition-all duration-200",
        "bg-zinc-900/60",
        isSelected
          ? "border-emerald-500/60 ring-1 ring-emerald-500/20 shadow-lg shadow-emerald-500/10"
          : "border-zinc-800/50 hover:border-zinc-700 hover:bg-zinc-800/40"
      )}
    >
      {/* Selected badge */}
      <AnimatePresence>
        {isSelected && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="absolute top-3 right-3 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center"
          >
            <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="pr-8 mb-2">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-zinc-200 text-sm leading-snug">
              {suggestion.title}
            </h4>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs text-zinc-500 bg-zinc-800/70 px-2 py-0.5 rounded-full">
                {suggestion.cuisine}
              </span>
              <span
                className={cn(
                  "text-xs font-medium px-2 py-0.5 rounded-full",
                  budgetClass
                )}
              >
                {suggestion.budget_estimate || suggestion.budget_tier}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-zinc-400 leading-relaxed mb-2.5 line-clamp-2">
        {suggestion.description}
      </p>

      {/* Must try dishes */}
      {suggestion.must_try_dishes.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2.5">
          {suggestion.must_try_dishes.slice(0, 4).map((dish) => (
            <span
              key={dish}
              className="text-xs text-zinc-400 bg-zinc-800/60 border border-zinc-700/40 px-2 py-0.5 rounded-full"
            >
              {dish}
            </span>
          ))}
        </div>
      )}

      {/* Why authentic */}
      <p className="text-xs italic text-emerald-400/80 leading-snug mb-2">
        ✦ {suggestion.why_authentic}
      </p>

      {/* Location */}
      {suggestion.location.address && (
        <div className="flex items-start gap-1.5 text-xs text-zinc-500 mb-2">
          <MapPin className="w-3 h-3 flex-shrink-0 mt-0.5" />
          <span className="line-clamp-1">{suggestion.location.address}</span>
        </div>
      )}

      {/* Tips callout */}
      {suggestion.tips && (
        <div className="flex items-start gap-2 bg-amber-400/8 border border-amber-400/20 rounded-lg px-3 py-2 mt-1">
          <span className="text-amber-400 text-xs flex-shrink-0 mt-0.5">💡</span>
          <p className="text-xs text-amber-300/80 leading-snug">{suggestion.tips}</p>
        </div>
      )}
    </motion.button>
  );
}

// ── MealSection (accordion) ──────────────────────────────────────

interface MealSectionProps {
  type: "breakfast" | "lunch" | "dinner" | "snack";
  label: string;
  emoji: string;
  items: FoodSuggestion[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  cityName: string;
}

function MealSection({
  type,
  label,
  emoji,
  items,
  selectedIds,
  onToggle,
  cityName,
}: MealSectionProps) {
  const [open, setOpen] = useState(true);

  if (items.length === 0) return null;

  const selectedInSection = items.filter((i) => selectedIds.has(i.id)).length;

  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 py-2 px-1 group"
      >
        <span className="text-base">{emoji}</span>
        <span className="text-sm font-semibold text-zinc-300 group-hover:text-zinc-200 transition-colors">
          {label}
        </span>
        <span className="text-xs text-zinc-500 bg-zinc-800/60 px-2 py-0.5 rounded-full">
          {items.length}
        </span>
        {selectedInSection > 0 && (
          <span className="text-xs text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full flex items-center gap-1">
            <Check className="w-2.5 h-2.5" />
            {selectedInSection}
          </span>
        )}
        <ChevronDown
          className={cn(
            "w-4 h-4 text-zinc-500 ml-auto transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 pb-2">
              {items.map((item) => (
                <FoodCard
                  key={item.id}
                  suggestion={item}
                  isSelected={selectedIds.has(item.id)}
                  onToggle={(id) => {
                    // Warn if already have one selected in this meal_type for this city
                    const currentlySelected = items.filter(
                      (i) => selectedIds.has(i.id) && i.id !== id
                    );
                    onToggle(id);
                    if (currentlySelected.length >= 1 && !selectedIds.has(id)) {
                      // Parent can handle toast — we just allow the toggle
                    }
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── FoodPicker ───────────────────────────────────────────────────

export function FoodPicker({
  suggestions,
  selectedIds,
  onToggle,
  onConfirm,
  isAdding,
}: FoodPickerProps) {
  // Build city list
  const cities = Array.from(new Set(suggestions.map((s) => s.city)));
  const [activeCity, setActiveCity] = useState(cities[0] ?? "");

  // Track per-(city, meal_type) selections to show warning
  const [warnKey, setWarnKey] = useState<string | null>(null);

  const selectedCount = selectedIds.size;

  const handleToggle = (id: string) => {
    const item = suggestions.find((s) => s.id === id);
    if (!item) return;

    if (!selectedIds.has(id)) {
      // Selecting — check if already have one in same city + meal_type
      const sameSlot = suggestions.filter(
        (s) =>
          s.city === item.city &&
          s.meal_type === item.meal_type &&
          selectedIds.has(s.id)
      );
      if (sameSlot.length >= 1) {
        const key = `${item.city}-${item.meal_type}`;
        setWarnKey(key);
        setTimeout(() => setWarnKey(null), 3000);
      }
    }

    onToggle(id);
  };

  return (
    <div className="flex flex-col h-full">
      {/* City tabs */}
      {cities.length > 1 && (
        <div className="flex items-center gap-1.5 px-4 pt-4 pb-2 overflow-x-auto scrollbar-none border-b border-zinc-800/60">
          {cities.map((city) => (
            <button
              key={city}
              onClick={() => setActiveCity(city)}
              className={cn(
                "flex-shrink-0 px-4 py-1.5 rounded-xl text-sm font-medium transition-all duration-200",
                activeCity === city
                  ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
              )}
            >
              {city}
            </button>
          ))}
        </div>
      )}

      {/* Over-select warning */}
      <AnimatePresence>
        {warnKey && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mx-4 mt-3 flex items-center gap-2 bg-amber-400/10 border border-amber-400/20 rounded-xl px-4 py-2.5"
          >
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <p className="text-xs text-amber-300">
              You already selected a{" "}
              {warnKey.split("-").slice(1).join(" ")} in{" "}
              {warnKey.split("-")[0]}. Consider removing the other one.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Meal sections */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-24">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeCity}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.2 }}
          >
            {MEAL_SECTIONS.map(({ type, label, emoji }) => {
              const items = suggestions.filter(
                (s) => s.city === activeCity && s.meal_type === type
              );
              return (
                <MealSection
                  key={type}
                  type={type}
                  label={label}
                  emoji={emoji}
                  items={items}
                  selectedIds={selectedIds}
                  onToggle={handleToggle}
                  cityName={activeCity}
                />
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 px-4 py-3 bg-zinc-950/90 backdrop-blur-md border-t border-zinc-800/60 flex items-center justify-between z-20">
        <span className="text-sm text-zinc-400">
          <span className="font-semibold text-zinc-200">{selectedCount}</span>{" "}
          food stop{selectedCount !== 1 ? "s" : ""} added
        </span>
        <button
          onClick={onConfirm}
          disabled={isAdding}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
            !isAdding
              ? "bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/25"
              : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
          )}
        >
          {isAdding ? (
            "Adding..."
          ) : (
            <>
              <Check className="w-4 h-4" />
              Confirm Food
            </>
          )}
        </button>
      </div>
    </div>
  );
}
