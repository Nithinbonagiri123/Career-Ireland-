import { formatDistanceToNow } from 'date-fns';
import { Briefcase, Building2, FileText, Globe, Send, User } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireInternalStaff } from '@/lib/auth/session';
import { fetchApplication } from '@/modules/applications/service';
import { fetchCurrencies } from '@/modules/currencies/service';
import { listInterviewsForApplication } from '@/modules/interviews/service';
import { listOffersForApplication } from '@/modules/offers/service';
import { InterviewsSection } from './interviews-section';
import { OffersSection } from './offers-section';

export const dynamic = 'force-dynamic';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  APPLIED: 'secondary',
  UNDER_REVIEW: 'secondary',
  SHORTLISTED: 'default',
  INTERVIEW: 'default',
  OFFER: 'default',
  ACCEPTED: 'default',
  REJECTED: 'outline',
  WITHDRAWN: 'outline',
};

const SOURCE_LABEL: Record<string, string> = {
  INTERNAL: 'Internal',
  IRISH_JOBS: 'IrishJobs',
  INDEED: 'Indeed',
  JOBS_IRELAND: 'JobsIreland',
  LINKEDIN: 'LinkedIn',
  COMPANY_WEBSITE: 'Company site',
  REFERRAL: 'Referral',
  OTHER: 'Other',
};

export default async function ApplicationDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireInternalStaff();
  const { id } = await params;
  const app = await fetchApplication(id);
  if (!app) notFound();

  const [interviews, offers, currencies] = await Promise.all([
    listInterviewsForApplication(id),
    listOffersForApplication(id),
    fetchCurrencies(),
  ]);

  const isExternal = app.source !== 'INTERNAL';
  const jobLabel = isExternal
    ? (app.externalJobTitle ?? app.externalCompanyName ?? 'External application')
    : (app.requisitionTitle ?? 'Requisition');
  const companyLabel = isExternal ? app.externalCompanyName : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Send}
          title={jobLabel}
          description={
            <>
              <Link href={`/candidates/${app.personId}`} className="underline underline-offset-2">
                {app.personName}
              </Link>
              {companyLabel && <> · {companyLabel}</>}
              {!isExternal && app.jobRequisitionId && (
                <>
                  {' · '}
                  <Link
                    href={`/requisitions/${app.jobRequisitionId}`}
                    className="underline underline-offset-2"
                  >
                    Open requisition
                  </Link>
                </>
              )}
              {' · applied '}
              {formatDistanceToNow(app.appliedAt, { addSuffix: true })}
            </>
          }
          badge={app.status.replace(/_/g, ' ')}
        />
      </FadeUp>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <FadeUp delay={0.05}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Application</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={STATUS_VARIANT[app.status] ?? 'secondary'} className="rounded-full">
                  {app.status.replace(/_/g, ' ')}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Source</span>
                <Badge variant="outline" className="rounded-full text-[10px]">
                  <Globe className="mr-0.5 size-2.5" />
                  {SOURCE_LABEL[app.source] ?? app.source}
                </Badge>
              </div>
              {app.externalJobReference && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">External ref</span>
                  <span className="font-mono text-[11px]">{app.externalJobReference}</span>
                </div>
              )}
              {app.externalJobUrl && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Posting</span>
                  <a
                    href={app.externalJobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-xs underline underline-offset-2"
                  >
                    Open ↗
                  </a>
                </div>
              )}
              <div className="flex items-start justify-between gap-2">
                <span className="text-muted-foreground">CV submitted</span>
                {app.cvDocument ? (
                  <a
                    href={`/api/documents/${app.cvDocument.id}/download`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-w-0 items-center gap-1 text-xs underline underline-offset-2"
                    title={app.cvDocument.originalFilename}
                  >
                    <FileText className="size-3 shrink-0" />
                    <span className="truncate">{app.cvDocument.originalFilename}</span>
                    <span className="shrink-0 text-muted-foreground">
                      v{app.cvDocument.version}
                    </span>
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">Not attached</span>
                )}
              </div>
              {app.rejectionReason && (
                <div className="border-t pt-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Rejection reason
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-xs">{app.rejectionReason}</p>
                </div>
              )}
              {app.notes && (
                <div className="border-t pt-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Notes</p>
                  <p className="mt-1 whitespace-pre-wrap text-xs">{app.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </FadeUp>

        <FadeUp delay={0.1}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="size-4" /> Candidate
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-medium">{app.personName}</p>
              {app.personEmail && (
                <p className="text-xs text-muted-foreground">{app.personEmail}</p>
              )}
              <Link
                href={`/candidates/${app.personId}`}
                className="text-xs underline underline-offset-2"
              >
                Open candidate profile
              </Link>
            </CardContent>
          </Card>
        </FadeUp>

        <FadeUp delay={0.15}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {isExternal ? (
                  <>
                    <Globe className="size-4" /> External employer
                  </>
                ) : (
                  <>
                    <Building2 className="size-4" /> Employer / requisition
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {isExternal ? (
                <>
                  <p className="font-medium">{app.externalCompanyName ?? '—'}</p>
                  {app.externalJobTitle && (
                    <p className="text-xs text-muted-foreground">{app.externalJobTitle}</p>
                  )}
                </>
              ) : (
                <>
                  <p className="font-medium">{app.requisitionTitle ?? 'Requisition'}</p>
                  {app.requisitionEmployerId && (
                    <Link
                      href={`/employers/${app.requisitionEmployerId}`}
                      className="text-xs underline underline-offset-2"
                    >
                      Open employer
                    </Link>
                  )}
                  {app.jobRequisitionId && (
                    <Link
                      href={`/requisitions/${app.jobRequisitionId}`}
                      className="block text-xs underline underline-offset-2"
                    >
                      Open requisition
                    </Link>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </FadeUp>
      </div>

      <FadeUp delay={0.2} className="mt-8">
        <InterviewsSection applicationId={id} rows={interviews} />
      </FadeUp>

      <FadeUp delay={0.25} className="mt-6">
        <OffersSection applicationId={id} rows={offers} currencies={currencies} />
      </FadeUp>

      <div className="mt-8 text-xs text-muted-foreground">
        <p>
          <Briefcase className="mr-1 inline size-3" />
          Accepting an offer will auto-move the application to ACCEPTED, which creates a Placement
          in PROPOSED. Confirming the placement flips candidate availability to PLACED.
        </p>
      </div>
    </div>
  );
}
