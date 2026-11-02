import * as React from 'react';
import { useState } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

const ratingVariants = cva('inline-flex items-center', {
  variants: {
    size: {
      xs: 'gap-1',
      sm: 'gap-1.5',
      default: 'gap-2',
      lg: 'gap-2.5',
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

const starVariants = cva('shrink-0', {
  variants: {
    size: {
      xs: 'size-3.5',
      sm: 'size-4',
      default: 'size-4.5',
      lg: 'size-5.5',
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

const valueVariants = cva('text-muted-foreground font-semibold tabular-nums', {
  variants: {
    size: {
      xs: 'text-[11px]',
      sm: 'text-xs',
      default: 'text-sm',
      lg: 'text-base',
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

export interface RatingProps
  extends React.ComponentProps<'div'>,
    VariantProps<typeof ratingVariants> {
  /** Current rating value (supports decimal values for partial stars) */
  rating: number;
  /** Maximum rating value (number of stars to show) */
  maxRating?: number;
  /** Whether to show the numeric rating value */
  showValue?: boolean;
  /** Class name for the numeric value span */
  starClassName?: string;
  /** Whether the rating is editable (clickable) */
  editable?: boolean;
  /** Callback function called when rating changes */
  onRatingChange?: (rating: number) => void;
}

export function Rating({
  rating,
  maxRating = 5,
  size = 'default',
  className,
  starClassName,
  showValue = false,
  editable = false,
  onRatingChange,
  ...props
}: RatingProps) {
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const displayRating = editable && hoveredRating !== null ? hoveredRating : rating;

  const handleStarClick = (starRating: number) => {
    if (editable && onRatingChange) {
      onRatingChange(starRating);
    }
  };

  const renderStars = () => {
    const stars = [];

    for (let i = 1; i <= maxRating; i++) {
      const filled = displayRating >= i;
      const partiallyFilled = displayRating > i - 1 && displayRating < i;
      const fillPercentage = partiallyFilled ? (displayRating - (i - 1)) * 100 : 0;

      stars.push(
        <div
          key={i}
          className={cn(
            'relative inline-flex items-center justify-center',
            editable && 'cursor-pointer transition-transform hover:scale-110'
          )}
          onClick={() => handleStarClick(i)}
          onMouseEnter={() => editable && setHoveredRating(i)}
          onMouseLeave={() => editable && setHoveredRating(null)}
        >
          <Star
            data-slot="rating-star-empty"
            className={cn(starVariants({ size }), 'text-muted-foreground/25')}
          />
          <div
            className="pointer-events-none absolute inset-0 overflow-hidden"
            style={{
              width: filled ? '100%' : `${fillPercentage}%`,
            }}
          >
            <Star
              data-slot="rating-star-filled"
              className={cn(
                starVariants({ size }),
                'fill-amber-400 text-amber-400 dark:fill-amber-400 dark:text-amber-400'
              )}
            />
          </div>
        </div>
      );
    }

    return stars;
  };

  return (
    <div
      data-slot="rating"
      className={cn(ratingVariants({ size }), className)}
      aria-label={`Avaliação ${rating.toFixed(1)} de ${maxRating}`}
      {...props}
    >
      <div className="inline-flex items-center gap-0.5">{renderStars()}</div>
      {showValue && (
        <span
          data-slot="rating-value"
          className={cn(valueVariants({ size }), starClassName)}
        >
          {displayRating.toFixed(1)}
        </span>
      )}
    </div>
  );
}

