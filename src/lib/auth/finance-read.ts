import { AuthorizationError } from '@/lib/errors';
import type { Business, Verb } from './permissions';
import { checkPermission, requireAnyPermission, type Session } from './session';

/**
 * Who may read bulk financial data (payments, revenue) — the same grants
 * that open the /payments page. Either one is enough; the owner bypasses
 * every permission check. Used by the Payments page and by every CSV
 * export that returns payment or revenue rows, so the page and its
 * downloads can never drift apart.
 *
 * This does not add any grant: ADMIN and FINANCE presets already hold
 * both, MANAGER holds view everywhere, and STAFF / RECRUITER /
 * DOCUMENT_SPECIALIST presets hold neither.
 */
export const FINANCE_READ_PERMISSIONS: ReadonlyArray<{
  business: Business;
  module: string;
  verb: Verb;
}> = [
  { business: 'candidate_services', module: 'payments', verb: 'view' },
  { business: 'main', module: 'accounts', verb: 'view' },
];

/** Throws AuthorizationError (audited) unless the user may read finance data. */
export function requireFinanceRead(): Promise<Session> {
  return requireAnyPermission([...FINANCE_READ_PERMISSIONS]);
}

/**
 * For API route handlers: returns a plain 403 response when the user may
 * not read finance data, or null when they may. The denial is audited by
 * `requireAnyPermission`; no financial data is fetched before this runs.
 */
export async function financeReadDeniedResponse(): Promise<Response | null> {
  try {
    await requireFinanceRead();
    return null;
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return new Response('Forbidden', {
        status: 403,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
    throw e;
  }
}

/** Non-throwing variant for showing or hiding finance export buttons. */
export async function canReadFinance(): Promise<boolean> {
  for (const p of FINANCE_READ_PERMISSIONS) {
    if (await checkPermission(p.business, p.module, p.verb)) return true;
  }
  return false;
}
