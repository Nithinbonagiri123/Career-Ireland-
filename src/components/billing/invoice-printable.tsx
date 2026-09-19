import { format } from 'date-fns';
import Image from 'next/image';
import { formatCurrency } from '@/lib/currency';
import type { AppSettings } from '@/lib/db/schema/app_settings';
import type { Invoice } from '@/lib/db/schema/billing';

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
}: {
  invoice: Invoice;
  payer: InvoicePayerView;
  settings: AppSettings;
  /** Description shown on the QTY row. Falls back to invoice.lineDescription. */
  lineDescription?: string;
}) {
  const address = settings.addressLines.join(', ');
  const isVoided = invoice.status === 'VOIDED';
  const desc = lineDescription ?? invoice.lineDescription;
  const currency = invoice.currencyCode;
  const money = (v: string) => formatCurrency(v, currency);
  const vatRate = Number.parseFloat(settings.vatRatePercent);
  const showVatLine = true; // Template always shows VAT row; €0.00 when 0%.

  const bankBlockVisible =
    Boolean(settings.bankName) && Boolean(settings.bankAccountName) && Boolean(settings.bankIban);

  return (
    <main className="relative mx-auto my-6 max-w-3xl bg-white p-10 shadow-sm print:my-0 print:max-w-none print:p-0 print:shadow-none">
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
      <header className="flex items-start justify-between border-b border-emerald-800/20 pb-6">
        <Image
          src="/logo-icg.png"
          alt={settings.legalName}
          width={280}
          height={215}
          priority
          className="h-24 w-auto object-contain"
        />
        <div className="text-right font-black tracking-[0.35em] text-emerald-900 text-4xl">
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

      {/* ── Bank details (only if configured) ──────────────────── */}
      {!isVoided && bankBlockVisible && (
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
    </main>
  );
}


function formatRate(rate: number): string {
  if (!Number.isFinite(rate)) return '0';
  return Number.isInteger(rate) ? String(rate) : rate.toFixed(2);
}
