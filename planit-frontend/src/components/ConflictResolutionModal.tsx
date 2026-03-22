import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Check } from 'lucide-react';
import { Conflict, Activity } from '@/types/trip';
import { useTripStore } from '@/stores/useTripStore';
import { useState } from 'react';

const spring = { type: 'spring' as const, stiffness: 400, damping: 25 };

const OptionCard = ({
  activity,
  selected,
  onSelect,
}: {
  activity: Activity;
  selected: boolean;
  onSelect: () => void;
}) => {
  const isImage = activity.image_url.startsWith('http');

  return (
    <motion.button
      onClick={onSelect}
      className="glass-card overflow-hidden text-left w-full relative"
      style={{ borderRadius: '20px', border: '2px solid' }}
      animate={{
        borderColor: selected ? 'hsl(259 100% 85%)' : 'hsl(259 60% 92%)',
        boxShadow: selected
          ? '0 8px 32px rgba(201, 184, 255, 0.35), 0 0 0 2px hsl(259 100% 85%)'
          : 'var(--shadow-pastel)',
      }}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      transition={spring}
    >
      {isImage && (
        <div className="w-full h-28 overflow-hidden">
          <img src={activity.image_url} alt={activity.title} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="p-3">
        <h4 className="text-sm font-bold font-heading mb-1">{activity.title}</h4>
        <p className="text-[11px] text-muted-foreground font-body line-clamp-2">{activity.description}</p>
      </div>

      <AnimatePresence>
        {selected && (
          <motion.div
            className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={spring}
          >
            <Check className="w-3.5 h-3.5 text-foreground" strokeWidth={3} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
};

interface Props {
  conflict: Conflict;
  onClose: () => void;
}

const ConflictResolutionModal = ({ conflict, onClose }: Props) => {
  const { resolveConflict, toggleActivitySelection } = useTripStore();
  const [picked, setPicked] = useState<string | null>(null);

  const handleResolve = () => {
    if (!picked) return;
    toggleActivitySelection(picked);
    resolveConflict(conflict.id);
    onClose();
  };

  return (
    <>
      {/* Overlay */}
      <motion.div
        className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        className="fixed inset-x-4 top-[12%] sm:inset-x-auto sm:left-1/2 sm:w-full sm:max-w-md z-50"
        initial={{ opacity: 0, y: 40, scale: 0.95, x: '-50%' }}
        animate={{ opacity: 1, y: 0, scale: 1, x: '-50%' }}
        exit={{ opacity: 0, y: 40, scale: 0.95 }}
        transition={spring}
      >
        <div className="glass-card p-5 space-y-4" style={{ borderRadius: '24px' }}>
          {/* Header */}
          <div className="text-center space-y-1">
            <motion.div
              className="w-12 h-12 rounded-full bg-sunflower/30 flex items-center justify-center mx-auto mb-2"
              animate={{ rotate: [0, -8, 8, -4, 0] }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <Zap className="w-6 h-6 text-foreground" />
            </motion.div>
            <h3 className="text-lg font-extrabold font-heading">Schedule Conflict!</h3>
            <p className="text-xs text-muted-foreground font-body">
              {conflict.date} · {conflict.time_slot} — pick one
            </p>
          </div>

          {/* VS layout */}
          <div className="grid grid-cols-2 gap-3 items-start">
            {conflict.options.map((opt, i) => (
              <div key={opt.id} className="relative">
                {i === 0 && conflict.options.length === 2 && (
                  <motion.div
                    className="absolute -right-5 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-accent flex items-center justify-center"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1, rotate: [0, 12, -12, 0] }}
                    transition={{ delay: 0.4, ...spring }}
                  >
                    <span className="text-[10px] font-extrabold font-heading">VS</span>
                  </motion.div>
                )}
                <OptionCard
                  activity={opt}
                  selected={picked === opt.id}
                  onSelect={() => setPicked(opt.id)}
                />
              </div>
            ))}
          </div>

          {/* Confirm */}
          <motion.button
            onClick={handleResolve}
            className="kawaii-pill bg-foreground text-background text-sm w-full flex items-center justify-center gap-2"
            style={{ opacity: picked ? 1 : 0.4 }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            disabled={!picked}
          >
            <Check className="w-4 h-4" />
            Confirm Pick
          </motion.button>
        </div>
      </motion.div>
    </>
  );
};

export default ConflictResolutionModal;
