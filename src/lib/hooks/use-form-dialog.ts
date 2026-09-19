'use client';

import { useCallback, useState } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';

import type { ActionResult } from '@/lib/result';

/**
 * State + handlers every `*-dialog.tsx` was rolling by hand:
 *
 *   - `open` / `setOpen` for Dialog visibility
 *   - `formError` (top-of-form banner) with clearing on close + submit
 *   - `onOpenChange` that clears + resets form when the dialog closes
 *   - `submit(data, action, onSuccess?)` that:
 *       1. clears any prior form error
 *       2. calls the async action
 *       3. sets formError on failure
 *       4. toasts the success message + closes + resets the form on success
 *
 * Returns everything the caller needs. Reduces ~50 boilerplate lines per
 * dialog to a single hook call.
 */
export function useFormDialog<TValues extends FieldValues>(form: UseFormReturn<TValues>) {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const onOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) {
        form.reset();
        setFormError(null);
      }
    },
    [form],
  );

  const submit = useCallback(
    async <TData,>(
      data: TValues,
      action: (input: TValues) => Promise<ActionResult<TData>>,
      opts: { successMessage: string; onSuccess?: (data: TData) => void },
    ): Promise<boolean> => {
      setFormError(null);
      const r = await action(data);
      if (!r.ok) {
        setFormError(r.error.message);
        return false;
      }
      toast.success(opts.successMessage);
      opts.onSuccess?.(r.data);
      form.reset(data);
      setOpen(false);
      return true;
    },
    [form],
  );

  return { open, setOpen, onOpenChange, formError, setFormError, submit };
}
