import { motion } from 'framer-motion';
import { Calendar } from 'lucide-react';
import { DayPlan, ItineraryNode } from '@/types/trip';
import ItineraryNodeCard from './ItineraryNodeCard';
import { useState } from 'react';
import NodeDetailDialog from './NodeDetailDialog';

const spring = { type: 'spring' as const, stiffness: 300, damping: 28 };

const ItineraryTimeline = ({ days }: { days: DayPlan[] }) => {
  const [selectedNode, setSelectedNode] = useState<ItineraryNode | null>(null);

  return (
    <>
      <div className="space-y-8">
        {days.map((day, dayIdx) => (
          <motion.div
            key={day.date}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: dayIdx * 0.12, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Day header */}
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-full bg-primary/30 flex items-center justify-center">
                <Calendar className="w-4 h-4 text-foreground" />
              </div>
              <div>
                <h3 className="text-sm font-bold font-heading">{day.label}</h3>
                <p className="text-[10px] text-muted-foreground font-body">{day.date}</p>
              </div>
            </div>

            {/* Timeline nodes */}
            <div className="relative pl-6 ml-4 space-y-3">
              {/* Vertical line */}
              <motion.div
                className="absolute left-0 top-0 bottom-0 w-[2px] rounded-full bg-border"
                initial={{ height: 0 }}
                animate={{ height: '100%' }}
                transition={{ delay: dayIdx * 0.12 + 0.2, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              />

              {day.nodes.map((node, i) => (
                <div key={node.id} className="relative">
                  {/* Dot on timeline */}
                  <motion.div
                    className="absolute -left-6 top-4 w-3 h-3 rounded-full bg-primary border-2 border-background z-10"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: dayIdx * 0.12 + 0.1 + i * 0.08, ...spring }}
                  />
                  <ItineraryNodeCard
                    node={node}
                    index={dayIdx * 4 + i}
                    onClick={() => setSelectedNode(node)}
                  />
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>

      <NodeDetailDialog node={selectedNode} onClose={() => setSelectedNode(null)} />
    </>
  );
};

export default ItineraryTimeline;
