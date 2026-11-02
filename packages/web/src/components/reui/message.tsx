import * as React from 'react';
import { useEffect, useState } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Check, Copy, Stethoscope, ThumbsDown, ThumbsUp } from 'lucide-react';
import { cn } from '@/lib/utils';

const messageVariants = cva('group/message flex w-full items-end gap-2.5', {
  variants: {
    align: {
      start: 'justify-start',
      end: 'flex-row-reverse justify-start',
    },
  },
  defaultVariants: {
    align: 'start',
  },
});

export interface MessageProps
  extends React.ComponentProps<'div'>,
    VariantProps<typeof messageVariants> {}

export function Message({ className, align = 'start', ...props }: MessageProps) {
  return (
    <div
      data-slot="message"
      data-align={align}
      className={cn(messageVariants({ align }), className)}
      {...props}
    />
  );
}

export function MessageGroup({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="message-group"
      className={cn('flex flex-col gap-1.5', className)}
      {...props}
    />
  );
}

export function MessageAvatar({
  className,
  children,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="message-avatar"
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full select-none',
        !children && 'invisible',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function MessageContent({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="message-content"
      className={cn(
        'flex max-w-[88%] min-w-0 flex-col gap-1 sm:max-w-[78%]',
        'group-data-[align=end]/message:items-end',
        'group-data-[align=start]/message:items-start',
        className
      )}
      {...props}
    />
  );
}

export function MessageHeader({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="message-header"
      className={cn(
        'text-muted-foreground flex flex-wrap items-center gap-1.5 px-1 text-xs leading-none font-medium',
        className
      )}
      {...props}
    />
  );
}

export function MessageFooter({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="message-footer"
      className={cn(
        'text-muted-foreground flex flex-wrap items-center gap-1.5 px-1 text-[11px] leading-none',
        'group-data-[align=end]/message:justify-end',
        className
      )}
      {...props}
    />
  );
}

const bubbleVariants = cva(
  'relative max-w-full rounded-2xl text-sm leading-relaxed transition-colors break-words',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground rounded-br-sm shadow-xs',
        muted:
          'bg-card text-card-foreground border border-border rounded-bl-sm shadow-xs',
        clinical:
          'bg-card text-card-foreground border border-primary/25 rounded-bl-sm shadow-xs',
        ghost: 'bg-transparent text-foreground p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BubbleProps
  extends React.ComponentProps<'div'>,
    VariantProps<typeof bubbleVariants> {}

export function Bubble({ className, variant = 'default', ...props }: BubbleProps) {
  return (
    <div
      data-slot="bubble"
      data-variant={variant}
      className={cn(bubbleVariants({ variant }), className)}
      {...props}
    />
  );
}

export function BubbleContent({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="bubble-content"
      className={cn(
        'px-3.5 py-2.5 group-data-[variant=ghost]/bubble:p-0',
        className
      )}
      {...props}
    />
  );
}

/**
 * ReUI c-message-4 pattern: Reply actions toolbar under an assistant message.
 * Mobile-first with accessible touch targets, copy feedback, thumbs rating,
 * and optional 1-tap "Perguntar ao médico" handoff.
 */
export function AssistantReplyActions({
  content,
  timestamp,
  onAskDoctor,
  className,
}: {
  content: string;
  timestamp?: string;
  onAskDoctor?: (text: string) => void;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [vote, setVote] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(id);
  }, [copied]);

  return (
    <MessageFooter className={cn('mt-1 gap-1 pt-0.5', className)}>
      {timestamp && (
        <span className="text-muted-foreground pe-1 text-[11px] tabular-nums">
          {timestamp}
        </span>
      )}

      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText?.(content);
          setCopied(true);
        }}
        aria-label={copied ? 'Resposta copiada' : 'Copiar resposta'}
        title={copied ? 'Copiado!' : 'Copiar resposta'}
        className={cn(
          'inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors cursor-pointer border-0',
          copied
            ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
            : 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
        )}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        <span>{copied ? 'Copiado' : 'Copiar'}</span>
      </button>

      {onAskDoctor && (
        <button
          type="button"
          onClick={() => onAskDoctor(content)}
          aria-label="Enviar dúvida para um médico"
          title="Encaminhar para avaliação médica"
          className="inline-flex h-7 items-center gap-1 rounded-md bg-primary/10 px-2.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/18 cursor-pointer border-0"
        >
          <Stethoscope className="size-3.5" />
          <span>Perguntar ao médico</span>
        </button>
      )}

      <div className="ms-auto inline-flex items-center gap-0.5">
        <button
          type="button"
          aria-label="Resposta útil"
          title="Resposta útil"
          aria-pressed={vote === 'up'}
          onClick={() => setVote(vote === 'up' ? null : 'up')}
          className={cn(
            'inline-flex size-7 items-center justify-center rounded-md transition-colors cursor-pointer border-0',
            vote === 'up'
              ? 'bg-primary/15 text-primary'
              : 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <ThumbsUp className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Resposta pouco útil"
          title="Resposta pouco útil"
          aria-pressed={vote === 'down'}
          onClick={() => setVote(vote === 'down' ? null : 'down')}
          className={cn(
            'inline-flex size-7 items-center justify-center rounded-md transition-colors cursor-pointer border-0',
            vote === 'down'
              ? 'bg-destructive/15 text-destructive'
              : 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <ThumbsDown className="size-3.5" />
        </button>
      </div>
    </MessageFooter>
  );
}

