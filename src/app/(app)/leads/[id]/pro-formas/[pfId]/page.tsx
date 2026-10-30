import { ChevronLeft, FileText, Printer } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DsStatusPill, enumLabel } from '@/components/ds/status-pill';
import { DS_SOFT, type DsTone } from '@/components/ds/tones';
import { DS_ROW_LIST } from '@/components/ds/workspace';
import { FadeUp } from '@/components/motion/motion-primitives';
import { buttonVariants } from '@/components/ui/button';
import { requirePermission, requireSession } from '@/lib/auth/session';
import { formatCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';
import { fetchInvoiceableServicesFor } from '@/modules/billing/read';
import { fetchCurrencies } from '@/modules/currencies/service';
import { fetchProFormaBalance } from '@/modules/proformas/payments';
import { fetchProForma, fetchRevisions, type ProFormaView } from '@/modules/proformas/service';
import {
  CancelProFormaButton,
  IssueProFormaButton,
  RecordAcceptanceButton,
  RejectProFormaButton,
} from '../pro-forma-actions';
import { ProFormaComposer } from '../pro-forma-composer';
import { RecordPaymentDialog, VerifyPaymentButton } from '../record-payment-dialog';
import { RefundPaymentButton } from '../refund-payment-dialog';

export const dynamic = 'force-dynamic';

function statusTone(status: ProFormaView['status']): DsTone {
  if (status === 'ACCEPTED' || status === 'CONVERTED') return 'green';
  if (status === 'ISSUED') return 'blue';
  if (status === 'DRAFT') return 'slate';
  return 'rose';
}

const TH = 'px-4 py-2.5 text-xs font-medium text-muted-foreground';
const CARD = 'rounded-2xl border border-border/60 bg-card shadow-sm';

export default async function ProFormaDetailPage({
  params,
}: {
  params: Promise<{ id: string; pfId: string }>;
}) {
  await requirePermission('candidate_services', 'proformas', 'view');
  const session = await requireSession();
  const { id: leadId, pfId } = await params;
  // Pre-issuance refund is Finance-only (ADMIN/FINANCE/owner). Render
  // the button exclusively for those roles; the server action also
  // enforces this but the UI gate keeps the surface honest.
  const canRefund =
    session.user.isOwner || session.user.role === 'ADMIN' || session.user.role === 'FINANCE';

  const [pf, services, currencies, revisions] = await Promise.all([
    fetchProForma(pfId).catch(() => null),
    fetchInvoiceableServicesFor('PERSON'),
    fetchCurrencies(),
    fetchRevisions(pfId).catch(() => []),
  ]);
  if (!pf || pf.sourceLeadId !== leadId) notFound();

  const balance =
    pf.status === 'ACCEPTED' || pf.status === 'CONVERTED'
      ? await fetchProFormaBalance(pf.id).catch(() => null)
      : null;

  const money = (v: string) => formatCurrency(v, pf.currencyCode);

  const canEditDraft = pf.status === 'DRAFT';
  const canIssue = pf.status === 'DRAFT';
  const canRevise = pf.status === 'ISSUED';
  const canAccept = pf.status === 'ISSUED';
  const canReject = pf.status === 'DRAFT' || pf.status === 'ISSUED';
  const canCancel = pf.status === 'DRAFT' || pf.status === 'ISSUED';
  // "Add alternative" is offered on live (not terminal) pro formas so an
  // admin can propose a second tier within the same proposal group. Only
  // visible when the pro forma is currently part of a group.
  const canAddAlternative =
    Boolean(pf.proposalGroupId) &&
    (pf.status === 'DRAFT' || pf.status === 'ISSUED' || pf.status === 'ACCEPTED');
  const canRecordPayment =
    (pf.status === 'ACCEPTED' || pf.status === 'CONVERTED') && balance !== null;

  const payerName = [pf.payerPerson.firstName, pf.payerPerson.middleName, pf.payerPerson.lastName]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <Link
            href={`/leads/${leadId}`}
            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          >
            <ChevronLeft className="mr-1 h-4 w-4" /> Lead
          </Link>
          <Link
            href={`/leads/${leadId}/pro-formas/${pf.id}/print`}
            target="_blank"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <Printer className="mr-1 h-4 w-4" /> View / print PDF
          </Link>
        </div>

        <div className={cn(CARD, 'flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5')}>
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden
              className={cn('grid size-12 shrink-0 place-items-center rounded-xl', DS_SOFT.blue)}
            >
              <FileText className="size-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight [overflow-wrap:anywhere]">
                {pf.number}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <DsStatusPill tone={statusTone(pf.status)}>{pf.status}</DsStatusPill>
                <span className="text-xs text-muted-foreground">Revision {pf.revision}</span>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">Prepared for {payerName}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canEditDraft && (
              <ProFormaComposer
                mode="edit"
                leadId={leadId}
                services={services}
                currencies={currencies}
                proFormaInvoiceId={pf.id}
                initial={{
                  currencyCode: pf.currencyCode,
                  paymentTerms: pf.paymentTerms,
                  notes: pf.notes,
                  lines: pf.lineItems.map((li) => ({
                    serviceCatalogItemId: li.serviceCatalogItemId,
                    description: li.description,
                    quantity: li.quantity,
                    unitPrice: li.unitPrice,
                  })),
                }}
                triggerLabel="Edit draft"
                triggerVariant="outline"
              />
            )}
            {canIssue && <IssueProFormaButton proFormaInvoiceId={pf.id} />}
            {canRevise && (
              <ProFormaComposer
                mode="revise"
                leadId={leadId}
                services={services}
                currencies={currencies}
                proFormaInvoiceId={pf.id}
                initial={{
                  currencyCode: pf.currencyCode,
                  paymentTerms: pf.paymentTerms,
                  notes: pf.notes,
                  lines: pf.lineItems.map((li) => ({
                    serviceCatalogItemId: li.serviceCatalogItemId,
                    description: li.description,
                    quantity: li.quantity,
                    unitPrice: li.unitPrice,
                  })),
                }}
                triggerLabel="Revise"
                triggerVariant="outline"
              />
            )}
            {canAccept && <RecordAcceptanceButton proFormaInvoiceId={pf.id} />}
            {canReject && <RejectProFormaButton proFormaInvoiceId={pf.id} />}
            {canCancel && <CancelProFormaButton proFormaInvoiceId={pf.id} />}
            {canAddAlternative && pf.proposalGroupId && (
              <ProFormaComposer
                mode="create"
                leadId={leadId}
                services={services}
                currencies={currencies}
                existingProposalGroupId={pf.proposalGroupId}
                triggerLabel="Add alternative"
                triggerVariant="outline"
              />
            )}
            {canRecordPayment && balance && (
              <RecordPaymentDialog
                proFormaInvoiceId={pf.id}
                currencyCode={pf.currencyCode}
                defaultAmount={balance.outstanding}
              />
            )}
          </div>
        </div>
      </FadeUp>

      <FadeUp delay={0.05}>
        <section className={cn(CARD, 'mt-5 overflow-hidden')}>
          <h2 className="px-4 pt-4 text-[15px] font-semibold sm:px-5">Services</h2>
          <div className="overflow-x-auto">
            <table className="mt-2 w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left">
                  <th className={cn(TH, 'w-16')}>Qty</th>
                  <th className={TH}>Service</th>
                  <th className={cn(TH, 'w-32 text-right')}>Unit price</th>
                  <th className={cn(TH, 'w-32 text-right')}>Line total</th>
                </tr>
              </thead>
              <tbody>
                {pf.lineItems.map((li) => (
                  <tr key={li.id} className="border-b border-border/60 last:border-b-0">
                    <td className="px-4 py-3 tabular-nums">{Number.parseFloat(li.quantity)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{li.serviceName}</div>
                      {li.description !== li.serviceName && (
                        <div className="text-xs text-muted-foreground">{li.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(li.unitPrice)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(li.lineSubtotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border/60 bg-sky-50/60 font-semibold dark:bg-sky-500/10">
                  <td colSpan={3} className="px-4 py-3 text-right text-sm">
                    Document total
                  </td>
                  <td className="px-4 py-3 text-right text-base tabular-nums">
                    {money(pf.subtotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      </FadeUp>

      {balance && (
        <FadeUp delay={0.07}>
          <section className={cn(CARD, 'mt-5 overflow-hidden')}>
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
              <h2 className="text-[15px] font-semibold">Payments</h2>
              <div className="text-xs text-muted-foreground">
                <span className="tabular-nums">{money(balance.verifiedPaid)}</span>
                {' of '}
                <span className="tabular-nums">{money(balance.total)}</span>
                {' verified · '}
                <span className="font-semibold tabular-nums">{money(balance.outstanding)}</span>
                {' outstanding'}
              </div>
            </div>
            {balance.payments.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted-foreground sm:px-5">
                No payments recorded yet. Use "Record payment" above to log one.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="mt-2 w-full min-w-[620px] text-sm">
                  <thead>
                    <tr className="border-b border-border/60 text-left">
                      <th className={TH}>Received</th>
                      <th className={TH}>Method</th>
                      <th className={TH}>Reference</th>
                      <th className={TH}>Status</th>
                      <th className={cn(TH, 'w-32 text-right')}>Amount</th>
                      <th className={cn(TH, 'w-24 text-right')} />
                    </tr>
                  </thead>
                  <tbody>
                    {balance.payments.map((p) => (
                      <tr key={p.id} className="border-b border-border/60 last:border-b-0">
                        <td className="px-4 py-3 text-xs tabular-nums">
                          {p.receivedAt
                            ? new Date(p.receivedAt).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: '2-digit',
                              })
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs">{enumLabel(p.method)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {p.proofReference ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <DsStatusPill
                            tone={
                              p.status === 'VERIFIED'
                                ? 'green'
                                : p.status === 'REJECTED' || p.status === 'REFUNDED'
                                  ? 'rose'
                                  : 'amber'
                            }
                          >
                            {p.status}
                          </DsStatusPill>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {money(p.amount)}
                          {p.currencyCode !== pf.currencyCode && (
                            <span className="ml-1 text-xs text-destructive">
                              ({p.currencyCode})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {(p.status === 'PENDING' || p.status === 'PROOF_UPLOADED') && (
                              <VerifyPaymentButton paymentId={p.id} />
                            )}
                            {/* Pre-issuance refund: Finance only, and only
                              while the pro forma is still ACCEPTED (an
                              invoice-side refund path handles CONVERTED
                              via credit note). Shown on verified or
                              partially-refunded payments; the service
                              re-checks the role + state. */}
                            {canRefund &&
                              pf.status === 'ACCEPTED' &&
                              (p.status === 'VERIFIED' || p.status === 'PARTIALLY_REFUNDED') && (
                                <RefundPaymentButton
                                  paymentId={p.id}
                                  paymentAmount={p.amount}
                                  currencyCode={p.currencyCode}
                                />
                              )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </FadeUp>
      )}

      {pf.paymentTerms && (
        <FadeUp delay={0.08}>
          <section className={cn(CARD, 'mt-5 p-4 sm:p-5')}>
            <h2 className="text-[15px] font-semibold">Payment terms</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm">{pf.paymentTerms}</p>
          </section>
        </FadeUp>
      )}

      {pf.notes && (
        <FadeUp delay={0.1}>
          <section className={cn(CARD, 'mt-4 p-4 sm:p-5')}>
            <h2 className="text-[15px] font-semibold">Internal notes</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm">{pf.notes}</p>
          </section>
        </FadeUp>
      )}

      {revisions.length > 0 && (
        <FadeUp delay={0.12}>
          <section className={cn(CARD, 'mt-5 p-4 sm:p-5')}>
            <h2 className="text-[15px] font-semibold">Revision history</h2>
            <ul className={cn(DS_ROW_LIST, 'mt-3')}>
              {revisions.map((r) => (
                <li key={r.id} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium">Revision {r.revision}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </span>
                  </div>
                  {r.reason && <p className="mt-0.5 text-xs text-muted-foreground">{r.reason}</p>}
                </li>
              ))}
            </ul>
          </section>
        </FadeUp>
      )}
    </div>
  );
}
