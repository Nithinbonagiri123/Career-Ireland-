/**
 * Invoice / receipt pages exist per payer: /candidates/<personId>/… for a
 * person and /employers/<employerId>/… for an employer. A row whose payer
 * isn't recorded is shown without an Open link rather than guessed.
 */
export function caseBillingHref(
  kind: 'invoices' | 'receipts',
  row: { number: string; payerPersonId: string | null; payerEmployerId: string | null },
): string | null {
  if (row.payerPersonId) return `/candidates/${row.payerPersonId}/${kind}/${row.number}`;
  if (row.payerEmployerId) return `/employers/${row.payerEmployerId}/${kind}/${row.number}`;
  return null;
}
