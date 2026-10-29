'use client';

import { Loader2 } from 'lucide-react';
import { type ReactElement, type ReactNode, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { FormErrorAlert } from '@/components/form-error-alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { ActionResult } from '@/lib/result';

export type FieldErrors = Record<string, string | string[] | undefined>;

export function fieldError(errors: FieldErrors, key: string): string | undefined {
  const v = errors[key];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * R3 — shared dialog shell for Interviews & Offers forms: one submit, a
 * pending state, the server's message shown in the dialog (not only a
 * toast), field-level errors handed back to the form; the server action
 * revalidates the page on success. The server action stays the single source of validation.
 */
export function ActionDialog<T>({
  trigger,
  title,
  description,
  submitLabel,
  destructive,
  successMessage,
  onSubmit,
  children,
  wide,
}: {
  trigger: ReactElement;
  title: string;
  description?: ReactNode;
  submitLabel: string;
  destructive?: boolean;
  successMessage: string;
  onSubmit: () => Promise<ActionResult<T>>;
  children: (errors: FieldErrors) => ReactNode;
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});

  const submit = () =>
    start(async () => {
      setFormError(null);
      setErrors({});
      let r: ActionResult<T>;
      try {
        r = await onSubmit();
      } catch {
        setFormError('The request did not complete. Check your connection and try again.');
        return;
      }
      if (!r.ok) {
        setFormError(r.error.message);
        setErrors((r.error.fields ?? {}) as FieldErrors);
        return;
      }
      toast.success(successMessage);
      setOpen(false);
      // The server action revalidates the page itself; a second
      // router.refresh() here would cancel that response mid-stream.
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setFormError(null);
          setErrors({});
        }
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className={wide ? 'max-w-xl' : 'max-w-md'}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {children(errors)}
          <FormErrorAlert error={formError} />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button
              type="submit"
              disabled={pending}
              variant={destructive ? 'destructive' : 'default'}
            >
              {pending && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
