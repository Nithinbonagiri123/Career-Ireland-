'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { acceptInvitationAction } from '@/modules/portal/actions';

const FormSchema = z
  .object({
    password: z.string().min(8, 'Minimum 8 characters').max(200),
    confirm: z.string().min(8),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords don't match",
    path: ['confirm'],
  });

export function AcceptInviteForm({ token, email }: { token: string; email: string }) {
  const [state, setState] = useState<'idle' | 'accepted' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: { password: '', confirm: '' },
  });

  const onSubmit = handleSubmit(async (data) => {
    setErrorMessage(null);
    const r = await acceptInvitationAction({ token, password: data.password });
    if (!r.ok) {
      setErrorMessage(r.error.message);
      setState('error');
      return;
    }
    setState('accepted');
  });

  if (state === 'accepted') {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
          <CheckCircle2 className="size-5" />
        </div>
        <div>
          <p className="text-sm font-medium">Account created</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Sign in with <span className="font-mono">{email}</span> and the password you just set.
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
        <p className="text-xs text-muted-foreground">You're setting a password for</p>
        <p className="font-mono text-sm">{email}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ai-password">Password</Label>
        <Input
          id="ai-password"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.password)}
          {...register('password')}
        />
        {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ai-confirm">Confirm password</Label>
        <Input
          id="ai-confirm"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.confirm)}
          {...register('confirm')}
        />
        {errors.confirm && <p className="text-xs text-destructive">{errors.confirm.message}</p>}
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
        Create account
      </Button>
    </form>
  );
}
