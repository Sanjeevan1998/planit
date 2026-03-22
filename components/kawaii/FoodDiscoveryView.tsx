'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { UtensilsCrossed, Check, ArrowRight, Sparkles } from 'lucide-react';
import { useState } from 'react';
import type { KawaiiFood } from '@/types/kawaii';
import { useTripStore } from '@/stores/useTripStore';
import { useUserStore } from '@/stores/useUserStore';
import { addFoodToItinerary } from '@/services/api';
import PlanningStepProgress from './PlanningStepProgress';

const spring = { type: 'spring' as const, stiffness: 400, damping: 25 };
const mealFilters = ['all', 'breakfast', 'lunch', 'dinner', 'snack'] as const;
const budgetColors: Record<string, string> = {
  free: 'hsl(var(--mint))',
  budget: 'hsl(var(--mint))',
  moderate: 'hsl(var(--baby-blue))',
  'mid-range': 'hsl(var(--baby-blue))',
  premium: 'hsl(var(--lavender))',
  luxury: 'hsl(var(--lavender))',
};

const FoodCard = ({ item }: { item: KawaiiFood }) => {
  const { selectedFoodIds, toggleFoodSelection } = useTripStore();
  const selected = selectedFoodIds.includes(item.id);
  const isImage = item.image_url?.startsWith('http');

  return (
    <motion.div
      className="glass-card glass-card-hover cursor-pointer overflow-hidden relative"
      style={{ borderRadius: '20px', border: '2px solid' }}
      onClick={() => toggleFoodSelection(item.id)}
      animate={{
        borderColor: selected ? 'hsl(22 100% 87%)' : 'hsl(259 60% 92%)',
        boxShadow: selected ? '0 8px 32px rgba(255, 214, 192, 0.4), 0 0 0 2px hsl(22 100% 87%)' : 'var(--shadow-pastel)',
      }}
      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={spring}
    >
      {isImage && (
        <div className="w-full h-32 overflow-hidden" style={{ borderRadius: '18px 18px 0 0' }}>
          <img src={item.image_url} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
        </div>
      )}
      <AnimatePresence>
        {selected && (
          <motion.div
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-peach flex items-center justify-center z-10"
            initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0, rotate: 90 }} transition={spring}
          >
            <Check className="w-4 h-4 text-foreground" strokeWidth={3} />
          </motion.div>
        )}
      </AnimatePresence>
      <div className="p-3.5">
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className="text-[9px] font-bold font-heading px-2 py-0.5 rounded-pill uppercase tracking-wider"
            style={{ backgroundColor: budgetColors[item.budget_tier] ?? 'hsl(var(--mint))' }}
          >
            {item.meal_type}
          </span>
          <span className="text-[10px] text-muted-foreground font-body">★ {item.rating}</span>
        </div>
        <h3 className="text-sm font-bold font-heading mb-0.5">{item.title}</h3>
        <p className="text-[11px] text-muted-foreground font-body line-clamp-2 mb-2">{item.description}</p>
        <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground font-body">
          <Sparkles className="w-3 h-3 mt-0.5 text-sunflower flex-shrink-0" />
          <span className="italic line-clamp-1">{item.why_selected}</span>
        </div>
      </div>
    </motion.div>
  );
};

const FoodDiscoveryView = ({ foods }: { foods: KawaiiFood[] }) => {
  const [filter, setFilter] = useState<typeof mealFilters[number]>('all');
  const [submitting, setSubmitting] = useState(false);
  const { selectedFoodIds, planningStep, setPlanningStep, itinerary, setItinerary } = useTripStore();
  const userId = useUserStore((s) => s.userId);
  const selectedCount = selectedFoodIds.length;
  const filtered = filter === 'all' ? foods : foods.filter((f) => f.meal_type === filter);

  const handleContinue = async () => {
    if (!itinerary || submitting) return;
    if (selectedCount === 0) { setPlanningStep('finalize'); return; }
    setSubmitting(true);
    try {
      const updated = await addFoodToItinerary(userId ?? 'demo', itinerary.id, selectedFoodIds, foods);
      setItinerary(updated);
      setPlanningStep('finalize');
    } catch (err) {
      console.error('Add food failed', err);
      setPlanningStep('finalize');
    } finally { setSubmitting(false); }
  };

  return (
    <motion.div className="flex flex-col h-full" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
      <div className="px-4 sm:px-6 pt-4"><PlanningStepProgress current={planningStep} /></div>
      <div className="px-4 sm:px-6 pt-4 pb-3">
        <div className="flex items-center gap-2 mb-1">
          <UtensilsCrossed className="w-5 h-5 text-peach" />
          <h2 className="text-xl font-extrabold font-heading">Food & Dining 🍜</h2>
        </div>
        <p className="text-sm text-muted-foreground font-body">Pick restaurants & food experiences for your trip</p>
      </div>
      <div className="px-4 sm:px-6 flex gap-2 overflow-x-auto pb-3 scrollbar-hide">
        {mealFilters.map((m) => (
          <motion.button
            key={m} onClick={() => setFilter(m)}
            className={`kawaii-pill text-xs capitalize whitespace-nowrap transition-colors ${filter === m ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'}`}
            whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
          >{m}</motion.button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-28">
        <AnimatePresence mode="wait">
          <motion.div key={filter} className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.25 }}
          >
            {filtered.map((food, i) => (
              <motion.div key={food.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
                <FoodCard item={food} />
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
      <motion.div
        className="fixed bottom-0 left-0 md:left-16 right-0 z-20 p-4"
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3, ...spring }}
      >
        <div className="glass-card px-5 py-4 flex items-center justify-between max-w-2xl mx-auto" style={{ borderRadius: '20px' }}>
          <div>
            <span className="text-sm font-bold font-heading">{selectedCount} dishes picked</span>
            <p className="text-xs text-muted-foreground font-body">Tap cards to add to your trip</p>
          </div>
          <motion.button
            onClick={handleContinue}
            className="kawaii-pill bg-foreground text-background text-sm flex items-center gap-2"
            whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
            disabled={submitting}
          >
            {submitting ? 'Adding…' : 'Continue'}
            <ArrowRight className="w-4 h-4" />
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default FoodDiscoveryView;
