import { format } from 'date-fns';
import Image from 'next/image';
import { formatCurrency } from '@/lib/currency';
import type { AppSettings } from '@/lib/db/schema/app_settings';
import type { Invoice, Receipt } from '@/lib/db/schema/billing';
import type { Payment } from '@/lib/db/schema/commerce';

/**
 * Print-friendly receipt matching the invoice visual family:
 *
 *   [logo]                                       RECEIPT
 *   Ireland Career Gateway, Rosslare Harbour, WEXFORD, Y35 YH22
 *
 *   ┌─────────────────────────┐
 *   │ Receipt Number │ …      │
 *   │ Receipt Date   │ …      │
 *   └─────────────────────────┘
 *
 *   RECEIVED FROM:
 *   ┌─────────────────────────┐
 *   │ Customer Name  │ …      │
 *   │ Customer Email │ …      │
 *   └─────────────────────────┘
 *
 *   PAYMENT DETAILS
 *   ┌─────────────────────────────────────┐
 *   │ Amount Received │            €X     │
 *   │ Method          │ BANK TRANSFER     │
 *   │ Received on     │ 12 Sep 2026       │
 *   │ Reference       │ SEED-0-…          │
 *   │ Applied to      │ INV-2026-000001   │
 *   └─────────────────────────────────────┘
 *
 *   This receipt confirms the payment above has been received in full.
 *   Thank you for your support.
 */
export type ReceiptPayerView = {
  displayName: string;
  contactRows?: Array<{ label: string; value: string }>;
};

export function ReceiptPrintable({
  receipt,
  payment,
  invoice,
  payer,
  settings,
}: {
  receipt: Receipt;
  payment: Payment;
  invoice: Invoice | null;
  payer: ReceiptPayerView;
  settings: AppSettings;
}) {
  const address = settings.addressLines.join(', ');
  const money = (v: string) => formatCurrency(v, receipt.currencyCode);

  return (
    <main className="mx-auto my-6 max-w-3xl bg-white p-10 shadow-sm print:my-0 print:max-w-none print:p-0 print:shadow-none">
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
          RECEIPT
        </div>
      </header>

      <p className="mt-4 text-center text-[13px] text-slate-700">
        <span className="font-semibold">{settings.legalName}</span>
        {address ? `, ${address}` : ''}
      </p>

      {/* ── Receipt meta ───────────────────────────────────────── */}
      <table className="mt-6 w-full border-collapse text-sm">
        <tbody>
          <tr className="border border-slate-300">
            <th className="w-[38%] bg-slate-100 px-3 py-2 text-left font-semibold uppercase tracking-wider text-xs text-slate-700">
              Receipt Number
            </th>
            <td className="border-l border-slate-300 px-3 py-2 font-mono">{receipt.number}</td>
          </tr>
          <tr className="border border-slate-300">
            <th className="bg-slate-100 px-3 py-2 text-left font-semibold uppercase tracking-wider text-xs text-slate-700">
              Receipt Date
            </th>
            <td className="border-l border-slate-300 px-3 py-2">
              {format(receipt.issuedAt, "dd MMMM yyyy 'at' HH:mm")}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── Received From ──────────────────────────────────────── */}
      <h2 className="mt-6 text-sm font-bold uppercase tracking-widest text-emerald-900">
        Received From:
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

      {/* ── Payment details ────────────────────────────────────── */}
      <h2 className="mt-6 text-sm font-bold uppercase tracking-widest text-emerald-900">
        Payment Details
      </h2>
      <table className="mt-2 w-full border-collapse text-sm">
        <tbody>
          <tr className="border border-emerald-900">
            <th className="w-[38%] bg-emerald-900 px-3 py-2 text-left font-semibold uppercase tracking-wider text-xs text-white">
              Amount Received
            </th>
            <td className="border-l border-emerald-900 bg-emerald-50 px-3 py-3 text-right text-base font-bold tabular-nums text-emerald-900">
              {money(receipt.amount)}
            </td>
          </tr>
          <tr className="border border-slate-300">
            <th className="bg-slate-100 px-3 py-2 text-left font-semibold uppercase tracking-wider text-xs text-slate-700">
              Method
            </th>
            <td className="border-l border-slate-300 px-3 py-2">
              {payment.method.replace(/_/g, ' ')}
            </td>
          </tr>
          <tr className="border border-slate-300">
            <th className="bg-slate-100 px-3 py-2 text-left font-semibold uppercase tracking-wider text-xs text-slate-700">
              Received on
            </th>
            <td className="border-l border-slate-300 px-3 py-2">
              {format(receipt.receivedAt, "dd MMMM yyyy 'at' HH:mm")}
            </td>
          </tr>
          {payment.proofReference && (
            <tr className="border border-slate-300">
              <th className="bg-slate-100 px-3 py-2 text-left font-semibold uppercase tracking-wider text-xs text-slate-700">
                Reference
              </th>
              <td className="border-l border-slate-300 px-3 py-2 font-mono text-xs">
                {payment.proofReference}
              </td>
            </tr>
          )}
          {invoice && (
            <tr className="border border-slate-300">
              <th className="bg-slate-100 px-3 py-2 text-left font-semibold uppercase tracking-wider text-xs text-slate-700">
                Applied to invoice
              </th>
              <td className="border-l border-slate-300 px-3 py-2 font-mono">{invoice.number}</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <p className="mt-8 text-sm text-slate-700">{settings.receiptFooter}</p>
      <p className="mt-4 text-sm font-semibold text-emerald-900">Thank you for your support.</p>

      {(settings.registrationNumber || settings.vatNumber) && (
        <p className="mt-8 border-t border-slate-200 pt-4 text-center text-[11px] text-slate-500">
          {settings.fullLegalName}
          {settings.registrationNumber ? ` · Reg. no. ${settings.registrationNumber}` : ''}
          {settings.vatNumber ? ` · VAT ${settings.vatNumber}` : ''}
        </p>
      )}
    </main>
  );
}

