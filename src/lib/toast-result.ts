import { toast } from 'sonner';

import type { ActionResult } from '@/lib/result';

/**
 * Standard "toast the outcome of a server action" helper. Every table
 * row-action and every dialog was writing:
 *
 *   if (r.ok) toast.success('X'); else toast.error(r.error.message);
 *
 * now they write:
 *
 *   toastResult(r, { success: 'X' });
 *
 * Returns `r.ok` so callers can chain: `if (toastResult(r, …)) refetch()`.
 * Passing an `error` overrides the server's message — use sparingly, only
 * when the server message wouldn't make sense to the user in context.
 */
export function toastResult<T>(
  result: ActionResult<T>,
  messages: { success: string; error?: string },
): boolean {
  if (result.ok) {
    toast.success(messages.success);
    return true;
  }
  toast.error(messages.error ?? result.error.message);
  return false;
}
