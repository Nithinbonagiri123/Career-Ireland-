'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Check, CheckCircle2, Eye, EyeOff, Loader2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { checkPasswordPolicy, MIN_PASSWORD_LENGTH } from '@/lib/auth/password-policy';
import { cn } from '@/lib/utils';
import { changePasswordAction } from '@/modules/auth/actions';
import { type ChangePasswordInput, ChangePasswordSchema } from '@/modules/auth/schemas';

type Requirement = { label: string; test: (pw: string) => boolean };

const requirements: Requirement[] = [
  {
    label: `At least ${MIN_PASSWORD_LENGTH} characters`,
    test: (p) => p.length >= MIN_PASSWORD_LENGTH,
  },
  {
    label: 'At least 3 of: lower / upper / digit / symbol',
    test: (p) => {
      let c = 0;
      if (/[a-z]/.test(p)) c++;
      if (/[A-Z]/.test(p)) c++;
      if (/\d/.test(p)) c++;
      if (/[^A-Za-z0-9]/.test(p)) c++;
      return c >= 3;
    },
  },
  {
    label: 'Not a common weak password',
    test: (p) => checkPasswordPolicy(p).every((i) => !i.toLowerCase().includes('common')),
  },
];

function passwordStrength(password: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!password) return { score: 0, label: '' };
  const issues = checkPasswordPolicy(password);
  if (issues.length > 0) {
    // Failing minimum requirements → Weak / Fair depending on length.
    if (password.length < MIN_PASSWORD_LENGTH) return { score: 1, label: 'Weak' };
    return { score: 2, label: 'Fair' };
  }
  // Passes policy — grade further by length + classes.
  let classes = 0;
  if (/[a-z]/.test(password)) classes++;
  if (/[A-Z]/.test(password)) classes++;
  if (/\d/.test(password)) classes++;
  if (/[^A-Za-z0-9]/.test(password)) classes++;
  const score = password.length >= 16 && classes === 4 ? 4 : 3;
  return { score, label: score === 4 ? 'Strong' : 'Good' };
}

function PasswordField({
  id,
  label,
  autoComplete,
  error,
  register,
  onChange,
  showControls = true,
}: {
  id: 'currentPassword' | 'newPassword' | 'confirmPassword';
  label: string;
  autoComplete: string;
  error: string | undefined;
  register: ReturnType<typeof useForm<ChangePasswordInput>>['register'];
  onChange?: (value: string) => void;
  showControls?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const reg = register(id, {
    onChange: (e) => onChange?.(e.target.value),
  });
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {showControls && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            tabIndex={-1}
          >
            {visible ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
            {visible ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      <Input
        id={id}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        {...reg}
      />
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function ChangePasswordForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(ChangePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
    mode: 'onBlur',
  });

  const strength = passwordStrength(newPassword);

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    const result = await changePasswordAction(data);
    if (!result.ok) {
      const fields = result.error.fields ?? {};
      let mappedAny = false;
      for (const [key, msg] of Object.entries(fields)) {
        if (
          msg &&
          (key === 'currentPassword' || key === 'newPassword' || key === 'confirmPassword')
        ) {
          setError(key, { message: msg });
          mappedAny = true;
        }
      }
      if (!mappedAny) setFormError(result.error.message);
      return;
    }
    setSubmitted(true);
    reset();
    setNewPassword('');
    toast.success('Password changed. Please sign in again.');
    setTimeout(() => {
      router.replace('/login');
      router.refresh();
    }, 1200);
  });

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-3 py-6 text-center"
      >
        <div className="flex size-12 items-center justify-center rounded-full bg-accent/10 text-accent">
          <CheckCircle2 className="size-6" />
        </div>
        <div>
          <div className="text-sm font-medium">Password changed</div>
          <div className="text-xs text-muted-foreground">Redirecting you to sign in…</div>
        </div>
      </motion.div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <PasswordField
        id="currentPassword"
        label="Current password"
        autoComplete="current-password"
        error={errors.currentPassword?.message}
        register={register}
      />

      <div className="space-y-3">
        <PasswordField
          id="newPassword"
          label="New password"
          autoComplete="new-password"
          error={errors.newPassword?.message}
          register={register}
          onChange={setNewPassword}
        />

        <AnimatePresence>
          {newPassword && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
              className="space-y-3"
            >
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Strength</span>
                  <span
                    className={cn(
                      'font-medium',
                      strength.score >= 3
                        ? 'text-accent'
                        : strength.score === 2
                          ? 'text-foreground'
                          : 'text-destructive',
                    )}
                  >
                    {strength.label}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {[1, 2, 3, 4].map((tier) => (
                    <div
                      key={tier}
                      className={cn(
                        'h-1 rounded-full bg-muted transition-colors',
                        strength.score >= tier &&
                          (strength.score >= 3
                            ? 'bg-accent'
                            : strength.score === 2
                              ? 'bg-foreground/60'
                              : 'bg-destructive/70'),
                      )}
                    />
                  ))}
                </div>
              </div>

              <ul className="grid gap-1 text-xs sm:grid-cols-2">
                {requirements.map((req) => {
                  const passed = req.test(newPassword);
                  return (
                    <li
                      key={req.label}
                      className={cn(
                        'flex items-center gap-1.5',
                        passed ? 'text-accent' : 'text-muted-foreground',
                      )}
                    >
                      {passed ? <Check className="size-3" /> : <X className="size-3" />}
                      <span>{req.label}</span>
                    </li>
                  );
                })}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <PasswordField
        id="confirmPassword"
        label="Confirm new password"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        register={register}
      />

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

      <div className="flex flex-col-reverse items-stretch gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          You'll be signed out of every device after changing.
        </p>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
          Change password
        </Button>
      </div>
    </form>
  );
}
