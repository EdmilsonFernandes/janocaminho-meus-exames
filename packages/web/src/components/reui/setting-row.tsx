import * as React from 'react';
import { Badge, type BadgeProps } from '@/components/reui/badge';
import { IconTile, type IconTileProps } from '@/components/reui/icon-tile';
import { cn } from '@/lib/utils';

export interface SettingRowProps extends React.ComponentProps<'div'> {
  icon: React.ReactNode;
  iconVariant?: IconTileProps['variant'];
  iconClassName?: string;
  title: string;
  description?: React.ReactNode;
  badge?: string;
  badgeVariant?: BadgeProps['variant'];
  action?: React.ReactNode;
  stackOnMobile?: boolean;
}

/**
 * ReUI settings-2 SettingRow pattern adapted for mobile-first clinical UI.
 * Combines IconTile + Title + semantic Badge + Description + right-aligned or mobile-stacked action slot.
 */
export function SettingRow({
  icon,
  iconVariant = 'elevated',
  iconClassName,
  title,
  description,
  badge,
  badgeVariant = 'primary-light',
  action,
  stackOnMobile = false,
  className,
  ...props
}: SettingRowProps) {
  return (
    <div
      data-slot="setting-row"
      className={cn(
        'flex items-start gap-3.5 border-b border-border/70 p-3.5 sm:items-center sm:gap-4 sm:px-4 sm:py-3.5 last:border-b-0 transition-colors hover:bg-muted/25',
        className
      )}
      {...props}
    >
      <IconTile
        variant={iconVariant}
        size="default"
        className={cn('mt-0.5 sm:mt-0 shrink-0', iconClassName)}
      >
        {icon}
      </IconTile>

      <div
        className={cn(
          'flex min-w-0 flex-1 gap-3',
          stackOnMobile
            ? 'flex-col items-stretch sm:flex-row sm:items-center sm:justify-between'
            : 'items-center justify-between'
        )}
      >
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-foreground text-sm font-semibold leading-snug">
              {title}
            </h3>
            {badge && (
              <Badge variant={badgeVariant} size="sm">
                {badge}
              </Badge>
            )}
          </div>
          {description && (
            <div className="text-muted-foreground text-xs sm:text-[13px] leading-relaxed">
              {description}
            </div>
          )}
        </div>

        {action && (
          <div
            className={cn(
              'flex shrink-0 items-center gap-2',
              stackOnMobile && 'w-full pt-1 sm:w-auto sm:pt-0'
            )}
          >
            {action}
          </div>
        )}
      </div>
    </div>
  );
}

