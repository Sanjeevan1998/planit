import { motion } from 'framer-motion';
import { MessageCircle, Sparkles, CheckSquare, Map } from 'lucide-react';
import { PlanningStep } from '@/stores/useTripStore';

const steps: { key: PlanningStep; label: string; icon: typeof MessageCircle }[] = [
  { key: 'chat', label: 'Chat', icon: MessageCircle },
  { key: 'review', label: 'Select', icon: Sparkles },
  { key: 'customize', label: 'Customize', icon: CheckSquare },
  { key: 'finalize', label: 'Trip', icon: Map },
];

const spring = { type: 'spring' as const, stiffness: 400, damping: 30 };

const stepIndex = (step: PlanningStep) => steps.findIndex(s => s.key === step);

const PlanningStepProgress = ({ current }: { current: PlanningStep }) => {
  const currentIdx = stepIndex(current);

  return (
    <div className="flex items-center justify-center gap-1 py-3 px-4">
      {steps.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        const Icon = step.icon;

        return (
          <div key={step.key} className="flex items-center">
            <motion.div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-heading font-bold transition-colors ${
                active
                  ? 'bg-foreground text-background'
                  : done
                  ? 'bg-primary/30 text-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
              animate={{ scale: active ? 1 : 0.92 }}
              transition={spring}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{step.label}</span>
            </motion.div>
            {i < steps.length - 1 && (
              <div className="w-6 h-[2px] mx-1 rounded-full overflow-hidden bg-muted">
                <motion.div
                  className="h-full bg-foreground"
                  initial={{ width: '0%' }}
                  animate={{ width: i < currentIdx ? '100%' : '0%' }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default PlanningStepProgress;
