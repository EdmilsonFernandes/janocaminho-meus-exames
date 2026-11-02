import * as React from 'react';
import {
  IconTile as BaseIconTile,
  type IconTileProps as BaseIconTileProps,
} from './icon-tile';
import {
  SettingRow as BaseSettingRow,
  type SettingRowProps as BaseSettingRowProps,
} from './setting-row';
import {
  FieldLabelWithHint as BaseFieldLabelWithHint,
  type FieldLabelWithHintProps as BaseFieldLabelWithHintProps,
} from './field-label';
import {
  Message as BaseMessage,
  MessageHeader as BaseMessageHeader,
  Bubble as BaseBubble,
  BubbleContent,
  type MessageProps,
} from './message';
import { cn } from '@/lib/utils';

export type ReuiTone =
  | 'primary'
  | 'destructive'
  | 'warning'
  | 'info'
  | 'success'
  | 'muted';

const TONE_CLASS: Record<ReuiTone, string> = {
  primary: 'text-primary',
  destructive: 'text-destructive',
  warning: 'text-amber-600 dark:text-amber-400',
  info: 'text-sky-600 dark:text-sky-400',
  success: 'text-emerald-600 dark:text-emerald-400',
  muted: 'text-muted-foreground',
};

export interface IconTilePatternProps
  extends Omit<BaseIconTileProps, 'size'> {
  tone?: ReuiTone;
  size?: 'xs' | 'sm' | 'md' | 'default' | 'lg' | 'xl';
}

export function IconTile({
  tone = 'primary',
  size = 'default',
  variant = 'soft',
  className,
  ...props
}: IconTilePatternProps) {
  const mappedSize = size === 'md' ? 'default' : size;
  return (
    <BaseIconTile
      variant={variant}
      size={mappedSize}
      className={cn(TONE_CLASS[tone], className)}
      {...props}
    />
  );
}

export interface SettingRowPatternProps extends BaseSettingRowProps {
  tone?: ReuiTone;
}

export function SettingRow({
  tone = 'primary',
  iconVariant = 'soft',
  iconClassName,
  ...props
}: SettingRowPatternProps) {
  return (
    <BaseSettingRow
      iconVariant={iconVariant}
      iconClassName={cn(TONE_CLASS[tone], iconClassName)}
      {...props}
    />
  );
}

export interface FieldLabelPatternProps extends BaseFieldLabelWithHintProps {
  children?: React.ReactNode;
}

export function FieldLabelWithHint({
  children,
  className,
  ...props
}: FieldLabelPatternProps) {
  if (!children) {
    return <BaseFieldLabelWithHint className={className} {...props} />;
  }
  return (
    <div className={cn('space-y-1.5', className)}>
      <BaseFieldLabelWithHint className="mb-0" {...props} />
      {children}
    </div>
  );
}

export function Message({ className, ...props }: MessageProps) {
  return <BaseMessage className={cn('items-start', className)} {...props} />;
}

export interface MessageHeaderPatternProps
  extends React.ComponentProps<'div'> {
  author?: React.ReactNode;
  timestamp?: React.ReactNode;
  badge?: React.ReactNode;
}

export function MessageHeader({
  author,
  timestamp,
  badge,
  children,
  className,
  ...props
}: MessageHeaderPatternProps) {
  return (
    <BaseMessageHeader className={cn('mb-1', className)} {...props}>
      {author && (
        <span className="font-bold text-foreground">{author}</span>
      )}
      {timestamp && (
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {timestamp}
        </span>
      )}
      {badge}
      {children}
    </BaseMessageHeader>
  );
}

export interface BubblePatternProps extends React.ComponentProps<'div'> {
  variant?: 'default' | 'muted' | 'clinical' | 'ghost' | 'accent';
}

export function Bubble({
  variant = 'default',
  className,
  children,
  ...props
}: BubblePatternProps) {
  const mappedVariant =
    variant === 'accent'
      ? 'clinical'
      : variant === 'default'
      ? 'muted'
      : variant;

  return (
    <BaseBubble
      variant={mappedVariant}
      className={cn(
        variant === 'accent' && 'bg-primary/[0.06] border-primary/30',
        className
      )}
      {...props}
    >
      <BubbleContent>{children}</BubbleContent>
    </BaseBubble>
  );
}

