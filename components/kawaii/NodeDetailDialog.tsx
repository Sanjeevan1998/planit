'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin, Clock, ExternalLink, Sparkles, Train, Car } from 'lucide-react';
import type { KawaiiItineraryNode } from '@/types/kawaii';
import PlaceImage from './PlaceImage';

const typeColors: Record<string, string> = {
  activity: 'hsl(var(--lavender))',
  meal: 'hsl(var(--peach))',
  transport: 'hsl(var(--mint))',
  hotel: 'hsl(var(--baby-blue))',
  accommodation: 'hsl(var(--baby-blue))',
  event: 'hsl(var(--sunflower))',
};

const spring = { type: 'spring' as const, stiffness: 300, damping: 28 };

interface Props {
  node: KawaiiItineraryNode | null;
  onClose: () => void;
}

const NodeDetailDialog = ({ node, onClose }: Props) => {
  if (!node) return null;

  return (
    <AnimatePresence>
      {node && (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-x-4 top-[10%] sm:inset-x-auto sm:left-1/2 sm:w-full sm:max-w-lg z-50 overflow-hidden"
            style={{ borderRadius: '24px' }}
            initial={{ opacity: 0, y: 40, scale: 0.95, x: '-50%' }}
            animate={{ opacity: 1, y: 0, scale: 1, x: '-50%' }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={spring}
          >
            <div className="glass-card overflow-hidden max-h-[80vh] overflow-y-auto" style={{ borderRadius: '24px' }}>
              <div className="relative w-full h-52 overflow-hidden">
                <PlaceImage
                  provided={node.image_url}
                  query={`${node.title} ${node.type}`}
                  alt={node.title}
                  type={node.type}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-white/80 via-transparent to-transparent pointer-events-none" />
              </div>
              <motion.button
                onClick={onClose}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center z-10"
                whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
              >
                <X className="w-4 h-4" />
              </motion.button>
              <div className="p-5 space-y-4">
                <span
                  className="text-[10px] font-bold font-heading px-3 py-1 rounded-pill inline-block"
                  style={{ backgroundColor: typeColors[node.type] ?? typeColors.activity }}
                >
                  {node.type}
                </span>
                <h2 className="text-xl font-extrabold font-heading leading-tight">{node.title}</h2>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground font-body">
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{node.start_time} – {node.end_time}</span>
                  <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{node.location}</span>
                </div>
                <p className="text-sm font-body text-muted-foreground leading-relaxed">{node.description}</p>
                <div className="flex items-start gap-2 text-xs font-body bg-muted/50 rounded-lg p-3">
                  <Sparkles className="w-3.5 h-3.5 mt-0.5 text-sunflower flex-shrink-0" />
                  <span className="italic text-muted-foreground">{node.why_selected}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {node.tags.map((tag) => (
                    <span key={tag} className="text-[10px] font-body text-muted-foreground bg-muted px-2.5 py-1 rounded-pill">{tag}</span>
                  ))}
                </div>
                {node.transport_options && node.transport_options.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold font-heading text-muted-foreground">Getting here</p>
                    {node.transport_options.map((t, i) => {
                      const m = t.mode.toLowerCase();
                      const ModeIcon = m.includes('walk') || m.includes('foot') ? Train : m.includes('taxi') || m.includes('car') ? Car : Train;
                      return (
                        <div key={i} className="flex items-start gap-3 text-xs font-body bg-muted/40 rounded-lg px-3 py-2.5">
                          <ModeIcon className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="font-semibold capitalize">{t.mode}</span>
                            {t.notes && <p className="text-muted-foreground mt-0.5 leading-tight">{t.notes}</p>}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="font-bold">{t.cost}</p>
                            <p className="text-muted-foreground">{t.duration}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {node.links && node.links.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {node.links.map((link, i) => (
                      <a
                        key={i}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="kawaii-pill text-xs bg-foreground text-background inline-flex items-center gap-1.5"
                      >
                        <ExternalLink className="w-3 h-3" />
                        {link.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default NodeDetailDialog;
