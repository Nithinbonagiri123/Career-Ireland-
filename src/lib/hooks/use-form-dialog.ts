'use client';

import { useCallback, useRef, useState } from 'react';
import type { DefaultValues, FieldValues, UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';

import type { ActionResult } from '@/lib/result';

type ValuesSource<TValues extends FieldValues> =
  | DefaultValues<TValues>
  | (() => DefaultValues<TValues>);

export type FormDialogOptions<TValues extends FieldValues> = {
  defaultOpen?: boolean;
  /**
   * What the form shows each time the dialog opens. Rarely needed: by default
   * the dialog opens with the `defaultValues` the caller passed to `useForm`
   * on the most recent render (see below). Pass this only when the opening
   * values are not the form's `defaultValues` — an object, or a getter that
   * is called at open time.
   */
  values?: ValuesSource<TValues>;
};

/**
 * Open the dialog with `values`, falling back to the `defaultValues` the
 * caller passed to `useForm` on its latest render, then to the defaults
 * captured on the first render. Exported for the unit test.
 *
 * `control._options` is react-hook-form's copy of the latest `useForm`
 * props (re-assigned on every render). Reading it means an Edit dialog that
 * builds `defaultValues` from a fresh `initial` prop (after
 * `router.refresh()`) opens on the current record without any caller change.
 * The unit test pins this behaviour against the installed react-hook-form.
 */
export function openingValues<TValues extends FieldValues>(
  form: Pick<UseFormReturn<TValues>, 'control'>,
  firstDefaults: DefaultValues<TValues> | undefined,
  values?: ValuesSource<TValues>,
): DefaultValues<TValues> | undefined {
  if (values !== undefined) return typeof values === 'function' ? values() : values;
  const latest = (form.control as { _options?: { defaultValues?: unknown } })._options
    ?.defaultValues;
  if (latest && typeof latest === 'object') return latest as DefaultValues<TValues>;
  return firstDefaults;
}

function snapshot<T>(v: T): T {
  try {
    return structuredClone(v);
  } catch {
    return v;
  }
}

/**
 * State + handlers shared by every `useForm` dialog:
 *
 *   - `open` / `setOpen` / `onOpenChange` for Dialog visibility
 *   - `formError` (top-of-form banner), cleared on open, close and submit
 *   - `submit(data, action, { successMessage, onSuccess })` that clears the
 *     banner, runs the action, shows the error on failure, or toasts +
 *     closes on success.
 *
 * Reset rule: every OPEN starts a fresh session. The form is reset when the
 * dialog opens (via the trigger, `onOpenChange(true)` or `setOpen(true)`),
 * not when it closes, so the closing animation never flashes blank fields.
 *
 *   - Create dialogs (`defaultValues` blank): open blank every time — after
 *     a successful create and after Cancel. Values from the previous session
 *     are never kept, and submitted values never become the new defaults.
 *   - Edit dialogs (`defaultValues` built from an `initial` prop): open on
 *     the record as the page currently has it. The dialog's latest render
 *     wins, so a `router.refresh()` that changed the record (e.g. the server
 *     demoted another primary contact) is reflected on the next open.
 *
 * Usage — no change needed for the common case:
 *
 *   const form = useForm<Input>({
 *     resolver: zodResolver(Schema),
 *     defaultValues: { id: initial?.id, name: initial?.name ?? '' },
 *   });
 *   const { open, onOpenChange, formError, submit } = useFormDialog(form);
 *   ...
 *   <Dialog open={open} onOpenChange={onOpenChange}>
 *
 * Only if the opening values are NOT the `defaultValues` (e.g. a prefill
 * chosen after mount), pass them explicitly:
 *
 *   useFormDialog(form, { values: () => ({ ...blank, employerId: picked }) });
 *
 * Do not call `form.reset(data)` after a successful submit yourself — that
 * turns the submitted values into the defaults (the old prefilled-dialog bug).
 */
export function useFormDialog<TValues extends FieldValues>(
  form: UseFormReturn<TValues>,
  opts?: FormDialogOptions<TValues>,
) {
  const [open, setOpenState] = useState(opts?.defaultOpen ?? false);
  const [formError, setFormError] = useState<string | null>(null);

  // First-render defaults (a deep copy: RHF mutates its value store in place).
  const firstDefaults = useRef<DefaultValues<TValues> | undefined>(undefined);
  if (firstDefaults.current === undefined) {
    firstDefaults.current = snapshot(form.getValues()) as DefaultValues<TValues>;
  }
  // Latest `values` option, read at open time (not captured in a stale closure).
  const valuesRef = useRef(opts?.values);
  valuesRef.current = opts?.values;

  const startSession = useCallback(() => {
    form.reset(openingValues(form, firstDefaults.current, valuesRef.current));
    setFormError(null);
  }, [form]);

  const setOpen = useCallback(
    (next: boolean) => {
      if (next) startSession();
      else setFormError(null);
      setOpenState(next);
    },
    [startSession],
  );

  const onOpenChange = setOpen;

  const submit = useCallback(
    async <TData>(
      data: TValues,
      action: (input: TValues) => Promise<ActionResult<TData>>,
      opts: {
        /** Toast text; a function gets the action's result (e.g. to name what changed). */
        successMessage: string | ((data: TData) => string);
        onSuccess?: (data: TData) => void;
      },
    ): Promise<boolean> => {
      setFormError(null);
      const r = await action(data);
      if (!r.ok) {
        setFormError(r.error.message);
        return false;
      }
      toast.success(
        typeof opts.successMessage === 'function'
          ? opts.successMessage(r.data)
          : opts.successMessage,
      );
      opts.onSuccess?.(r.data);
      // No reset here: the next open resets (see "Reset rule" above).
      setOpenState(false);
      return true;
    },
    [],
  );

  return { open, setOpen, onOpenChange, formError, setFormError, submit };
}
