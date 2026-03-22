'use client';

import { motion } from 'framer-motion';
import { MapPin, Clock, Train, Footprints, Car } from 'lucide-react';
import type { KawaiiItineraryNode } from '@/types/kawaii';
import PlaceImage from './PlaceImage';

const typeColors: Record<string, string> = {
  activity:      'hsl(var(--lavender))',
  meal:          'hsl(var(--peach))',
  transport:     'hsl(var(--mint))',
  hotel:         'hsl(var(--baby-blue))',
  accommodation: 'hsl(var(--baby-blue))',
  event:         'hsl(var(--sunflower))',
  rest:          'hsl(var(--sunflower))',
  pivot:         'hsl(var(--blush))',
};

function TransportThumb({ node }: { node: KawaiiItineraryNode }) {
  const primary = node.transport_options?.[0];
  const mode = primary?.mode?.toLowerCase() ?? '';
  const Icon = mode === 'walk' ? Footprints : mode.includes('car') || mode.includes('taxi') ? Car : Train;
  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center gap-1.5"
      style={{ background: typeColors.transport, opacity: 0.85 }}
    >
      <Icon className="w-6 h-6 text-foreground/70" strokeWidth={1.5} />
      {primary && (
        <span className="text-[9px] font-bold font-heading text-foreground/60 uppercase tracking-wide px-1 text-center leading-tight">
          {primary.duration}
        </span>
      )}
    </div>
  );
}

interface Props {
  node: KawaiiItineraryNode;
  index: number;
  onClick: () => void;
}

const ItineraryNodeCard = ({ node, index, onClick }: Props) => {
  const isTransport = node.type === 'transport';

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
        <div className="w-24 h-24 sm:w-28 sm:h-28 flex-shrink-0 overflow-hidden" style={{ borderRadius: '20px 0 0 20px' }}>
          {isTransport ? (
            <TransportThumb node={node} />
          ) : (
            <PlaceImage
              provided={node.image_url}
              query={`${node.title} ${node.type}`}
              alt={node.title}
              type={node.type}
            />
          )}
        </div>
        <div className="flex-1 p-3 sm:p-4 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span
              className="text-[9px] font-bold font-heading px-2 py-0.5 rounded-pill uppercase tracking-wider"
              style={{ backgroundColor: typeColors[node.type] ?? typeColors.activity }}
            >
              {node.type}
            </span>
            {node.is_pivot && (
              <span className="text-[9px] font-bold font-heading px-2 py-0.5 rounded-pill bg-blush uppercase tracking-wider">
                ⚡ PIVOT
              </span>
            )}
            <span className="text-[10px] text-muted-foreground font-body flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {node.start_time} – {node.end_time}
            </span>
          </div>
          <h3 className="text-sm font-bold font-heading truncate">{node.title}</h3>
          {/* Show primary transport mode inline for transport nodes */}
          {isTransport && node.transport_options?.[0] ? (
            <p className="text-[11px] text-muted-foreground font-body mt-1 truncate">
              {node.transport_options[0].notes || node.transport_options[0].mode} · {node.transport_options[0].cost}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground font-body flex items-center gap-1 mt-1">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{node.location}</span>
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default ItineraryNodeCard;
