'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { safeCallbackUrl } from '@/lib/auth/safe-callback';
import { cn } from '@/lib/utils';
import { loginAction } from '@/modules/auth/actions';
import { type LoginInput, LoginSchema } from '@/modules/auth/schemas';

const LOGIN_BUTTON =
  'inline-flex h-10 w-full items-center justify-center rounded-md bg-[#4f7a2f] text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#446b28] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f7a2f]/40 disabled:opacity-70';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.85-.08-1.66-.22-2.44H12v4.62h6.44a5.5 5.5 0 0 1-2.39 3.62v3h3.86c2.26-2.08 3.58-5.15 3.58-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.95-2.93l-3.86-3c-1.08.73-2.46 1.16-4.09 1.16-3.14 0-5.8-2.12-6.75-4.97H1.28v3.1A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.25 14.26A7.2 7.2 0 0 1 4.87 12c0-.79.14-1.55.38-2.26V6.64H1.28A11.98 11.98 0 0 0 0 12c0 1.94.46 3.77 1.28 5.36l3.97-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.28 6.64l3.97 3.1C6.2 6.9 8.86 4.77 12 4.77Z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden fill="currentColor">
      <path d="M16.36 12.6c0-2.72 2.22-4.02 2.32-4.09-1.27-1.85-3.24-2.1-3.94-2.13-1.68-.17-3.28.98-4.13.98-.86 0-2.17-.96-3.57-.93-1.83.03-3.53 1.07-4.48 2.7-1.92 3.32-.49 8.22 1.37 10.92.92 1.32 2 2.8 3.4 2.75 1.37-.05 1.88-.88 3.53-.88 1.65 0 2.11.88 3.55.85 1.47-.03 2.4-1.34 3.29-2.67 1.04-1.53 1.47-3.01 1.5-3.09-.03-.02-2.87-1.1-2.9-4.41ZM13.71 4.53c.75-.91 1.26-2.18 1.12-3.44-1.08.04-2.4.72-3.18 1.63-.7.8-1.31 2.09-1.15 3.32 1.21.1 2.44-.61 3.21-1.51Z" />
    </svg>
  );
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = safeCallbackUrl(searchParams.get('callbackUrl'));
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onBlur',
  });

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    const result = await loginAction(data);
    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }
    router.replace(callbackUrl);
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
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

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password" className="text-xs font-medium text-muted-foreground">
            Password
          </Label>
          <Link
            href="/login/forgot"
            className="text-xs font-medium text-[#3b6ca6] transition-colors hover:text-[#2a548a]"
          >
            forgot password
          </Link>
        </div>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          className="h-10"
          aria-invalid={Boolean(errors.password)}
          {...register('password')}
        />
        {errors.password && (
          <p className="text-xs text-destructive" role="alert">
            {errors.password.message}
          </p>
        )}
      </div>

      <label
        htmlFor="remember"
        className="flex cursor-pointer select-none items-center gap-2 pt-0.5 text-xs text-muted-foreground"
      >
        <Checkbox id="remember" name="remember" />
        Remember for 30 days
      </label>

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

      <button type="submit" className={cn(LOGIN_BUTTON, 'mt-2')} disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Signing in…
          </>
        ) : (
          'Login'
        )}
      </button>

      <div className="relative py-1 text-center">
        <span className="relative z-10 bg-card px-3 text-[11px] uppercase tracking-wider text-muted-foreground">
          Or
        </span>
        <span className="absolute inset-x-0 top-1/2 -z-0 border-t" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          variant="outline"
          className="h-10 text-xs font-normal"
          disabled
          title="SSO is not configured yet"
        >
          <GoogleIcon />
          <span className="ml-2">Sign in with Google</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-10 text-xs font-normal"
          disabled
          title="SSO is not configured yet"
        >
          <AppleIcon />
          <span className="ml-2">Sign in with Apple</span>
        </Button>
      </div>
    </form>
  );
}
