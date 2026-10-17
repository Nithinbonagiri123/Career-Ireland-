import { format, formatDistanceToNow } from 'date-fns';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  Briefcase,
  Coins,
  FileText,
  Mail,
  MapPin,
  Phone,
  Receipt,
  Scroll,
  UserCheck,
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusDot } from '@/components/ui/status-dot';
import { formatCurrency } from '@/lib/currency';
import { statusTone } from '@/lib/ui/status-tone';
import { cn } from '@/lib/utils';
import { fetchClientWorkspace } from '@/modules/clients/workspace-data';
import { ClientWorkspaceTabs } from './client-workspace-tabs';
import { ClientNextActionIsland } from './next-action-island';

export const dynamic = 'force-dynamic';

const LEAD_LABEL: Record<string, string> = {
  NEW: 'New enquiry',
  CONTACTED: 'Contacted',
  AWAITING_PAYMENT: 'Quote accepted — awaiting payment',
  CONVERTED: 'Active client',
  LOST: 'Lost',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
  ARCHIVED: 'Archived',
};

const PF_LABEL: Record<string, string> = {
  DRAFT: 'Draft quote',
  ISSUED: 'Quote issued',
  ACCEPTED: 'Client accepted',
  CONVERTED: 'Paid — invoice issued',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  SUPERSEDED: 'Replaced',
};

const INVOICE_LABEL: Record<string, string> = {
  ISSUED: 'Awaiting payment',
  PARTIALLY_PAID: 'Partially paid',
  PAID: 'Paid',
  VOIDED: 'Voided',
};

const PAYMENT_LABEL: Record<string, string> = {
  PENDING: 'Not yet confirmed',
  PROOF_UPLOADED: 'Proof received — awaiting confirmation',
  VERIFIED: 'Payment received',
  REJECTED: 'Rejected',
  PARTIALLY_REFUNDED: 'Partially refunded',
  REFUNDED: 'Fully refunded',
};

export default async function ClientWorkspacePage({
  params,
}: {
  params: Promise<{ personId: string }>;
}) {
  const { personId } = await params;
  const data = await fetchClientWorkspace(personId);
  if (!data) notFound();

  const {
    person,
    occupationName,
    candidateProfile,
    assignedUserName,
    leads,
    proFormas,
    invoices,
    payments,
    balance,
    nextAction,
  } = data;

  const fullName = `${person.firstName} ${person.lastName}`.trim();
  const location = [person.currentCity, person.currentCountry].filter(Boolean).join(', ');
  const liveLead = leads.find((l) => l.status !== 'ARCHIVED') ?? leads[0] ?? null;
  const csLeadForActivation = leads.find(
    (l) =>
      l.targetBusiness === 'CANDIDATE_SERVICES' &&
      l.status !== 'ARCHIVED' &&
      l.status !== 'CONVERTED',
  );

  const headerMeta = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
      {occupationName && (
        <span className="inline-flex items-center gap-1">
          <Briefcase className="size-3" aria-hidden />
          {occupationName}
        </span>
      )}
      {location && (
        <span className="inline-flex items-center gap-1">
          <MapPin className="size-3" aria-hidden />
          {location}
        </span>
      )}
      {person.email && (
        <span className="inline-flex items-center gap-1">
          <Mail className="size-3" aria-hidden />
          {person.email}
        </span>
      )}
      {person.phone && (
        <span className="inline-flex items-center gap-1">
          <Phone className="size-3" aria-hidden />
          {person.phone}
        </span>
      )}
      {assignedUserName && (
        <span className="inline-flex items-center gap-1">
          Owner: <span className="text-foreground">{assignedUserName}</span>
        </span>
      )}
      {candidateProfile && (
        <Link
          href={`/candidates/${personId}`}
          className="inline-flex items-center gap-1 text-foreground underline-offset-2 hover:underline"
        >
          Open full candidate profile <ArrowRight className="size-3" aria-hidden />
        </Link>
      )}
    </div>
  );

  const statusPills = (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {liveLead && (
        <Badge
          variant={statusTone(liveLead.status)}
          className="rounded-full"
          title={`Lead ${liveLead.id}`}
        >
          {LEAD_LABEL[liveLead.status] ?? liveLead.status}
        </Badge>
      )}
      {candidateProfile && (
        <>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5">
            <StatusDot tone={statusTone(candidateProfile.availabilityStatus)} />
            {candidateProfile.availabilityStatus === 'AVAILABLE'
              ? 'Available'
              : candidateProfile.availabilityStatus === 'TEMPORARILY_UNAVAILABLE'
                ? 'Unavailable'
                : 'Placed'}
          </span>
          {candidateProfile.lifecycleStatus !== 'ACTIVE' && (
            <Badge variant={statusTone(candidateProfile.lifecycleStatus)} className="rounded-full">
              {candidateProfile.lifecycleStatus}
            </Badge>
          )}
        </>
      )}
      {balance.byCurrency.map((c) => (
        <span
          key={c.currencyCode}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 tabular-nums',
            Number.parseFloat(c.outstanding) > 0
              ? 'border-status-warning/40 bg-status-warning-soft text-status-warning'
              : 'border-status-success/40 bg-status-success-soft text-status-success',
          )}
          title={`${c.verified} ${c.currencyCode} received of ${c.agreed} agreed`}
        >
          <Coins className="size-3" aria-hidden />
          {Number.parseFloat(c.outstanding) > 0
            ? `${formatCurrency(c.outstanding, c.currencyCode)} owed`
            : `${formatCurrency(c.agreed, c.currencyCode)} settled`}
        </span>
      ))}
    </div>
  );

  const overviewTab = (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-1 lg:sticky lg:top-4 lg:h-fit">
        <CardHeader>
          <CardTitle className="text-base">Identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Nationality" value={person.nationality ?? '—'} />
          <Row label="Date of birth" value={person.dateOfBirth ?? '—'} />
          <Row label="Source" value={person.source ?? 'DIRECT'} />
          <Row label="Enquiry opened" value={format(person.createdAt, 'dd MMM yyyy · HH:mm')} />
          {candidateProfile && (
            <Row
              label="Activated"
              value={`${format(candidateProfile.activatedAt, 'dd MMM yyyy · HH:mm')} (${formatDistanceToNow(
                candidateProfile.activatedAt,
                { addSuffix: true },
              )})`}
            />
          )}
          {person.notes && (
            <div className="border-t pt-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Notes</p>
              <p className="mt-1 whitespace-pre-wrap text-xs">{person.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Journey</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {leads.length === 0 ? (
              <EmptyRow icon={Scroll} text="No enquiry on file yet." />
            ) : (
              leads.map((l) => (
                <div
                  key={l.id}
                  className="flex items-start justify-between gap-3 border-b pb-2 last:border-b-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={statusTone(l.status)} className="rounded-full text-[10px]">
                        {LEAD_LABEL[l.status] ?? l.status}
                      </Badge>
                      <span className="truncate text-xs text-muted-foreground">
                        {l.targetBusiness.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <time className="text-[11px] text-muted-foreground">
                      Opened {format(l.createdAt, 'dd MMM yyyy · HH:mm')}
                      {l.acceptedAt &&
                        ` · Converted ${format(l.acceptedAt, 'dd MMM yyyy · HH:mm')}`}
                    </time>
                  </div>
                  <Link
                    href={`/leads/${l.id}`}
                    className="shrink-0 text-xs text-foreground underline-offset-2 hover:underline"
                  >
                    Open lead
                  </Link>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {balance.pendingQuotes.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Accepted quotes awaiting payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {balance.pendingQuotes.map((q) => (
                <div
                  key={q.proFormaId}
                  className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 p-3"
                >
                  <div>
                    <div className="text-xs text-muted-foreground">Quote {q.proFormaNumber}</div>
                    <div className="font-semibold tabular-nums">
                      {formatCurrency(q.agreedAmount, q.currencyCode)}
                    </div>
                  </div>
                  <Link
                    href={`/leads/${q.sourceLeadId}/pro-formas/${q.proFormaId}`}
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                  >
                    Record payment
                    <ArrowRight className="ml-1 size-3.5" />
                  </Link>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );

  const billingTab = (
    <div className="space-y-6">
      {balance.byCurrency.length === 0 && balance.engagements.length === 0 && (
        <EmptyRow icon={Coins} text="No quotes, invoices or payments on file yet." />
      )}

      {balance.engagements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Service engagements</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {balance.engagements.map((e) => (
              <div
                key={e.engagementId}
                className="rounded-md border p-3"
                data-testid="engagement-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{e.serviceName}</div>
                    <Badge variant={statusTone(e.status)} className="mt-1 rounded-full text-[10px]">
                      {e.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      Balance
                    </div>
                    <div className="text-base font-semibold tabular-nums">
                      {Number.parseFloat(e.outstanding) > 0
                        ? formatCurrency(e.outstanding, e.currencyCode)
                        : 'Settled'}
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 border-t pt-2 text-xs text-muted-foreground">
                  <span>
                    Agreed:{' '}
                    <span className="text-foreground tabular-nums">
                      {formatCurrency(e.agreedAmount, e.currencyCode)}
                    </span>
                  </span>
                  <span>
                    Received:{' '}
                    <span className="text-foreground tabular-nums">
                      {formatCurrency(e.verifiedPaid, e.currencyCode)}
                    </span>
                  </span>
                  {e.linkedProFormaNumbers.length > 0 && (
                    <span>Quote: {e.linkedProFormaNumbers.join(', ')}</span>
                  )}
                  {e.linkedInvoiceNumbers.length > 0 && (
                    <span>
                      Invoice{e.linkedInvoiceNumbers.length > 1 ? 's' : ''}:{' '}
                      {e.linkedInvoiceNumbers.map((n, i) => (
                        <span key={n}>
                          {i > 0 && ', '}
                          <Link
                            href={`/candidates/${personId}/invoices/${n}`}
                            className="text-foreground underline-offset-2 hover:underline"
                          >
                            {n}
                          </Link>
                        </span>
                      ))}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {proFormas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quotes (pro-formas)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {proFormas.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-2 border-b pb-2 text-xs last:border-b-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.number}</span>
                    <Badge variant={statusTone(p.status)} className="rounded-full text-[10px]">
                      {PF_LABEL[p.status] ?? p.status}
                    </Badge>
                    {p.revision > 1 && (
                      <span className="text-[10px] text-muted-foreground">rev {p.revision}</span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">
                    {formatCurrency(p.subtotal, p.currencyCode)} ·{' '}
                    {p.issuedAt
                      ? `issued ${format(p.issuedAt, 'dd MMM yyyy · HH:mm')}`
                      : 'not yet issued'}
                  </div>
                </div>
                <Link
                  href={`/leads/${p.sourceLeadId}/pro-formas/${p.id}`}
                  className="shrink-0 text-foreground underline-offset-2 hover:underline"
                >
                  Open
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {invoices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invoices</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {invoices.map((i) => (
              <div
                key={i.id}
                className="flex items-center justify-between gap-2 border-b pb-2 text-xs last:border-b-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{i.number}</span>
                    <Badge variant={statusTone(i.status)} className="rounded-full text-[10px]">
                      {INVOICE_LABEL[i.status] ?? i.status}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">
                    Total {formatCurrency(i.totalAmount, i.currencyCode)}
                    {i.status !== 'VOIDED' && Number.parseFloat(i.outstandingAmount) > 0 && (
                      <> · Outstanding {formatCurrency(i.outstandingAmount, i.currencyCode)}</>
                    )}
                    · issued {format(i.issuedAt, 'dd MMM yyyy · HH:mm')}
                  </div>
                </div>
                <Link
                  href={`/candidates/${personId}/invoices/${i.number}`}
                  className="shrink-0 text-foreground underline-offset-2 hover:underline"
                >
                  View invoice
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {payments.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-2 border-b pb-2 text-xs last:border-b-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums font-medium">
                      {formatCurrency(p.amount, p.currencyCode)}
                    </span>
                    <Badge variant={statusTone(p.status)} className="rounded-full text-[10px]">
                      {PAYMENT_LABEL[p.status] ?? p.status}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {p.method.replace(/_/g, ' ')}
                    {p.receivedAt && ` · received ${format(p.receivedAt, 'dd MMM yyyy')}`}
                    {' · recorded '}
                    {format(p.createdAt, 'dd MMM yyyy · HH:mm')}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );

  const documentsTab = (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Financial documents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {proFormas.length === 0 && invoices.length === 0 && (
          <EmptyRow icon={FileText} text="No documents to download yet." />
        )}
        {proFormas.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between gap-2 border-b pb-2 text-xs last:border-b-0 last:pb-0"
          >
            <div className="flex items-center gap-2">
              <Scroll className="size-3.5 text-muted-foreground" aria-hidden />
              <span className="font-medium">{p.number}</span>
              <span className="text-[11px] text-muted-foreground">Quote</span>
            </div>
            <Link
              href={`/leads/${p.sourceLeadId}/pro-formas/${p.id}/print`}
              target="_blank"
              className="shrink-0 text-foreground underline-offset-2 hover:underline"
            >
              Open PDF
            </Link>
          </div>
        ))}
        {invoices.map((i) => (
          <div
            key={i.id}
            className="flex items-center justify-between gap-2 border-b pb-2 text-xs last:border-b-0 last:pb-0"
          >
            <div className="flex items-center gap-2">
              <Receipt className="size-3.5 text-muted-foreground" aria-hidden />
              <span className="font-medium">{i.number}</span>
              <span className="text-[11px] text-muted-foreground">Official invoice</span>
            </div>
            <Link
              href={`/candidates/${personId}/invoices/${i.number}`}
              className="shrink-0 text-foreground underline-offset-2 hover:underline"
            >
              View invoice
            </Link>
          </div>
        ))}
      </CardContent>
    </Card>
  );

  const activityTab = (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {data.timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing to show yet — the timeline fills in as quotes, payments and invoices land.
          </p>
        ) : (
          <ol className="space-y-3 text-sm">
            {data.timeline.map((t) => (
              <li
                key={t.id}
                className="relative flex gap-3 border-l-2 border-border pl-4 last:pb-0"
              >
                <span className="absolute -left-[5px] top-1.5 size-2 rounded-full bg-muted-foreground/60" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{t.title}</div>
                  <div className="text-xs text-muted-foreground">{t.subtitle}</div>
                </div>
                <time
                  dateTime={t.at.toISOString()}
                  className="shrink-0 text-right text-[11px] tabular-nums text-muted-foreground"
                  title={format(t.at, 'dd MMM yyyy · HH:mm')}
                >
                  {format(t.at, 'dd MMM')}
                  <br />
                  {format(t.at, 'HH:mm')}
                </time>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={fullName} description={headerMeta} />
      {statusPills}

      {nextAction && (
        <ClientNextActionIsland
          action={nextAction}
          activationLeadId={csLeadForActivation?.id ?? null}
        />
      )}

      {!nextAction && candidateProfile && (
        <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          <UserCheck className="mr-1 inline size-3.5 align-text-bottom" aria-hidden />
          Everything is up to date for this client. New activity will surface a next action here.
        </div>
      )}

      <ClientWorkspaceTabs
        overview={overviewTab}
        billing={billingTab}
        documents={documentsTab}
        activity={activityTab}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-xs">{value}</span>
    </div>
  );
}

function EmptyRow({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
      <Icon className="size-3.5" aria-hidden />
      {text}
    </div>
  );
}
