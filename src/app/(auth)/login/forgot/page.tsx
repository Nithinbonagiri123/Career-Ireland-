import { ArrowLeft, Mail } from 'lucide-react';
import Link from 'next/link';
import { FadeUp } from '@/components/motion/motion-primitives';

export const metadata = { title: 'Forgot password · Career Ireland' };

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/60 px-4 py-10">
      <FadeUp className="w-full max-w-md">
        <div className="rounded-2xl border bg-card p-8 shadow-lg shadow-foreground/5">
          <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-accent/10 text-accent">
            <Mail className="size-5" />
          </div>
          <h1 className="text-center text-xl font-semibold tracking-tight">
            Forgot your password?
          </h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Career Ireland uses invite-only staff access. Self-service reset isn't available yet —
            please contact your administrator to have your password reset.
          </p>

          <div className="mt-6 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            <div className="font-medium text-foreground">Administrator</div>
            <div>nikkibonagiri@gmail.com</div>
          </div>

          <Link
            href="/login"
            className="mt-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Back to sign in
          </Link>
        </div>
      </FadeUp>
    </div>
  );
}
