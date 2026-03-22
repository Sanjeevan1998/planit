import { motion } from 'framer-motion';
import { MapPin, CalendarDays, ArrowLeft } from 'lucide-react';
import { Itinerary } from '@/types/trip';
import { useTripStore } from '@/stores/useTripStore';
import PlanningStepProgress from './PlanningStepProgress';
import ItineraryTimeline from './ItineraryTimeline';

const spring = { type: 'spring' as const, stiffness: 300, damping: 28 };

const ItineraryDashboard = ({ itinerary }: { itinerary: Itinerary }) => {
  const { planningStep, setPlanningStep } = useTripStore();

  return (
    <motion.div
      className="flex flex-col h-full min-h-screen"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
    >
      {/* Top bar */}
      <div className="px-4 sm:px-6 pt-4">
        <PlanningStepProgress current={planningStep} />
      </div>

      {/* Trip header */}
      <motion.div
        className="px-4 sm:px-6 pt-4 pb-6"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, ...spring }}
      >
        <div className="flex items-start gap-3">
          <motion.button
            onClick={() => setPlanningStep('review')}
            className="mt-1 w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <ArrowLeft className="w-4 h-4" />
          </motion.button>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold font-heading leading-tight">
              {itinerary.title} ✨
            </h1>
            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-muted-foreground font-body">
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {itinerary.destination}
              </span>
              <span className="flex items-center gap-1">
                <CalendarDays className="w-3.5 h-3.5" />
                {itinerary.start_date} → {itinerary.end_date}
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-8">
        <ItineraryTimeline days={itinerary.days} />
      </div>
    </motion.div>
  );
};

export default ItineraryDashboard;
