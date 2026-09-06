import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import type { Mailer, MailMessage } from './types';

/**
 * Resend (https://resend.com) mailer. Uses fetch to the public REST API so we
 * don't need the SDK — one fewer dep, and the API surface is trivial.
 *
 * On failure we throw so callers can decide (password-reset request treats a
 * mailer failure as retryable). Never log the recipient plaintext in any
 * error path — the recipient is potentially PII we don't want in log
 * aggregators.
 */
export const resendMailer: Mailer = {
  async send(message: MailMessage): Promise<void> {
    if (!env.RESEND_API_KEY || !env.MAIL_FROM) {
      throw new Error('resend mailer requires RESEND_API_KEY + MAIL_FROM');
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      }),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      // Log without the recipient PII; caller-side context is enough.
      logger.error(
        { status: response.status, provider: 'resend', body: bodyText.slice(0, 500) },
        'resend send failed',
      );
      throw new Error(`resend send failed with status ${response.status}`);
    }
  },
};
