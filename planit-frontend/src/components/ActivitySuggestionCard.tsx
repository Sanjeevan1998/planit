import { motion, AnimatePresence } from 'framer-motion';
import { Check, Sparkles } from 'lucide-react';
import { Activity } from '@/types/trip';
import { useTripStore } from '@/stores/useTripStore';
import { useState } from 'react';

const budgetColors: Record<string, string> = {
  free: 'hsl(153 62% 83%)',
  moderate: 'hsl(212 100% 86%)',
  premium: 'hsl(259 100% 85%)',
};

const budgetLabels: Record<string, string> = {
  free: 'Free',
  moderate: '$$',
  premium: '$$$',
};

const spring = { type: 'spring' as const, stiffness: 400, damping: 25 };

const ActivitySuggestionCard = ({ activity }: { activity: Activity }) => {
  const { selectedActivityIds, toggleActivitySelection } = useTripStore();
  const selected = selectedActivityIds.includes(activity.id);
  const [showParticles, setShowParticles] = useState(false);

  const handleSelect = () => {
    if (!selected) {
      setShowParticles(true);
      setTimeout(() => setShowParticles(false), 600);
    }
    toggleActivitySelection(activity.id);
  };

  const isRealImage = activity.image_url.startsWith('http');

  return (
    <motion.div
      className="glass-card glass-card-hover cursor-pointer relative overflow-hidden"
      onClick={handleSelect}
      layout
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      animate={{
        borderColor: selected ? 'hsl(259 100% 85%)' : 'hsl(259 60% 92%)',
        boxShadow: selected
          ? '0 8px 32px rgba(201, 184, 255, 0.35), 0 0 0 2px hsl(259 100% 85%)'
          : 'var(--shadow-pastel)',
      }}
      transition={spring}
      style={{ border: '2px solid', borderRadius: '20px' }}
    >
      {/* Image */}
      {isRealImage ? (
        <div className="relative w-full h-36 overflow-hidden" style={{ borderRadius: '18px 18px 0 0' }}>
          <img
            src={activity.image_url}
            alt={activity.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          {/* Gradient fade */}
          <div className="absolute inset-0 bg-gradient-to-t from-white/60 to-transparent" />
        </div>
      ) : (
        <div className="text-4xl pt-4 px-4">{activity.image_url}</div>
      )}

      {/* Particle burst on select */}
      <AnimatePresence>
        {showParticles && (
          <>
            {Array.from({ length: 8 }).map((_, i) => {
              const angle = (i / 8) * Math.PI * 2;
              return (
                <motion.div
                  key={i}
                  className="absolute w-2 h-2 rounded-full"
                  style={{
                    top: '40%',
                    left: '50%',
                    backgroundColor: ['hsl(259 100% 85%)', 'hsl(22 100% 87%)', 'hsl(153 62% 83%)', 'hsl(340 100% 86%)'][i % 4],
                  }}
                  initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
                  animate={{ x: Math.cos(angle) * 50, y: Math.sin(angle) * 50, scale: 0, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              );
            })}
          </>
        )}
      </AnimatePresence>

      {/* Selection check */}
      <AnimatePresence>
        {selected && (
          <motion.div
            className="absolute top-3 right-3 w-7 h-7 rounded-full bg-primary flex items-center justify-center z-10"
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0, rotate: 90 }}
            transition={spring}
          >
            <Check className="w-4 h-4 text-foreground" strokeWidth={3} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-4 pt-3">
        <h3 className="text-sm font-bold font-heading mb-1 pr-8">{activity.title}</h3>
        <p className="text-xs text-muted-foreground font-body mb-3 line-clamp-2">{activity.description}</p>

        {/* Budget badge + tags */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span
            className="text-[10px] font-bold font-heading px-2.5 py-1 rounded-pill"
            style={{ backgroundColor: budgetColors[activity.budget_tier] }}
          >
            {budgetLabels[activity.budget_tier]}
          </span>
          {activity.tags.slice(0, 2).map(tag => (
            <span key={tag} className="text-[10px] font-body text-muted-foreground bg-muted px-2 py-0.5 rounded-pill">
              {tag}
            </span>
          ))}
        </div>

        {/* Why selected */}
        <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground font-body">
          <Sparkles className="w-3 h-3 mt-0.5 flex-shrink-0 text-sunflower" />
          <span className="italic">{activity.why_selected}</span>
        </div>
      </div>
    </motion.div>
  );
};

export default ActivitySuggestionCard;
