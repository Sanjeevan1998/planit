"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlanningStepsProps {
  currentStep: "picking" | "conflict" | "food" | "done";
  hasConflicts: boolean;
}

type StepId = "picking" | "conflict" | "food" | "done";

interface Step {
  id: StepId;
  label: string;
}

const ALL_STEPS: Step[] = [
  { id: "picking", label: "Pick Activities" },
  { id: "conflict", label: "Resolve Conflicts" },
  { id: "food", label: "Add Food" },
  { id: "done", label: "Done" },
];

const STEP_ORDER: StepId[] = ["picking", "conflict", "food", "done"];
const STEP_ORDER_NO_CONFLICT: StepId[] = ["picking", "food", "done"];

export function PlanningSteps({ currentStep, hasConflicts }: PlanningStepsProps) {
  const visibleSteps = hasConflicts
    ? ALL_STEPS
    : ALL_STEPS.filter((s) => s.id !== "conflict");

  const order = hasConflicts ? STEP_ORDER : STEP_ORDER_NO_CONFLICT;
  const currentIndex = order.indexOf(currentStep);

  return (
    <div className="flex items-center justify-center gap-0 w-full px-4 py-6">
      {visibleSteps.map((step, i) => {
        const stepIndex = order.indexOf(step.id);
        const isCompleted = stepIndex < currentIndex;
        const isActive = step.id === currentStep;
        const isPending = stepIndex > currentIndex;

        return (
          <div key={step.id} className="flex items-center">
            {/* Connector line before (skip for first) */}
            {i > 0 && (
              <div
                className={cn(
                  "h-px w-10 sm:w-16 transition-colors duration-500",
                  isCompleted || isActive
                    ? "bg-violet-500"
                    : "bg-zinc-700"
                )}
              />
            )}

            {/* Step node + label */}
            <div className="flex flex-col items-center gap-1.5">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3, delay: i * 0.08 }}
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300",
                  isCompleted &&
                    "bg-violet-500 text-white ring-2 ring-violet-500/30",
                  isActive &&
                    "bg-violet-500/20 text-violet-300 ring-2 ring-violet-500 shadow-lg shadow-violet-500/20",
                  isPending &&
                    "bg-zinc-800 text-zinc-500 ring-1 ring-zinc-700"
                )}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4" strokeWidth={2.5} />
                ) : (
                  <span>{stepIndex + 1}</span>
                )}
              </motion.div>

              <span
                className={cn(
                  "text-xs font-medium whitespace-nowrap transition-colors duration-300",
                  isCompleted && "text-violet-400",
                  isActive && "text-violet-300",
                  isPending && "text-zinc-500"
                )}
              >
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
