import * as React from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FieldLabelWithHintProps extends React.ComponentProps<'div'> {
  htmlFor?: string;
  label: string;
  hint?: string;
  addon?: React.ReactNode;
  required?: boolean;
}

/**
 * ReUI profile-3 FieldLabelWithHint pattern.
 * Pairs a clean label with an inline tooltip/title hint and a semantic status Badge addon (e.g. Verified, CRM, Obrigatório).
 */
export function FieldLabelWithHint({
  htmlFor,
  label,
  hint,
  addon,
  required,
  className,
  ...props
}: FieldLabelWithHintProps) {
  return (
    <div
      data-slot="field-label-with-hint"
      className={cn('mb-1.5 flex flex-wrap items-center gap-1.5', className)}
      {...props}
    >
      <label
        htmlFor={htmlFor}
        className="text-foreground text-xs font-semibold tracking-tight sm:text-[13px]"
      >
        {label}
        {required && <span className="text-destructive ms-0.5">*</span>}
      </label>
      {hint && (
        <span
          title={hint}
          aria-label={hint}
          className="text-muted-foreground hover:text-foreground inline-flex cursor-help items-center rounded-sm p-0.5 transition-colors"
        >
          <Info className="size-3.5" aria-hidden="true" />
        </span>
      )}
      {addon && <div className="ms-auto flex items-center gap-1">{addon}</div>}
    </div>
  );
}

