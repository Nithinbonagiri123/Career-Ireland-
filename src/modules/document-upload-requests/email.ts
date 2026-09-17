import { format } from 'date-fns';

/**
 * Compose the "please upload your documents" email. Plaintext body is
 * always sent (safer for spam filters, works in every client); an HTML
 * body is included for a nicer render where supported.
 *
 * The URL is included as raw text — many mail clients auto-link URLs,
 * and staff pasting it into WhatsApp still works.
 */
export function renderDocumentRequestEmail(input: {
  candidateName: string;
  uploadUrl: string;
  requestedItems: string[];
  expiresAt: Date;
}) {
  const expiryLine = `This link stops working on ${format(input.expiresAt, "d MMM yyyy 'at' HH:mm")}.`;
  const greeting = input.candidateName
    ? `Hi ${input.candidateName.split(' ')[0]},`
    : 'Hello,';
  const itemBullets = input.requestedItems.map((it) => `  •  ${it}`).join('\n');
  const htmlItems = input.requestedItems.map((it) => `<li>${escapeHtml(it)}</li>`).join('');

  const text = [
    greeting,
    '',
    'Ireland Career Gateway needs a few documents from you before we can start your service.',
    '',
    'Please upload the following:',
    itemBullets,
    '',
    `Upload here: ${input.uploadUrl}`,
    '',
    'The link is private and one-time — no account or password needed.',
    expiryLine,
    '',
    '— Ireland Career Gateway',
  ].join('\n');

  const html = `<!doctype html>
<html>
  <body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #111827; line-height: 1.55; max-width: 560px; margin: 24px auto; padding: 0 16px;">
    <p>${escapeHtml(greeting)}</p>
    <p>Ireland Career Gateway needs a few documents from you before we can start your service.</p>
    <p><strong>Please upload the following:</strong></p>
    <ul>${htmlItems}</ul>
    <p style="margin: 24px 0;">
      <a href="${input.uploadUrl}" style="display:inline-block;background:#065f46;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:600;">
        Upload documents
      </a>
    </p>
    <p style="font-size:13px;color:#4b5563;">
      Or paste this into your browser:<br>
      <span style="word-break:break-all;">${escapeHtml(input.uploadUrl)}</span>
    </p>
    <p style="font-size:13px;color:#6b7280;">
      The link is private and one-time — no account or password needed. ${escapeHtml(expiryLine)}
    </p>
    <p style="font-size:13px;color:#6b7280;">— Ireland Career Gateway</p>
  </body>
</html>`;

  return {
    subject: 'Please upload your documents — Ireland Career Gateway',
    text,
    html,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
