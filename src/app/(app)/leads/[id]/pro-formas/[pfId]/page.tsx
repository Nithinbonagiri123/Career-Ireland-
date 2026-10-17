import { ChevronLeft, Printer } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FadeUp } from '@/components/motion/motion-primitives';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { requirePermission } from '@/lib/auth/session';
import { formatCurrency } from '@/lib/currency';
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

export const dynamic = 'force-dynamic';

function statusTone(status: ProFormaView['status']) {
  if (status === 'ACCEPTED' || status === 'CONVERTED' || status === 'ISSUED') return 'default';
  if (status === 'DRAFT') return 'secondary';
  return 'destructive';
}

export default async function ProFormaDetailPage({
  params,
}: {
  params: Promise<{ id: string; pfId: string }>;
}) {
  await requirePermission('candidate_services', 'proformas', 'view');
  const { id: leadId, pfId } = await params;

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
        <div className="mb-4 flex items-center justify-between">
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

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-mono text-2xl tracking-tight">{pf.number}</h1>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant={statusTone(pf.status)}>{pf.status}</Badge>
              <span className="text-xs text-muted-foreground">rev {pf.revision}</span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">prepared for {payerName}</span>
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
        <section className="mt-6 rounded-md border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <th className="w-16 px-3 py-2 text-left">Qty</th>
                <th className="px-3 py-2 text-left">Service</th>
                <th className="w-32 px-3 py-2 text-right">Unit price</th>
                <th className="w-32 px-3 py-2 text-right">Line total</th>
              </tr>
            </thead>
            <tbody>
              {pf.lineItems.map((li) => (
                <tr key={li.id} className="border-b last:border-b-0">
                  <td className="px-3 py-2 tabular-nums">{Number.parseFloat(li.quantity)}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{li.serviceName}</div>
                    {li.description !== li.serviceName && (
                      <div className="text-xs text-muted-foreground">{li.description}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(li.unitPrice)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(li.lineSubtotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/40 font-semibold">
                <td colSpan={3} className="px-3 py-2 text-right uppercase tracking-wider text-xs">
                  Document total
                </td>
                <td className="px-3 py-2 text-right text-base tabular-nums">
                  {money(pf.subtotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>
      </FadeUp>

      {balance && (
        <FadeUp delay={0.07}>
          <section className="mt-6 rounded-md border bg-card">
            <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Payments
              </h2>
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
              <p className="px-3 py-4 text-sm text-muted-foreground">
                No payments recorded yet. Use "Record payment" above to log one.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/20 text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2 text-left">Received</th>
                    <th className="px-3 py-2 text-left">Method</th>
                    <th className="px-3 py-2 text-left">Reference</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="w-32 px-3 py-2 text-right">Amount</th>
                    <th className="w-24 px-3 py-2 text-right" />
                  </tr>
                </thead>
                <tbody>
                  {balance.payments.map((p) => (
                    <tr key={p.id} className="border-b last:border-b-0">
                      <td className="px-3 py-2 text-xs tabular-nums">
                        {p.receivedAt
                          ? new Date(p.receivedAt).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: '2-digit',
                            })
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs">{p.method.replace('_', ' ')}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {p.proofReference ?? '—'}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={
                            p.status === 'VERIFIED'
                              ? 'default'
                              : p.status === 'REJECTED' || p.status === 'REFUNDED'
                                ? 'destructive'
                                : 'secondary'
                          }
                        >
                          {p.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {money(p.amount)}
                        {p.currencyCode !== pf.currencyCode && (
                          <span className="ml-1 text-xs text-destructive">({p.currencyCode})</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {(p.status === 'PENDING' || p.status === 'PROOF_UPLOADED') && (
                          <VerifyPaymentButton paymentId={p.id} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </FadeUp>
      )}

      {pf.paymentTerms && (
        <FadeUp delay={0.08}>
          <section className="mt-6 rounded-md border bg-card p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Payment terms
            </h2>
            <p className="mt-2 whitespace-pre-wrap text-sm">{pf.paymentTerms}</p>
          </section>
        </FadeUp>
      )}

      {pf.notes && (
        <FadeUp delay={0.1}>
          <section className="mt-4 rounded-md border bg-card p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Internal notes
            </h2>
            <p className="mt-2 whitespace-pre-wrap text-sm">{pf.notes}</p>
          </section>
        </FadeUp>
      )}

      {revisions.length > 0 && (
        <FadeUp delay={0.12}>
          <section className="mt-6 rounded-md border bg-card">
            <div className="border-b bg-muted/40 px-3 py-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Revision history
              </h2>
            </div>
            <ul className="divide-y">
              {revisions.map((r) => (
                <li key={r.id} className="px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs">rev {r.revision}</span>
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
