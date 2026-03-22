import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, ArrowRight, ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { useTripStore } from '@/stores/useTripStore';
import { TripSuggestions } from '@/types/trip';
import { buildItineraryFromSelections } from '@/services/chatApi';
import ActivitySuggestionCard from './ActivitySuggestionCard';
import PlanningStepProgress from './PlanningStepProgress';

const spring = { type: 'spring' as const, stiffness: 300, damping: 28 };

const ActivitySelectionView = ({ suggestions }: { suggestions: TripSuggestions }) => {
  const [activeCity, setActiveCity] = useState(0);
  const { selectedActivityIds, planningStep, setPlanningStep, setItinerary } = useTripStore();
  const selectedCount = selectedActivityIds.length;

  const handleBuild = () => {
    if (selectedCount === 0) return;
    const itinerary = buildItineraryFromSelections(suggestions, selectedActivityIds);
    setItinerary(itinerary);
    setPlanningStep('finalize');
  };

  return (
    <motion.div
      className="flex flex-col h-full"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
    >
      {/* Progress */}
      <div className="px-4 sm:px-6 pt-4">
        <PlanningStepProgress current={planningStep} />
      </div>

      {/* Header */}
      <div className="px-4 sm:px-6 pt-4 pb-4">
        <div className="flex items-start gap-3">
          <motion.button
            onClick={() => setPlanningStep('chat')}
            className="mt-1 w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <ArrowLeft className="w-4 h-4" />
          </motion.button>
          <div>
            <motion.h2
              className="text-xl sm:text-2xl font-extrabold font-heading mb-1"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, ...spring }}
            >
              {suggestions.trip_title} ✨
            </motion.h2>
            <motion.p
              className="text-sm text-muted-foreground font-body"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              {suggestions.start_date} → {suggestions.end_date} · Pick your favourites!
            </motion.p>
          </div>
        </div>
      </div>

      {/* City tabs */}
      <div className="px-4 sm:px-6 flex gap-2 overflow-x-auto pb-3 scrollbar-hide">
        {suggestions.cities.map((city, i) => (
          <motion.button
            key={city.city}
            onClick={() => setActiveCity(i)}
            className={`kawaii-pill text-xs whitespace-nowrap flex items-center gap-1.5 transition-colors
              ${activeCity === i
                ? 'bg-foreground text-background'
                : 'bg-muted text-muted-foreground'
              }`}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 + i * 0.05, ...spring }}
          >
            <MapPin className="w-3 h-3" />
            {city.city}
            <span className="opacity-60 text-[10px]">{city.date_range}</span>
          </motion.button>
        ))}
      </div>

      {/* Activities grid */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-28">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeCity}
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            {suggestions.cities[activeCity].activities.map((activity, i) => (
              <motion.div
                key={activity.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 + i * 0.07, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              >
                <ActivitySuggestionCard activity={activity} />
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Sticky footer */}
      <motion.div
        className="fixed bottom-0 left-0 md:left-16 right-0 z-20 p-4"
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4, ...spring }}
      >
        <div className="glass-card px-5 py-4 flex items-center justify-between max-w-2xl mx-auto"
          style={{ borderRadius: '20px' }}>
          <div>
            <span className="text-sm font-bold font-heading">
              {selectedCount} selected
            </span>
            <p className="text-xs text-muted-foreground font-body">Tap cards to pick activities</p>
          </div>
          <motion.button
            onClick={handleBuild}
            className="kawaii-pill bg-foreground text-background text-sm flex items-center gap-2"
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            style={{ opacity: selectedCount > 0 ? 1 : 0.5 }}
          >
            Build My Trip
            <ArrowRight className="w-4 h-4" />
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default ActivitySelectionView;
