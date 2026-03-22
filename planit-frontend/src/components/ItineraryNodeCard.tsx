import { motion } from 'framer-motion';
import { MapPin, Clock } from 'lucide-react';
import { ItineraryNode } from '@/types/trip';

const typeColors: Record<string, string> = {
  activity: 'hsl(var(--lavender))',
  meal: 'hsl(var(--peach))',
  transport: 'hsl(var(--mint))',
  hotel: 'hsl(var(--baby-blue))',
  event: 'hsl(var(--sunflower))',
};

const spring = { type: 'spring' as const, stiffness: 400, damping: 28 };

interface Props {
  node: ItineraryNode;
  index: number;
  onClick: () => void;
}

const ItineraryNodeCard = ({ node, index, onClick }: Props) => {
  const isImage = node.image_url.startsWith('http');

  return (
    <motion.div
      className="glass-card glass-card-hover cursor-pointer overflow-hidden"
      style={{ borderRadius: '20px' }}
      onClick={onClick}
      initial={{ opacity: 0, x: -24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.1 + index * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
    >
      <div className="flex">
        {/* Image thumb */}
        {isImage && (
          <div className="w-24 h-24 sm:w-28 sm:h-28 flex-shrink-0 overflow-hidden" style={{ borderRadius: '20px 0 0 20px' }}>
            <img src={node.image_url} alt={node.title} className="w-full h-full object-cover" loading="lazy" />
          </div>
        )}

        <div className="flex-1 p-3 sm:p-4 min-w-0">
          {/* Type chip + time */}
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="text-[9px] font-bold font-heading px-2 py-0.5 rounded-pill uppercase tracking-wider"
              style={{ backgroundColor: typeColors[node.type] || typeColors.activity }}
            >
              {node.type}
            </span>
            <span className="text-[10px] text-muted-foreground font-body flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {node.start_time} – {node.end_time}
            </span>
          </div>

          <h3 className="text-sm font-bold font-heading truncate">{node.title}</h3>

          <p className="text-[11px] text-muted-foreground font-body flex items-center gap-1 mt-1">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{node.location}</span>
          </p>
        </div>
      </div>
    </motion.div>
  );
};

export default ItineraryNodeCard;
