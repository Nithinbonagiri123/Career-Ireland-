'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { AlertCircle, Check, CheckCircle2, Loader2, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  checkPasswordPolicy,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  PASSWORD_POLICY_RULES,
} from '@/lib/auth/password-policy';
import { cn } from '@/lib/utils';
import { completePasswordResetAction } from '@/modules/auth/reset.actions';

/**
 * Reset-completion form. Reuses the exact same password-policy live checklist
 * that the invite-accept form does, so users see identical rules across all
 * password-set surfaces (invite / reset / change).
 */

const FormSchema = z
  .object({
    newPassword: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Minimum ${MIN_PASSWORD_LENGTH} characters`)
      .max(MAX_PASSWORD_LENGTH),
    confirmPassword: z.string().min(MIN_PASSWORD_LENGTH),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export function ResetForm({ token, email }: { token: string; email: string }) {
  const [state, setState] = useState<'idle' | 'reset' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [passwordValue, setPasswordValue] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const passwordReg = register('newPassword', {
    onChange: (e) => setPasswordValue(e.target.value),
  });
  const policyIssues = passwordValue ? checkPasswordPolicy(passwordValue, { email }) : [];
  const passesPolicy = passwordValue !== '' && policyIssues.length === 0;

  const onSubmit = handleSubmit(async (data) => {
    setErrorMessage(null);
    const r = await completePasswordResetAction({
      token,
      newPassword: data.newPassword,
      confirmPassword: data.confirmPassword,
    });
    if (!r.ok) {
      setErrorMessage(r.error.message);
      setState('error');
      return;
    }
    setState('reset');
  });

  if (state === 'reset') {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-status-success-soft text-status-success">
          <CheckCircle2 className="size-5" />
        </div>
        <div>
          <p className="text-sm font-medium">Password updated</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Sign in with <span className="font-mono">{email}</span> and your new password. Any other
            sessions have been signed out.
          </p>
        </div>
        <Link href="/login" className={buttonVariants({ size: 'sm' })}>
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <p className="text-xs text-muted-foreground">Setting a new password for</p>
        <p className="font-mono text-sm">{email}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reset-password">New password</Label>
        <Input
          id="reset-password"
          type="password"
          autoComplete="new-password"
          autoFocus
          aria-invalid={Boolean(errors.newPassword)}
          {...passwordReg}
        />
        {errors.newPassword && (
          <p className="text-xs text-destructive">{errors.newPassword.message}</p>
        )}
        {passwordValue && (
          <ul className="mt-1 grid gap-0.5 text-[11px]">
            {PASSWORD_POLICY_RULES.map((rule) => {
              const ok =
                (rule.startsWith('At least') && passwordValue.length >= MIN_PASSWORD_LENGTH) ||
                (rule.startsWith('Mix of') &&
                  ['[a-z]', '[A-Z]', '\\d', '[^A-Za-z0-9]'].filter((c) =>
                    new RegExp(c).test(passwordValue),
                  ).length >= 3) ||
                (rule.startsWith('Not a common') && passesPolicy) ||
                (rule.startsWith("Doesn't contain") && passesPolicy);
              return (
                <li
                  key={rule}
                  className={cn(
                    'flex items-center gap-1.5',
                    ok ? 'text-status-success' : 'text-muted-foreground',
                  )}
                >
                  {ok ? <Check className="size-3" /> : <X className="size-3" />}
                  <span>{rule}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reset-confirm">Confirm new password</Label>
        <Input
          id="reset-confirm"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.confirmPassword)}
          {...register('confirmPassword')}
        />
        {errors.confirmPassword && (
          <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
        )}
      </div>
      {errorMessage && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          role="alert"
        >
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          <span>{errorMessage}</span>
        </motion.div>
      )}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
        Reset password
      </Button>
    </form>
  );
}
