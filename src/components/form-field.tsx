import type * as React from 'react';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * Standard "labeled input" wrapper — every dialog was writing this by
 * hand:
 *
 *   <div className="space-y-1.5">
 *     <Label htmlFor="foo">Foo</Label>
 *     <Input {...register('foo')} />
 *     {errors.foo && <p className="text-xs text-destructive">…</p>}
 *   </div>
 *
 * Now it's one component. Pass any input-like child; `htmlFor` is
 * derived from the child's `id` prop when available so screen readers
 * still link the label to the control.
 *
 * `hint` renders under the field for one-line explanations. `error`
 * takes precedence over `hint` when both are set — the error is the
 * more urgent thing to show.
 */
export type FormFieldProps = {
  id?: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  /** Add a "*" indicator + `aria-required` on the child. Purely visual — Zod is still the source of truth. */
  required?: boolean;
  className?: string;
  children: React.ReactNode;
};

export function FormField({
  id,
  label,
  hint,
  error,
  required = false,
  className,
  children,
}: FormFieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id} className="flex items-center gap-1">
        {label}
        {required && (
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
        )}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
