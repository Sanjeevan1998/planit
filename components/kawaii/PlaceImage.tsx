'use client';

import { useState } from 'react';
import { usePlaceImage } from '@/hooks/usePlaceImage';

const gradients: Record<string, string> = {
  activity:      'from-lavender/50 via-baby-blue/30 to-mint/40',
  meal:          'from-peach/50 via-sunflower/30 to-mint/30',
  transport:     'from-mint/40 via-baby-blue/30 to-lavender/30',
  hotel:         'from-baby-blue/50 via-lavender/30 to-mint/30',
  accommodation: 'from-baby-blue/50 via-lavender/30 to-mint/30',
  event:         'from-sunflower/50 via-peach/30 to-blush/30',
  rest:          'from-mint/40 via-baby-blue/30 to-lavender/30',
  food:          'from-peach/50 via-sunflower/30 to-mint/30',
  default:       'from-lavender/40 via-baby-blue/25 to-mint/35',
};

interface PlaceImageProps {
  provided?: string;
  query: string;
  alt: string;
  type?: string;
  className?: string;
  gradientClassName?: string;
}

const PlaceImage = ({ provided, query, alt, type = 'default', className = 'w-full h-full object-cover', gradientClassName }: PlaceImageProps) => {
  const src = usePlaceImage(provided, query);
  const [failed, setFailed] = useState(false);
  const gradient = gradients[type] ?? gradients.default;

  return (
    <div className="relative w-full h-full">
      {/* Gradient always visible as background / fallback */}
      <div className={`absolute inset-0 bg-gradient-to-br ${gradientClassName ?? gradient}`} />
      {/* Image on top — hidden on error */}
      {src && !failed && (
        <img
          src={src}
          alt={alt}
          className={`absolute inset-0 ${className}`}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
};

export default PlaceImage;
