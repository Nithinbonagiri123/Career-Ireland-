/**
 * Company letterhead used on invoices and receipts.
 *
 * TODO: replace the placeholder text with the real Career Ireland Ltd.
 * legal name, registered address, company registration number, and VAT
 * number once the customer provides them. When they arrive, swap the
 * constants below — nothing else changes.
 *
 * If in future you want per-tenant or per-branch letterheads, promote
 * this to a `company_settings` DB row read at request time.
 */
export const COMPANY_INFO = {
  legalName: 'Career Ireland Ltd',
  addressLines: ['[Registered address — TBC]', 'Ireland'],
  contactEmail: 'billing@careerireland.example',
  contactPhone: '',
  registrationNumber: '[Company number — TBC]',
  vatNumber: '[VAT number — TBC]',
  logoText: 'CI',
} as const;
