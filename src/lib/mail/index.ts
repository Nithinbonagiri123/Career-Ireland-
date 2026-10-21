import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { consoleMailer } from './console-mailer';
import { resendMailer } from './resend-mailer';
import { isRecipientAllowed, parseAllowedDomains, recipientDomain } from './sink';
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
  const base = env.MAIL_PROVIDER === 'resend' ? resendMailer : consoleMailer;
  // Staging mail safety — with MAIL_ALLOWED_RECIPIENT_DOMAINS set, any
  // recipient outside the allowlist is suppressed here, below every
  // feature, so a tester typing a real address can never cause a real
  // send. Unset (production/dev default) → zero behaviour change.
  const allowed = parseAllowedDomains(env.MAIL_ALLOWED_RECIPIENT_DOMAINS);
  if (allowed === null) return base;
  return {
    async send(message) {
      if (!isRecipientAllowed(message.to, allowed)) {
        logger.warn(
          { recipientDomain: recipientDomain(message.to), subject: message.subject },
          'mail suppressed by MAIL_ALLOWED_RECIPIENT_DOMAINS (staging sink)',
        );
        return;
      }
      return base.send(message);
    },
  };
}

export type { Mailer, MailMessage } from './types';
