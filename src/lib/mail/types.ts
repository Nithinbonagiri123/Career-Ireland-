/**
 * Mail delivery abstraction. Every caller depends on `Mailer` and never on a
 * concrete provider. Swap providers by changing MAIL_PROVIDER in env.
 *
 * The interface is intentionally minimal — text + html. Templates are strings
 * built by the caller (see src/modules/auth/reset.ts) so future migration to a
 * templating engine is a purely additive change.
 */
export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  /** Optional HTML body. If omitted, `text` is sent as-is. */
  html?: string;
};

export type Mailer = {
  send(message: MailMessage): Promise<void>;
};
