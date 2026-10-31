import { format } from 'date-fns';
import { FileText, History, NotebookPen, Printer, Receipt, ScrollText } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AmountSummary } from '@/components/ds/amount-summary';
import {
  DsActionsTh,
  DsCardItem,
  DsCardList,
  DsTable,
  DsTBody,
  DsTd,
  DsTFoot,
  DsTHead,
  DsTh,
  DsTr,
  ResponsiveTable,
} from '@/components/ds/data-table';
import { DocumentHeader } from '@/components/ds/document-header';
import { Money } from '@/components/ds/money';
import { DsStatusPill, enumLabel } from '@/components/ds/status-pill';
import type { DsTone } from '@/components/ds/tones';
import { DS_ROW_LIST, SectionCard } from '@/components/ds/workspace';
import { FadeUp } from '@/components/motion/motion-primitives';
import { buttonVariants } from '@/components/ui/button';
import { requirePermission, requireSession } from '@/lib/auth/session';
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

/** Unchanged colour rules — only the label text is made readable. */
function statusTone(status: ProFormaView['status']): DsTone {
  if (status === 'ACCEPTED' || status === 'CONVERTED') return 'green';
  if (status === 'ISSUED') return 'blue';
  if (status === 'DRAFT') return 'slate';
  return 'rose';
}

/**
 * Payment pill colours stay exactly as before (the payment status-pill
 * review is deferred — docs/finance-followups-proposal.md §3).
 */
function paymentTone(status: string): DsTone {
  if (status === 'VERIFIED') return 'green';
  if (status === 'REJECTED' || status === 'REFUNDED') return 'rose';
  return 'amber';
}

function stamp(d: Date | null | undefined): string {
  return d ? format(new Date(d), 'dd MMM yyyy · HH:mm') : '—';
}

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

  const cur = pf.currencyCode;

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

  const composerInitial = {
    currencyCode: pf.currencyCode,
    paymentTerms: pf.paymentTerms,
    notes: pf.notes,
    lines: pf.lineItems.map((li) => ({
      serviceCatalogItemId: li.serviceCatalogItemId,
      description: li.description,
      quantity: li.quantity,
      unitPrice: li.unitPrice,
    })),
  };

  const actions = (
    <>
      <Link
        href={`/leads/${leadId}/pro-formas/${pf.id}/print`}
        target="_blank"
        className={buttonVariants({ variant: 'outline', size: 'sm' })}
      >
        <Printer className="mr-1 h-4 w-4" aria-hidden /> View / print PDF
      </Link>
      {canEditDraft && (
        <ProFormaComposer
          mode="edit"
          leadId={leadId}
          services={services}
          currencies={currencies}
          proFormaInvoiceId={pf.id}
          initial={composerInitial}
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
          initial={composerInitial}
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
    </>
  );

  // Payment actions are identical in the table and the phone cards; only
  // one of the two layouts is rendered visible at a time.
  const paymentActions = (p: NonNullable<typeof balance>['payments'][number]) => (
    <>
      {(p.status === 'PENDING' || p.status === 'PROOF_UPLOADED') && (
        <VerifyPaymentButton paymentId={p.id} />
      )}
      {/* Pre-issuance refund: Finance only, and only while the pro forma
          is still ACCEPTED (an invoice-side refund path handles CONVERTED
          via credit note). Shown on verified or partially-refunded
          payments; the service re-checks the role + state. */}
      {canRefund &&
        pf.status === 'ACCEPTED' &&
        (p.status === 'VERIFIED' || p.status === 'PARTIALLY_REFUNDED') && (
          <RefundPaymentButton
            paymentId={p.id}
            paymentAmount={p.amount}
            currencyCode={p.currencyCode}
          />
        )}
    </>
  );

  const paymentAmount = (p: NonNullable<typeof balance>['payments'][number]) => (
    <>
      <Money amount={p.amount} currency={p.currencyCode} />
      {p.currencyCode !== pf.currencyCode && (
        <span className="ml-1 text-xs text-destructive">({p.currencyCode})</span>
      )}
    </>
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <DocumentHeader
          breadcrumbs={[
            { label: 'Leads', href: '/leads' },
            { label: 'Lead', href: `/leads/${leadId}` },
            { label: pf.number },
          ]}
          back={{ href: `/leads/${leadId}`, label: 'Back to lead' }}
          icon={FileText}
          kind="Pro forma"
          number={pf.number}
          status={<DsStatusPill tone={statusTone(pf.status)}>{enumLabel(pf.status)}</DsStatusPill>}
          issuedAt={pf.issuedAt ?? pf.createdAt}
          issuedLabel={pf.issuedAt ? 'Issued' : 'Created'}
          meta={[
            <span key="rev" className="flex flex-wrap gap-x-2">
              <span>Revision {pf.revision}</span>
              <span aria-hidden>·</span>
              <span>Prepared for {payerName}</span>
            </span>,
          ]}
          actions={actions}
        />
      </FadeUp>

      <FadeUp delay={0.05}>
        <SectionCard icon={ScrollText} title="Services">
          <ResponsiveTable
            table={
              <DsTable label="Services on this pro forma" card={false} minWidth={480}>
                <DsTHead>
                  <tr>
                    <DsTh className="w-16">Qty</DsTh>
                    <DsTh>Service</DsTh>
                    <DsTh numeric className="w-32">
                      Unit price
                    </DsTh>
                    <DsTh numeric className="w-32">
                      Line total
                    </DsTh>
                  </tr>
                </DsTHead>
                <DsTBody>
                  {pf.lineItems.map((li) => (
                    <DsTr key={li.id}>
                      <DsTd className="tabular-nums">{Number.parseFloat(li.quantity)}</DsTd>
                      <DsTd>
                        <div className="font-medium">{li.serviceName}</div>
                        {li.description !== li.serviceName && (
                          <div className="text-xs text-muted-foreground">{li.description}</div>
                        )}
                      </DsTd>
                      <DsTd numeric>
                        <Money amount={li.unitPrice} currency={cur} />
                      </DsTd>
                      <DsTd numeric>
                        <Money amount={li.lineSubtotal} currency={cur} />
                      </DsTd>
                    </DsTr>
                  ))}
                </DsTBody>
                <DsTFoot>
                  <tr>
                    <DsTd colSpan={3} className="text-right">
                      Document total
                    </DsTd>
                    <DsTd numeric className="text-base">
                      <Money amount={pf.subtotal} currency={cur} />
                    </DsTd>
                  </tr>
                </DsTFoot>
              </DsTable>
            }
            cards={
              <div className="space-y-3">
                <DsCardList label="Services on this pro forma">
                  {pf.lineItems.map((li) => (
                    <DsCardItem key={li.id} className="shadow-none">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium [overflow-wrap:anywhere]">
                            {li.serviceName}
                          </div>
                          {li.description !== li.serviceName && (
                            <div className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                              {li.description}
                            </div>
                          )}
                        </div>
                        <Money amount={li.lineSubtotal} currency={cur} className="font-semibold" />
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {Number.parseFloat(li.quantity)} ×{' '}
                        <Money amount={li.unitPrice} currency={cur} />
                      </div>
                    </DsCardItem>
                  ))}
                </DsCardList>
                <div className="flex items-baseline justify-between gap-3 rounded-xl bg-muted/40 px-4 py-3 font-semibold">
                  <span>Document total</span>
                  <Money amount={pf.subtotal} currency={cur} className="text-base" />
                </div>
              </div>
            }
          />
        </SectionCard>
      </FadeUp>

      {balance && (
        <FadeUp delay={0.07}>
          <SectionCard icon={Receipt} title="Payments">
            <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_260px]">
              <div className="min-w-0 md:order-2">
                <AmountSummary
                  label="Payment summary"
                  currency={cur}
                  lines={[
                    { key: 'total', label: 'Total', amount: balance.total },
                    {
                      key: 'paid',
                      label: 'Verified paid',
                      amount: balance.verifiedPaid,
                      emphasis: 'muted',
                    },
                    {
                      key: 'outstanding',
                      label: 'Outstanding',
                      amount: balance.outstanding,
                      emphasis: 'outstanding',
                    },
                  ]}
                />
              </div>
              <div className="min-w-0 md:order-1">
                {balance.payments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No payments recorded yet. Use "Record payment" above to log one.
                  </p>
                ) : (
                  <ResponsiveTable
                    table={
                      <DsTable label="Payments on this pro forma" card={false} minWidth={560}>
                        <DsTHead>
                          <tr>
                            <DsTh>Received</DsTh>
                            <DsTh>Method</DsTh>
                            <DsTh>Reference</DsTh>
                            <DsTh>Status</DsTh>
                            <DsTh numeric>Amount</DsTh>
                            <DsActionsTh />
                          </tr>
                        </DsTHead>
                        <DsTBody>
                          {balance.payments.map((p) => (
                            <DsTr key={p.id}>
                              <DsTd className="whitespace-nowrap text-xs tabular-nums">
                                {stamp(p.receivedAt)}
                              </DsTd>
                              <DsTd className="text-xs">{enumLabel(p.method)}</DsTd>
                              <DsTd className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                                {p.proofReference ?? '—'}
                              </DsTd>
                              <DsTd>
                                <DsStatusPill tone={paymentTone(p.status)}>
                                  {enumLabel(p.status)}
                                </DsStatusPill>
                              </DsTd>
                              <DsTd numeric>{paymentAmount(p)}</DsTd>
                              <DsTd className="text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  {paymentActions(p)}
                                </div>
                              </DsTd>
                            </DsTr>
                          ))}
                        </DsTBody>
                      </DsTable>
                    }
                    cards={
                      <DsCardList label="Payments on this pro forma">
                        {balance.payments.map((p) => (
                          <DsCardItem key={p.id} className="shadow-none">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-semibold">{paymentAmount(p)}</div>
                                <div className="mt-0.5 text-xs text-muted-foreground">
                                  {stamp(p.receivedAt)} · {enumLabel(p.method)}
                                </div>
                                {p.proofReference && (
                                  <div className="mt-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                                    Ref {p.proofReference}
                                  </div>
                                )}
                              </div>
                              <DsStatusPill tone={paymentTone(p.status)}>
                                {enumLabel(p.status)}
                              </DsStatusPill>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-1.5 empty:hidden">
                              {paymentActions(p)}
                            </div>
                          </DsCardItem>
                        ))}
                      </DsCardList>
                    }
                  />
                )}
              </div>
            </div>
          </SectionCard>
        </FadeUp>
      )}

      {pf.paymentTerms && (
        <FadeUp delay={0.08}>
          <SectionCard icon={ScrollText} title="Payment terms">
            <p className="whitespace-pre-wrap text-sm">{pf.paymentTerms}</p>
          </SectionCard>
        </FadeUp>
      )}

      {pf.notes && (
        <FadeUp delay={0.1}>
          <SectionCard icon={NotebookPen} title="Internal notes">
            <p className="whitespace-pre-wrap text-sm">{pf.notes}</p>
          </SectionCard>
        </FadeUp>
      )}

      {revisions.length > 0 && (
        <FadeUp delay={0.12}>
          <SectionCard icon={History} title="Revision history">
            <ul className={cn(DS_ROW_LIST)}>
              {revisions.map((r) => (
                <li key={r.id} className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium">Revision {r.revision}</span>
                    <time
                      dateTime={new Date(r.createdAt).toISOString()}
                      className="text-xs tabular-nums text-muted-foreground"
                    >
                      {stamp(r.createdAt)}
                    </time>
                  </div>
                  {r.reason && <p className="mt-0.5 text-xs text-muted-foreground">{r.reason}</p>}
                </li>
              ))}
            </ul>
          </SectionCard>
        </FadeUp>
      )}
    </div>
  );
}
