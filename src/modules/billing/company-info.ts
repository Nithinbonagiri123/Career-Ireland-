/**
 * Company letterhead used on invoices and receipts.
 *
 * Values sourced from the ICG blank invoice template + logo supplied
 * by the customer. This business trades as **Ireland Career Gateway**
 * and is operated by Leon De Wit as a **sole trader** — hence no
 * CRO company number.
 *
 * TODO (customer to supply — placeholders in the meantime):
 *   - Business Name Registration (RBN) number, if the trading name
 *     "Ireland Career Gateway" was registered with the CRO. Sole
 *     traders don't have a CRO company number, but a registered
 *     business name has an RBN.
 *   - VAT number, if / when the business crosses the €40k Irish VAT
 *     threshold for services.
 *   - Billing contact email (currently a placeholder — the invoice
 *     footer will render "Questions? Email …" against it).
 *
 * TODO (design / follow-ups — not blocking):
 *   - Replace the "CIG" text badge on invoice/receipt letterheads
 *     with the real shamrock logo. The source PDF lives at
 *     ~/Downloads/icg logo Tracey.pdf — needs to be exported to
 *     SVG (preferred) or PNG and dropped in /public.
 *   - Render the bank details block on invoices (not receipts) so
 *     customers paying by transfer see the IBAN + BIC + reference
 *     instruction. The ICG template puts this at the bottom.
 *   - Drop the `contactPhone` field — defined here but not used by
 *     any consumer, and the ICG template doesn't include a phone.
 */

export const COMPANY_INFO = {
  legalName: 'Ireland Career Gateway',
  /** Full trading style, used where we need to disambiguate from the
   *  short brand name — e.g. bank reference, legal footers. */
  fullLegalName: 'Leon De Wit t/a Ireland Career Gateway',
  addressLines: ['Rosslare Harbour', 'Wexford, Y35 YH22', 'Ireland'],
  contactEmail: 'billing@irelandcareergateway.ie', // TODO: confirm
  contactPhone: '',
  /** No CRO number — sole trader. RBN if trading name is registered. */
  registrationNumber: '[RBN — TBC]',
  vatNumber: '[VAT — not yet registered]',
  logoText: 'CIG',
  /** Bank details for customers paying by transfer. Referenced from
   *  the invoice footer once the render is wired up. */
  bank: {
    name: 'Bank of Ireland',
    accountName: 'Leon De Wit t/a Ireland Career Gateway',
    iban: 'IE44BOFI90671825127964',
    bic: 'BOFIEE2D',
  },
} as const;
