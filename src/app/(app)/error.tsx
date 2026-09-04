'use client';

import { ShieldOff } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Error boundary for the internal (app) route group. Renders a 403-style card
 * for AuthorizationError so users who wander into a page they can't see get a
 * clean explanation instead of a generic crash page. Any other error rethrows
 * so Next's default error page still surfaces real bugs.
 *
 * `AppError` subclass instances (thrown from server components via
 * `requireRole` / `requirePortal*`) are serialised by Next as plain Error
 * objects — we detect them by inspecting the message string, which is
 * `'Not authorized'` for AuthorizationError.
 */
export default function AppErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Report non-auth errors to whatever monitoring you wire up later.
    if (!isAuthzError(error)) {
      // eslint-disable-next-line no-console
      console.error('(app) error boundary caught:', error);
    }
  }, [error]);

  if (isAuthzError(error)) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <ShieldOff className="size-5" />
            </div>
            <CardTitle>You don't have access to this page</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center text-sm text-muted-foreground">
            <p>
              This section is restricted to a different role. If you think you should be able to see
              it, ask an administrator.
            </p>
            <div className="flex items-center justify-center gap-2">
              <Link href="/dashboard" className={buttonVariants({ size: 'sm' })}>
                Go to dashboard
              </Link>
              <button
                type="button"
                onClick={reset}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Try again
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Something went wrong</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center text-sm text-muted-foreground">
          <p>An unexpected error occurred while rendering this page.</p>
          {error.digest && (
            <p className="font-mono text-[11px] text-muted-foreground/70">ref: {error.digest}</p>
          )}
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={reset}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Try again
            </button>
            <Link href="/dashboard" className={buttonVariants({ size: 'sm' })}>
              Back to dashboard
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function isAuthzError(error: Error): boolean {
  return error.name === 'AuthorizationError' || error.message === 'Not authorized';
}
