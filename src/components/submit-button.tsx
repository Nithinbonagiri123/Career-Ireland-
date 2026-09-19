import { Loader2 } from 'lucide-react';
import type * as React from 'react';

import { Button } from '@/components/ui/button';

/**
 * `<Button type="submit">` + a loading spinner on the left when
 * `loading` is true. Also disables itself while loading so users can't
 * double-submit.
 *
 * Every dialog was inlining this exact pattern with `isSubmitting` from
 * react-hook-form. Now it's one component.
 */
export function SubmitButton({
  loading = false,
  disabled = false,
  children,
  ...rest
}: React.ComponentProps<typeof Button> & { loading?: boolean }) {
  return (
    <Button type="submit" disabled={loading || disabled} {...rest}>
      {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
      {children}
    </Button>
  );
}
