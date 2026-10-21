/**
 * Staging mail safety (release-prep requirement) — pure helpers, no env
 * or provider imports so vitest can lock the matrix down.
 *
 * When `MAIL_ALLOWED_RECIPIENT_DOMAINS` is set (comma-separated, e.g.
 * "example.test"), ONLY recipients at those domains are ever handed to
 * the real mailer; every other send is suppressed and logged with the
 * recipient reduced to its domain. Production leaves the variable unset
 * and is completely unaffected. This holds even when a tester types a
 * real person's address into the UI — the send is swallowed at the last
 * hop, below every feature's own logic.
 */
export function parseAllowedDomains(raw: string | undefined): string[] | null {
  if (!raw) return null;
  const domains = raw
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  return domains.length > 0 ? domains : null;
}

export function isRecipientAllowed(to: string, allowedDomains: string[] | null): boolean {
  if (allowedDomains === null) return true; // sink disabled — normal sending
  const at = to.lastIndexOf('@');
  if (at < 0) return false;
  const domain = to
    .slice(at + 1)
    .trim()
    .toLowerCase();
  return allowedDomains.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/** Log-safe form of a recipient: domain only, never the local part. */
export function recipientDomain(to: string): string {
  const at = to.lastIndexOf('@');
  return at >= 0 ? to.slice(at + 1).toLowerCase() : '(malformed)';
}
