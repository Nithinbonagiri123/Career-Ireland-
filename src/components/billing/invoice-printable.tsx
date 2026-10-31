import { format } from 'date-fns';
import Image from 'next/image';
import { formatCurrency } from '@/lib/currency';
import type { AppSettings } from '@/lib/db/schema/app_settings';
import type { Invoice, InvoiceLineItem } from '@/lib/db/schema/billing';
import type { CreditNoteRow } from '@/modules/billing/read';

/**
 * Print-friendly invoice matching the ICG template exactly:
 *
 *   [logo]                                       INVOICE
 *   Ireland Career Gateway, Rosslare Harbour, WEXFORD, Y35 YH22
 *
 *   ┌─────────────────────────┐
 *   │ Invoice Number │ …      │
 *   │ Invoice Date   │ …      │
 *   └─────────────────────────┘
 *
 *   BILL TO:
 *   ┌─────────────────────────┐
 *   │ Customer Name  │ …      │
 *   │ Customer Email │ …      │
 *   └─────────────────────────┘
 *
 *   INVOICE DETAILS
 *   ┌────┬──────────┬────────┬────────┐
 *   │QTY │ Descr    │ Unit   │ Total  │
 *   ├────┼──────────┼────────┼────────┤
 *   │  1 │ …        │ €X     │ €X     │
 *   └────┴──────────┼────────┼────────┤
 *                   │ SubTot │ €X     │
 *                   │ VAT %  │ €X     │
 *                   │ TOTAL  │ €X     │
 *                   └────────┴────────┘
 *
 *   BANK DETAILS
 *   ┌─────────────────────────┐
 *   │ Bank         │ …        │
 *   │ Account Name │ …        │
 *   │ IBAN         │ …        │
 *   │ BIC          │ …        │
 *   └─────────────────────────┘
 *
 *   Please quote the Invoice Number in your Bank Reference and
 *   email proof of payment.
 *
 *   Thank you for your support.
 *
 * Every editable string comes from `settings` (app_settings row).
 * Empty settings values hide the entire line — no bracketed
 * placeholder text will ever surface. See memory
 * `no-hardcoded-document-content`.
 *
 * Shared between the /candidates/…/invoices/… and /employers/…/invoices/…
 * routes. Payer is passed in as a shape-agnostic object so this
 * component never touches Person vs. Employer discrimination.
 */
export type InvoicePayerView = {
  displayName: string;
  /** Additional rows to render below the customer name in the Bill To
      block. Order preserved. Rows with an empty/null value are omitted
      by the caller — the component treats whatever's here as visible. */
  contactRows?: Array<{ label: string; value: string }>;
};

export function InvoicePrintable({
  invoice,
  payer,
  settings,
  lineDescription,
  lineItems,
  creditNotes,
}: {
  invoice: Invoice;
  payer: InvoicePayerView;
  settings: AppSettings;
  /** Description shown on the QTY row. Falls back to invoice.lineDescription.
   *  Ignored when `lineItems` is provided — the multi-line table replaces
   *  the single-line view. */
  lineDescription?: string;
  /** Stage 3+ multi-line invoices. When non-empty, this replaces the
   *  single-line body with a full services table. The legacy columns
   *  (qty, unit_price, line_description) are still populated on the
   *  invoice row for historical compat but the renderer prefers lines
   *  when available. */
  lineItems?: InvoiceLineItem[];
  /** Credit notes already issued against this invoice. Renders a
   *  "Credit notes" section below the totals — critical for the
   *  audit trail on any invoice that's been partially reversed. */
  creditNotes?: CreditNoteRow[];
}) {
  const address = settings.addressLines.join(', ');
  const isVoided = invoice.status === 'VOIDED';
  // Stage B Wave 4 — a complimentary invoice is a genuine document with
  // zero totals: no bank details, no payment instructions, and the
  // admin-editable complimentary note instead. The operator's reason
  // stays internal (row + audit + detail page), never on the customer
  // document.
  const isComplimentary = invoice.settlementKind === 'COMPLIMENTARY';
  const desc = lineDescription ?? invoice.lineDescription;
  const currency = invoice.currencyCode;
  const money = (v: string) => formatCurrency(v, currency);
  const vatRate = Number.parseFloat(settings.vatRatePercent);
  // Hide the whole VAT row + label when the business isn't VAT-registered
  // (explicit flag), with a safety net for the implicit case where the
  // flag is on but the rate + line tax both happen to be zero.
  const showVatLine =
    settings.vatRegistered && (vatRate > 0 || Number.parseFloat(invoice.taxAmount) > 0);

  const bankBlockVisible =
    Boolean(settings.bankName) && Boolean(settings.bankAccountName) && Boolean(settings.bankIban);

  return (
    <article
      aria-label="Invoice document"
      className="relative mx-auto my-6 max-w-3xl rounded-2xl border border-border/60 bg-white p-10 shadow-sm max-sm:my-0 max-sm:p-4 max-sm:[&_td]:px-2 max-sm:[&_th]:px-2 max-sm:[&_td.font-mono]:text-xs max-sm:[&_td.font-mono]:[overflow-wrap:anywhere] max-sm:[&_td.tabular-nums]:whitespace-nowrap print:my-0 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none"
    >
      {isVoided && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <span className="rotate-[-18deg] rounded-md border-8 border-destructive/50 px-8 py-3 text-6xl font-black uppercase tracking-widest text-destructive/50">
            Voided
          </span>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="flex items-start justify-between border-b border-emerald-800/20 pb-6 max-sm:flex-col max-sm:gap-3 max-sm:pb-4">
        <Image
          src="/logo-icg.png"
          alt={settings.legalName}
          width={280}
          height={215}
          priority
          className="h-24 w-auto object-contain max-sm:h-16"
        />
        <div className="text-right font-black tracking-[0.35em] text-emerald-900 text-4xl max-sm:text-left max-sm:text-2xl max-sm:tracking-[0.25em]">
          INVOICE
        </div>
      </header>

      {/* Single-line address matching the template. */}
      <p className="mt-4 text-center text-[13px] text-slate-700">
        <span className="font-semibold">{settings.legalName}</span>
        {address ? `, ${address}` : ''}
      </p>

      {/* ── Invoice meta table ─────────────────────────────────── */}
      <table className="mt-6 w-full border-collapse text-sm">
        <tbody>
          <tr className="border border-slate-300">
            <th className="w-[38%] bg-slate-100 px-3 py-2 text-left font-semibold uppercase tracking-wider text-xs text-slate-700">
              Invoice Number
            </th>
            <td className="border-l border-slate-300 px-3 py-2 font-mono">{invoice.number}</td>
          </tr>
          <tr className="border border-slate-300">
            <th className="bg-slate-100 px-3 py-2 text-left font-semibold uppercase tracking-wider text-xs text-slate-700">
              Invoice Date
            </th>
            <td className="border-l border-slate-300 px-3 py-2">
              {format(invoice.issuedAt, "dd MMMM yyyy 'at' HH:mm")}
            </td>
          </tr>
          {invoice.dueAt && (
            <tr className="border border-slate-300">
              <th className="bg-slate-100 px-3 py-2 text-left font-semibold uppercase tracking-wider text-xs text-slate-700">
                Payment Due
              </th>
              <td className="border-l border-slate-300 px-3 py-2">
                {format(invoice.dueAt, 'dd MMMM yyyy')}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* ── Bill To ────────────────────────────────────────────── */}
      <h2 className="mt-6 text-sm font-bold uppercase tracking-widest text-emerald-900">
        Bill To:
      </h2>
      <table className="mt-2 w-full border-collapse text-sm">
        <tbody>
          <tr className="border border-slate-300">
            <th className="w-[38%] bg-slate-100 px-3 py-2 text-left font-semibold uppercase tracking-wider text-xs text-slate-700">
              Customer Name
            </th>
            <td className="border-l border-slate-300 px-3 py-2">{payer.displayName}</td>
          </tr>
          {payer.contactRows?.map((row) => (
            <tr key={row.label} className="border border-slate-300">
              <th className="bg-slate-100 px-3 py-2 text-left font-semibold uppercase tracking-wider text-xs text-slate-700">
                {row.label}
              </th>
              <td className="border-l border-slate-300 px-3 py-2">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Invoice details ────────────────────────────────────── */}
      <h2 className="mt-6 text-sm font-bold uppercase tracking-widest text-emerald-900">
        Invoice Details
      </h2>
      <table className="mt-2 w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-100 text-left text-xs uppercase tracking-wider text-slate-700">
            <th className="w-[14%] border border-slate-300 px-3 py-2 text-center font-semibold">
              QTY
            </th>
            <th className="border border-slate-300 px-3 py-2 font-semibold">Description</th>
            <th className="w-[20%] border border-slate-300 px-3 py-2 text-right font-semibold">
              Unit Price
            </th>
            <th className="w-[22%] border border-slate-300 px-3 py-2 text-right font-semibold">
              Total Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {lineItems && lineItems.length > 0 ? (
            lineItems.map((li) => (
              <tr key={li.id}>
                <td className="border border-slate-300 px-3 py-2 text-center tabular-nums">
                  {Number.parseFloat(li.quantity).toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 3,
                  })}
                </td>
                <td className="border border-slate-300 px-3 py-2">{li.description}</td>
                <td className="border border-slate-300 px-3 py-2 text-right tabular-nums">
                  {money(li.unitPrice)}
                </td>
                <td className="border border-slate-300 px-3 py-2 text-right tabular-nums">
                  {money(li.lineSubtotal)}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td className="border border-slate-300 px-3 py-2 text-center tabular-nums">
                {invoice.qty}
              </td>
              <td className="border border-slate-300 px-3 py-2">{desc}</td>
              <td className="border border-slate-300 px-3 py-2 text-right tabular-nums">
                {money(invoice.unitPrice)}
              </td>
              <td className="border border-slate-300 px-3 py-2 text-right tabular-nums">
                {money(invoice.subtotal)}
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <td className="px-3 py-2" colSpan={2} />
            <td className="border border-slate-300 bg-slate-50 px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-700">
              Sub Total
            </td>
            <td className="border border-slate-300 px-3 py-2 text-right tabular-nums">
              {money(invoice.subtotal)}
            </td>
          </tr>
          {showVatLine && (
            <tr>
              <td className="px-3 py-2" colSpan={2} />
              <td className="border border-slate-300 bg-slate-50 px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-700">
                VAT ({formatRate(vatRate)}%)
              </td>
              <td className="border border-slate-300 px-3 py-2 text-right tabular-nums">
                {money(invoice.taxAmount)}
              </td>
            </tr>
          )}
          <tr>
            <td className="px-3 py-2" colSpan={2} />
            <td className="border border-emerald-900 bg-emerald-900 px-3 py-2 text-right text-xs font-bold uppercase tracking-wider text-white">
              Total Due
            </td>
            <td className="border border-emerald-900 bg-emerald-50 px-3 py-3 text-right text-base font-bold tabular-nums text-emerald-900">
              {money(invoice.totalAmount)}
            </td>
          </tr>
        </tfoot>
      </table>

      {/* ── VAT treatment legend ───────────────────────────────
          Non-STANDARD invoices must carry a legal note explaining
          why no VAT is charged. Required by Irish/EU VAT rules so
          the recipient (and their accountant) knows how to treat
          the supply. STANDARD invoices show nothing here — the
          VAT row above already tells the story. */}
      {invoice.vatTreatment && invoice.vatTreatment !== 'STANDARD' && (
        <p className="mt-3 border-l-2 border-slate-300 bg-slate-50 px-3 py-2 text-[11px] italic text-slate-700">
          {invoice.vatTreatment === 'REVERSE_CHARGE' &&
            'Reverse charge — VAT is to be accounted for by the recipient (Article 196, Council Directive 2006/112/EC).'}
          {invoice.vatTreatment === 'EXEMPT' &&
            'Exempt supply — no VAT is chargeable on this invoice.'}
          {invoice.vatTreatment === 'OUTSIDE_SCOPE' &&
            'Outside the scope of VAT — supply made to a recipient outside the EU VAT area.'}
        </p>
      )}

      {isComplimentary && !isVoided && (
        <p className="mt-3 border-l-2 border-emerald-700 bg-emerald-50 px-3 py-2 text-[12px] font-semibold text-emerald-900">
          COMPLIMENTARY — {settings.complimentaryInvoiceNote}
        </p>
      )}

      {/* ── Credit notes (if any) ──────────────────────────────
          Legal reversal path under Irish VAT rules. Shown even
          on the printable so a scanned/printed copy carries the
          full audit trail — recipients see exactly what was
          credited and why. */}
      {creditNotes && creditNotes.length > 0 && (
        <>
          <h2 className="mt-6 text-sm font-bold uppercase tracking-widest text-emerald-900">
            Credit Notes
          </h2>
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border border-slate-300 bg-slate-100 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Number
                </th>
                <th className="border border-slate-300 bg-slate-100 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Issued
                </th>
                <th className="border border-slate-300 bg-slate-100 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Reason
                </th>
                <th className="border border-slate-300 bg-slate-100 px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {creditNotes.map((cn) => (
                <tr key={cn.id}>
                  <td className="border border-slate-300 px-3 py-2 font-mono text-xs">
                    {cn.number}
                  </td>
                  <td className="border border-slate-300 px-3 py-2 text-xs">
                    {format(cn.issuedAt, 'dd MMM yyyy · HH:mm')}
                  </td>
                  <td className="border border-slate-300 px-3 py-2 text-xs">{cn.reason}</td>
                  <td className="border border-slate-300 px-3 py-2 text-right tabular-nums">
                    -{money(cn.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* ── Bank details (only if configured) ──────────────────── */}
      {!isVoided && !isComplimentary && bankBlockVisible && (
        <>
          <h2 className="mt-6 text-sm font-bold uppercase tracking-widest text-emerald-900">
            Bank Details
          </h2>
          <table className="mt-2 w-full border-collapse text-sm">
            <tbody>
              <tr className="border border-slate-300">
                <th className="w-[38%] bg-slate-100 px-3 py-2 text-left font-semibold uppercase tracking-wider text-xs text-slate-700">
                  Bank
                </th>
                <td className="border-l border-slate-300 px-3 py-2">{settings.bankName}</td>
              </tr>
              <tr className="border border-slate-300">
                <th className="bg-slate-100 px-3 py-2 text-left font-semibold uppercase tracking-wider text-xs text-slate-700">
                  Account Name
                </th>
                <td className="border-l border-slate-300 px-3 py-2">{settings.bankAccountName}</td>
              </tr>
              <tr className="border border-slate-300">
                <th className="bg-slate-100 px-3 py-2 text-left font-semibold uppercase tracking-wider text-xs text-slate-700">
                  Account Number (IBAN)
                </th>
                <td className="border-l border-slate-300 px-3 py-2 font-mono">
                  {settings.bankIban}
                </td>
              </tr>
              {settings.bankBic && (
                <tr className="border border-slate-300">
                  <th className="bg-slate-100 px-3 py-2 text-left font-semibold uppercase tracking-wider text-xs text-slate-700">
                    Branch Code (BIC)
                  </th>
                  <td className="border-l border-slate-300 px-3 py-2 font-mono">
                    {settings.bankBic}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}

      {/* ── Footer text ────────────────────────────────────────── */}
      {isVoided ? (
        <p className="mt-8 text-sm font-semibold text-destructive">
          Voided on {invoice.voidedAt ? format(invoice.voidedAt, 'dd MMM yyyy, HH:mm') : '—'}
          {invoice.voidReason ? ` — ${invoice.voidReason}` : ''}
        </p>
      ) : (
        <>
          {!isComplimentary && (
            <p className="mt-8 text-sm text-slate-700">
              Please quote the Invoice Number in your Bank Reference and email proof of payment
              {settings.contactEmail ? (
                <>
                  {' '}
                  to <span className="font-medium">{settings.contactEmail}</span>
                </>
              ) : null}
              .
            </p>
          )}
          <p className="mt-4 text-sm font-semibold text-emerald-900">Thank you for your support.</p>

          {/* Compact registration + VAT line at the very bottom.
              Hidden if both are empty; hides individual pieces. */}
          {(settings.registrationNumber || settings.vatNumber) && (
            <p className="mt-8 border-t border-slate-200 pt-4 text-center text-[11px] text-slate-500">
              {settings.fullLegalName}
              {settings.registrationNumber ? ` · Reg. no. ${settings.registrationNumber}` : ''}
              {settings.vatNumber ? ` · VAT ${settings.vatNumber}` : ''}
            </p>
          )}
        </>
      )}
    </article>
  );
}

function formatRate(rate: number): string {
  if (!Number.isFinite(rate)) return '0';
  return Number.isInteger(rate) ? String(rate) : rate.toFixed(2);
}
