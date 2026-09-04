'use client';

import { ShieldOff } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Error boundary for portal routes. Same shape as the (app) boundary but
 * routes users back to /login rather than a staff dashboard.
 */
export default function PortalErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (!isAuthzError(error)) {
      // eslint-disable-next-line no-console
      console.error('portal error boundary caught:', error);
    }
  }, [error]);

  const authz = isAuthzError(error);

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {authz && (
            <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <ShieldOff className="size-5" />
            </div>
          )}
          <CardTitle>
            {authz ? "You don't have access to this page" : 'Something went wrong'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center text-sm text-muted-foreground">
          <p>
            {authz
              ? 'This portal is restricted to a different account type. Please sign in with the right invitation.'
              : 'An unexpected error occurred while rendering this page.'}
          </p>
          {!authz && error.digest && (
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
            <Link href="/login" className={buttonVariants({ size: 'sm' })}>
              Sign in again
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
