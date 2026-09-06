import { logger } from '@/lib/logger';
import type { Mailer, MailMessage } from './types';

/**
 * Dev/test mailer — prints the message to the app log instead of sending it.
 * The reset-URL is logged at INFO level so a developer can click it directly
 * without configuring a real mailer. NEVER used in production — env.ts refuses
 * to boot with MAIL_PROVIDER=console when NODE_ENV=production.
 */
export const consoleMailer: Mailer = {
  async send(message: MailMessage): Promise<void> {
    logger.info(
      {
        to: message.to,
        subject: message.subject,
        // Log the text body verbatim — password-reset URLs go in here on purpose
        // so the dev can copy them. Do NOT log HTML — it's noise and can leak
        // structured data if the caller ever embeds user input unescaped.
        body: message.text,
      },
      `[console-mailer] ${message.subject}`,
    );
  },
};
