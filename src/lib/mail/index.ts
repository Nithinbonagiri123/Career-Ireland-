import { env } from '@/lib/env';
import { consoleMailer } from './console-mailer';
import { resendMailer } from './resend-mailer';
import type { Mailer } from './types';

/**
 * Resolve the mailer per the current env. Callers depend on `getMailer()`,
 * not the concrete providers — allows swapping without touching callers.
 *
 * Not memoised: env is read at module load anyway, and re-selection is
 * cheap. Explicit lookups make tests easy (temporarily set MAIL_PROVIDER,
 * call getMailer, restore).
 */
export function getMailer(): Mailer {
  return env.MAIL_PROVIDER === 'resend' ? resendMailer : consoleMailer;
}

export type { Mailer, MailMessage } from './types';
