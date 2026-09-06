'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, Mail } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { requestPasswordResetAction } from '@/modules/auth/reset.actions';
import { type RequestPasswordResetInput, RequestPasswordResetSchema } from '@/modules/auth/schemas';

/**
 * Enumeration-safe: the server action always returns { ok: true } regardless
 * of whether the email exists, so this component renders the same success
 * message either way. Never surface "email not found" — that turns the
 * endpoint into a user-enumeration oracle.
 */

const SUBMIT_BUTTON =
  'inline-flex h-10 w-full items-center justify-center rounded-md bg-[#4f7a2f] text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#446b28] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f7a2f]/40 disabled:opacity-70';

export function ForgotForm() {
  const [status, setStatus] = useState<'idle' | 'submitted'>('idle');
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    getValues,
  } = useForm<RequestPasswordResetInput>({
    resolver: zodResolver(RequestPasswordResetSchema),
    defaultValues: { email: '' },
    mode: 'onBlur',
  });

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    const result = await requestPasswordResetAction(data);
    if (!result.ok) {
      // Only reachable on client-side validation echo — server returns ok even
      // when the email is unknown or the mailer failed.
      setFormError(result.error.message);
      return;
    }
    setStatus('submitted');
  });

  if (status === 'submitted') {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-3 text-xs text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">Check your inbox</p>
            <p>
              If <span className="font-medium">{getValues('email')}</span> matches an active
              account, we've sent a link to reset your password. It expires in 1 hour.
            </p>
          </div>
        </div>
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <p className="text-sm text-muted-foreground">
        Enter the email address on your Career Ireland account and we'll send you a link to reset
        your password.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-xs font-medium text-muted-foreground">
          Email address
        </Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          autoFocus
          placeholder="Enter your email"
          className="h-10"
          aria-invalid={Boolean(errors.email)}
          {...register('email')}
        />
        {errors.email && (
          <p className="text-xs text-destructive" role="alert">
            {errors.email.message}
          </p>
        )}
      </div>

      <AnimatePresence>
        {formError && (
          <motion.div
            key="form-error"
            initial={{ opacity: 0, y: -4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            transition={{ duration: 0.18 }}
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
            role="alert"
          >
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>{formError}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <button type="submit" className={cn(SUBMIT_BUTTON)} disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Sending…
          </>
        ) : (
          <>
            <Mail className="mr-2 size-4" />
            Send reset link
          </>
        )}
      </button>

      <Link
        href="/login"
        className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to sign in
      </Link>
    </form>
  );
}
