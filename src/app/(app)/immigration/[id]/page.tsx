import { formatDistanceToNow } from 'date-fns';
import { Building2, CalendarClock, Fingerprint, PlaneTakeoff, User } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AssignToMeButton } from '@/components/assign-to-me-button';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireInternalStaff } from '@/lib/auth/session';
import { statusTone } from '@/lib/ui/status-tone';
import { fetchTasksForImmigrationCase } from '@/modules/activities/service';
import { fetchDocumentTypes } from '@/modules/document-types/service';
import { fetchPersonDocuments } from '@/modules/documents/service';
import {
  fetchCase,
  listCaseDocumentRequirements,
  listCaseDocuments,
} from '@/modules/immigration/service';
import { ArchiveCaseButton } from './archive-button';
import { CaseDocumentsSection } from './case-documents-section';
import { CaseTabs } from './case-tabs';
import { CaseTasksSection } from './tasks-section';

export const dynamic = 'force-dynamic';

export default async function ImmigrationCaseDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireInternalStaff();
  const { id } = await params;
  const c = await fetchCase(id);
  if (!c) notFound();

  const [requirements, attachedDocs, allDocumentTypes, beneficiaryDocuments, caseTasks] =
    await Promise.all([
      listCaseDocumentRequirements(id),
      listCaseDocuments(id),
      fetchDocumentTypes(),
      fetchPersonDocuments(c.beneficiaryPersonId),
      fetchTasksForImmigrationCase(id),
    ]);

  const humanType = c.caseType.replace(/_/g, ' ');

  const metaStrip = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
      <Badge variant={statusTone(c.status)} className="rounded-full">
        {c.status.replace(/_/g, ' ')}
      </Badge>
      <Link
        href={`/candidates/${c.beneficiaryPersonId}`}
        className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-muted-foreground transition-colors hover:text-foreground"
      >
        <User className="size-3" aria-hidden />
        {c.beneficiaryName}
      </Link>
      {c.sponsorName &&
        (c.sponsorEmployerId ? (
          <Link
            href={`/employers/${c.sponsorEmployerId}`}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <Building2 className="size-3" aria-hidden />
            {c.sponsorName}
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Building2 className="size-3" aria-hidden />
            {c.sponsorName}
          </span>
        ))}
      {c.authorityReference && (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Fingerprint className="size-3" aria-hidden />
          ref {c.authorityReference}
        </span>
      )}
    </div>
  );

  const overviewTab = (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <FadeUp delay={0.05} className="lg:col-span-1 lg:sticky lg:top-4 lg:h-fit">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Case details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant={statusTone(c.status)} className="rounded-full text-[10px]">
                {c.status.replace(/_/g, ' ')}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Type</span>
              <span>{humanType}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Submitted</span>
              <span>{c.submittedAt ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Decision</span>
              <span>{c.decisionAt ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Expires</span>
              <span>{c.expiresOn ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Opened</span>
              <span title={c.createdAt.toLocaleString()}>
                {formatDistanceToNow(c.createdAt, { addSuffix: true })}
              </span>
            </div>
            {c.notes && (
              <div className="border-t pt-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Notes</p>
                <p className="mt-1 whitespace-pre-wrap text-xs">{c.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </FadeUp>

      <div className="space-y-6 lg:col-span-2">
        <FadeUp delay={0.1}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="size-4" /> Beneficiary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-medium">{c.beneficiaryName}</p>
              <Link
                href={`/candidates/${c.beneficiaryPersonId}`}
                className="text-xs text-muted-foreground underline underline-offset-2"
              >
                Open candidate profile
              </Link>
            </CardContent>
          </Card>
        </FadeUp>
        <FadeUp delay={0.12}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="size-4" /> Sponsor
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {c.sponsorName ? (
                <>
                  <p className="font-medium">{c.sponsorName}</p>
                  {c.sponsorEmployerId && (
                    <Link
                      href={`/employers/${c.sponsorEmployerId}`}
                      className="text-xs text-muted-foreground underline underline-offset-2"
                    >
                      Open employer
                    </Link>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No sponsor linked. Cases can also run independently of a placement.
                </p>
              )}
            </CardContent>
          </Card>
        </FadeUp>
      </div>
    </div>
  );

  const documentsTab = (
    <FadeUp>
      <CaseDocumentsSection
        caseId={id}
        beneficiaryPersonId={c.beneficiaryPersonId}
        requirements={requirements}
        attachedDocs={attachedDocs}
        documentTypes={allDocumentTypes}
        beneficiaryDocuments={beneficiaryDocuments}
      />
    </FadeUp>
  );

  const tasksTab = (
    <FadeUp>
      <CaseTasksSection caseId={id} rows={caseTasks} />
    </FadeUp>
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={PlaneTakeoff}
          title={`${humanType} · ${c.beneficiaryName}`}
          breadcrumbs={[
            { label: 'Immigration', href: '/immigration' },
            { label: c.beneficiaryName },
          ]}
          meta={metaStrip}
          action={
            <div className="flex items-center gap-2">
              <AssignToMeButton
                entity="immigration_case"
                id={id}
                currentUserId={session.user.id}
                currentAssignedUserId={c.assignedUserId}
              />
              <ArchiveCaseButton caseId={id} beneficiaryName={c.beneficiaryName} />
            </div>
          }
        />
      </FadeUp>

      <CaseTabs
        overview={overviewTab}
        documents={documentsTab}
        tasks={tasksTab}
        counts={{
          documents: attachedDocs.length,
          tasks: caseTasks.length,
        }}
      />
    </div>
  );
}
