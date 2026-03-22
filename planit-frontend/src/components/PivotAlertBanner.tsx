import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, CloudRain, ArrowRight, X } from 'lucide-react';
import { PivotAlert } from '@/types/trip';

const spring = { type: 'spring' as const, stiffness: 500, damping: 28 };

const severityStyles: Record<string, { bg: string; icon: typeof AlertTriangle }> = {
  info: { bg: 'hsl(var(--baby-blue))', icon: CloudRain },
  warning: { bg: 'hsl(var(--sunflower))', icon: AlertTriangle },
  critical: { bg: 'hsl(var(--blush))', icon: AlertTriangle },
};

interface Props {
  alert: PivotAlert;
  onViewAlternatives: () => void;
  onDismiss: () => void;
}

const PivotAlertBanner = ({ alert, onViewAlternatives, onDismiss }: Props) => {
  const style = severityStyles[alert.severity] || severityStyles.info;
  const Icon = style.icon;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed top-0 left-0 md:left-16 right-0 z-30 p-3"
        initial={{ y: -100, opacity: 0 }}
        animate={{
          y: 0,
          opacity: 1,
          rotate: [0, -1, 1, -0.5, 0],
        }}
        exit={{ y: -100, opacity: 0 }}
        transition={spring}
      >
        <div
          className="glass-card px-4 py-3 flex items-center gap-3 max-w-2xl mx-auto"
          style={{ borderRadius: '20px', borderLeft: `4px solid ${style.bg}` }}
        >
          <motion.div
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: style.bg }}
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          >
            <Icon className="w-5 h-5 text-foreground" />
          </motion.div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold font-heading leading-tight">{alert.message}</p>
            <p className="text-[10px] text-muted-foreground font-body mt-0.5">
              {alert.new_nodes.length} alternative{alert.new_nodes.length !== 1 ? 's' : ''} available
            </p>
          </div>

          <motion.button
            onClick={onViewAlternatives}
            className="kawaii-pill bg-foreground text-background text-xs flex items-center gap-1.5 flex-shrink-0"
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
          >
            View
            <ArrowRight className="w-3 h-3" />
          </motion.button>

          <motion.button
            onClick={onDismiss}
            className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </motion.button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default PivotAlertBanner;
