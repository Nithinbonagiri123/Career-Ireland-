import { AlertCircle, ArrowLeft, KeyRound } from 'lucide-react';
import Link from 'next/link';
import { FadeUp } from '@/components/motion/motion-primitives';
import { verifyResetToken } from '@/modules/auth/reset';
import { ResetForm } from './reset-form';

export const metadata = { title: 'Reset password · Ireland Career Gateway' };
export const dynamic = 'force-dynamic';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const check = token ? await verifyResetToken(token) : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/60 px-4 py-10">
      <FadeUp className="w-full max-w-md">
        <div className="rounded-2xl border bg-card p-8 shadow-lg shadow-foreground/5">
          <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-accent/10 text-accent">
            <KeyRound className="size-5" />
          </div>
          <h1 className="mb-6 text-center text-xl font-semibold tracking-tight">
            Reset your password
          </h1>

          {!token || !check ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-3 text-xs text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <div className="space-y-1">
                  <p className="font-medium">This reset link is not valid</p>
                  <p>
                    The link may have expired (1 hour lifetime) or already been used. Request a new
                    one to try again.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Link
                  href="/login/forgot"
                  className="inline-flex h-10 w-full items-center justify-center rounded-md bg-[#4f7a2f] text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#446b28]"
                >
                  Request a new reset link
                </Link>
                <Link
                  href="/login"
                  className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ArrowLeft className="size-4" /> Back to sign in
                </Link>
              </div>
            </div>
          ) : (
            <ResetForm token={token} email={check.email} />
          )}
        </div>
      </FadeUp>
    </div>
  );
}
