import { format } from 'date-fns';
import Image from 'next/image';
import { formatCurrency } from '@/lib/currency';
import type { AppSettings } from '@/lib/db/schema/app_settings';
import type { ProFormaView } from '@/modules/proformas/service';

/**
 * Print-friendly pro-forma template. Visually mirrors
 * `invoice-printable.tsx` so operators and clients get consistent
 * document chrome, but with important semantic differences:
 *
 *   - Masthead reads "PRO FORMA" (not INVOICE).
 *   - Document number uses the PROF-YYYY-NNNNNN sequence.
 *   - Status banner shown prominently — DRAFT, ISSUED, ACCEPTED,
 *     REJECTED, CANCELLED, SUPERSEDED, CONVERTED. Draft and non-
 *     final states carry an obvious watermark so no one mistakes a
 *     working document for a signed offer.
 *   - Legal footer: "PRO FORMA — NOT A TAX INVOICE. No VAT charged."
 *   - No due-date (pro formas aren't demands for payment yet).
 *   - No VAT row — the business is non-VAT-registered and pro formas
 *     stay silent on VAT regardless of settings.
 *
 * Every editable string comes from `settings` (app_settings row).
 * Nothing document-facing is hardcoded (per the no-hardcoded-document
 * -content rule).
 */
export function ProFormaPrintable({
  proForma,
  settings,
}: {
  proForma: ProFormaView;
  settings: AppSettings;
}) {
  const address = settings.addressLines.join(', ');
  const currency = proForma.currencyCode;
  const money = (v: string | number) => formatCurrency(v, currency);
  const bankBlockVisible =
    Boolean(settings.bankName) && Boolean(settings.bankAccountName) && Boolean(settings.bankIban);

  const status = proForma.status;
  const watermark = (() => {
    if (status === 'DRAFT') return 'DRAFT';
    if (status === 'REJECTED') return 'REJECTED';
    if (status === 'CANCELLED') return 'CANCELLED';
    if (status === 'SUPERSEDED') return 'SUPERSEDED';
    return null;
  })();

  const payerName = [
    proForma.payerPerson.firstName,
    proForma.payerPerson.middleName,
    proForma.payerPerson.lastName,
  ]
    .filter(Boolean)
    .join(' ');

  const contactRows = [
    proForma.payerPerson.email && { label: 'Email', value: proForma.payerPerson.email },
    proForma.payerPerson.phone && { label: 'Phone', value: proForma.payerPerson.phone },
    proForma.payerPerson.addressLine1 && {
      label: 'Address',
      value: [
        proForma.payerPerson.addressLine1,
        proForma.payerPerson.addressLine2,
        proForma.payerPerson.currentCity,
        proForma.payerPerson.currentCountry,
      ]
        .filter(Boolean)
        .join(', '),
    },
  ].filter((row): row is { label: string; value: string } => Boolean(row));

  return (
    <main className="relative mx-auto my-6 max-w-3xl bg-white p-10 shadow-sm print:my-0 print:max-w-none print:p-0 print:shadow-none">
      {watermark && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <span className="rotate-[-18deg] rounded-md border-8 border-slate-400/40 px-8 py-3 text-6xl font-black uppercase tracking-widest text-slate-400/40">
            {watermark}
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
        <div className="text-right">
          <div className="font-black tracking-[0.35em] text-emerald-900 text-4xl">PRO FORMA</div>
          <div className="mt-1 text-xs uppercase tracking-widest text-slate-500">
            Not a tax invoice
          </div>
        </div>
      </header>

      <p className="mt-4 text-center text-[13px] text-slate-700">
        <span className="font-semibold">{settings.legalName}</span>
        {address ? `, ${address}` : ''}
      </p>

      {/* ── Document meta ─────────────────────────────────────── */}
      <table className="mt-6 w-full border-collapse text-sm">
        <tbody>
          <tr className="border border-slate-300">
            <th className="w-[38%] bg-slate-100 px-3 py-2 text-left font-semibold uppercase tracking-wider text-xs text-slate-700">
              Pro Forma No.
            </th>
            <td className="border-l border-slate-300 px-3 py-2 font-mono">
              {proForma.number}
              <span className="ml-2 text-xs text-slate-500">rev {proForma.revision}</span>
            </td>
          </tr>
          <tr className="border border-slate-300">
            <th className="bg-slate-100 px-3 py-2 text-left font-semibold uppercase tracking-wider text-xs text-slate-700">
              Issued
            </th>
            <td className="border-l border-slate-300 px-3 py-2">
              {proForma.issuedAt
                ? format(proForma.issuedAt, "dd MMMM yyyy 'at' HH:mm")
                : 'Not yet issued (draft)'}
            </td>
          </tr>
          <tr className="border border-slate-300">
            <th className="bg-slate-100 px-3 py-2 text-left font-semibold uppercase tracking-wider text-xs text-slate-700">
              Status
            </th>
            <td className="border-l border-slate-300 px-3 py-2 uppercase tracking-wider text-xs font-semibold">
              {status}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── Prepared For ──────────────────────────────────────── */}
      <h2 className="mt-6 text-sm font-bold uppercase tracking-widest text-emerald-900">
        Prepared For:
      </h2>
      <table className="mt-2 w-full border-collapse text-sm">
        <tbody>
          <tr className="border border-slate-300">
            <th className="w-[38%] bg-slate-100 px-3 py-2 text-left font-semibold uppercase tracking-wider text-xs text-slate-700">
              Name
            </th>
            <td className="border-l border-slate-300 px-3 py-2">{payerName}</td>
          </tr>
          {contactRows.map((row) => (
            <tr key={row.label} className="border border-slate-300">
              <th className="bg-slate-100 px-3 py-2 text-left font-semibold uppercase tracking-wider text-xs text-slate-700">
                {row.label}
              </th>
              <td className="border-l border-slate-300 px-3 py-2">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Services ─────────────────────────────────────────── */}
      <h2 className="mt-6 text-sm font-bold uppercase tracking-widest text-emerald-900">
        Proposed Services
      </h2>
      <table className="mt-2 w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-100 text-left text-xs uppercase tracking-wider text-slate-700">
            <th className="w-[10%] border border-slate-300 px-3 py-2 text-center font-semibold">
              QTY
            </th>
            <th className="border border-slate-300 px-3 py-2 font-semibold">Service</th>
            <th className="w-[22%] border border-slate-300 px-3 py-2 text-right font-semibold">
              Unit Price
            </th>
            <th className="w-[22%] border border-slate-300 px-3 py-2 text-right font-semibold">
              Line Total
            </th>
          </tr>
        </thead>
        <tbody>
          {proForma.lineItems.map((li) => (
            <tr key={li.id}>
              <td className="border border-slate-300 px-3 py-2 text-center tabular-nums">
                {Number.parseFloat(li.quantity).toLocaleString(undefined, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 3,
                })}
              </td>
              <td className="border border-slate-300 px-3 py-2">
                <div className="font-medium">{li.serviceName}</div>
                {li.description !== li.serviceName && (
                  <div className="text-xs text-slate-600">{li.description}</div>
                )}
              </td>
              <td className="border border-slate-300 px-3 py-2 text-right tabular-nums">
                {money(li.unitPrice)}
              </td>
              <td className="border border-slate-300 px-3 py-2 text-right tabular-nums">
                {money(li.lineSubtotal)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="px-3 py-2" colSpan={2} />
            <td className="border border-emerald-900 bg-emerald-900 px-3 py-2 text-right text-xs font-bold uppercase tracking-wider text-white">
              Document Total
            </td>
            <td className="border border-emerald-900 bg-emerald-50 px-3 py-3 text-right text-base font-bold tabular-nums text-emerald-900">
              {money(proForma.subtotal)}
            </td>
          </tr>
        </tfoot>
      </table>

      {/* ── Payment terms (optional) ──────────────────────────── */}
      {proForma.paymentTerms && (
        <>
          <h2 className="mt-6 text-sm font-bold uppercase tracking-widest text-emerald-900">
            Payment Terms
          </h2>
          <p className="mt-2 border border-slate-300 bg-slate-50 px-3 py-2 text-sm whitespace-pre-wrap">
            {proForma.paymentTerms}
          </p>
        </>
      )}

      {/* ── Bank details ──────────────────────────────────────── */}
      {bankBlockVisible && (
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
                  IBAN
                </th>
                <td className="border-l border-slate-300 px-3 py-2 font-mono">
                  {settings.bankIban}
                </td>
              </tr>
              {settings.bankBic && (
                <tr className="border border-slate-300">
                  <th className="bg-slate-100 px-3 py-2 text-left font-semibold uppercase tracking-wider text-xs text-slate-700">
                    BIC
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

      {/* ── Legal footer ──────────────────────────────────────── */}
      <div className="mt-10 border-t border-slate-300 pt-4 text-[11px] italic text-slate-700">
        <p className="font-semibold uppercase tracking-wider">Pro Forma — Not a Tax Invoice</p>
        <p className="mt-1">
          This document is a proposal for discussion and acceptance. It is not a demand for payment
          and does not create a tax obligation. On acceptance and verified payment, an official tax
          invoice will be issued separately.
        </p>
        <p className="mt-1">
          {settings.legalName} is not currently VAT-registered. No VAT is charged on this pro forma.
        </p>
        {settings.invoiceFooter && (
          <p className="mt-2 whitespace-pre-wrap">{settings.invoiceFooter}</p>
        )}
      </div>
    </main>
  );
}
