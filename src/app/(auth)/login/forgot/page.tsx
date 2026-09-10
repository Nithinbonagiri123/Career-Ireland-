import { Mail } from 'lucide-react';
import { FadeUp } from '@/components/motion/motion-primitives';
import { ForgotForm } from './forgot-form';

export const metadata = { title: 'Forgot password · Ireland Career Gateway' };

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/60 px-4 py-10">
      <FadeUp className="w-full max-w-md">
        <div className="rounded-2xl border bg-card p-8 shadow-lg shadow-foreground/5">
          <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-accent/10 text-accent">
            <Mail className="size-5" />
          </div>
          <h1 className="mb-6 text-center text-xl font-semibold tracking-tight">
            Forgot your password?
          </h1>

          <ForgotForm />
        </div>
      </FadeUp>
    </div>
  );
}
