import { redirect } from 'next/navigation';

/**
 * Stage 6D Wave 4 — the person-level candidate detail page redirects to
 * the unified Client Workspace. The deep-link children stay as-is:
 *   /candidates/[id]/invoices/[number]       — invoice detail + print
 *   /candidates/[id]/receipts/[number]       — receipt detail + print
 * They remain the authoritative URLs for void / credit note / refund
 * controls, and are embedded in PDFs, emails, audit events and
 * notifications. The workspace Billing tab links into them.
 *
 * Query parameters are preserved so tab-specific deep links
 * (`/candidates/{id}?tab=applications`) hit the workspace's matching tab.
 *
 * The 650-line legacy operational page is preserved in git history
 * (commit before this redirect was introduced) in case we need to
 * reference the old layout — not deleted outright per the Stage 6D
 * rule "do not delete legacy components until replacement functionality
 * and compatibility are verified."
 */
export default async function LegacyCandidateDetailRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const qsPairs: string[] = [];
  for (const [k, v] of Object.entries(sp)) {
    if (v == null) continue;
    const values = Array.isArray(v) ? v : [v];
    for (const value of values)
      qsPairs.push(`${encodeURIComponent(k)}=${encodeURIComponent(value)}`);
  }
  const qs = qsPairs.length > 0 ? `?${qsPairs.join('&')}` : '';
  redirect(`/clients/${id}${qs}`);
}
