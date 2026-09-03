import { formatDistanceToNow } from 'date-fns';
import { CalendarClock, PlaneTakeoff, User } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AssignToMeButton } from '@/components/assign-to-me-button';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireRole } from '@/lib/auth/session';
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
import { CaseTasksSection } from './tasks-section';

export const dynamic = 'force-dynamic';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  OPEN: 'secondary',
  DOCUMENTS_PENDING: 'outline',
  SUBMITTED: 'default',
  UNDER_AUTHORITY_REVIEW: 'default',
  APPROVED: 'default',
  REJECTED: 'outline',
  CLOSED: 'outline',
};

export default async function ImmigrationCaseDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole(['ADMIN', 'STAFF']);
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

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={PlaneTakeoff}
          title={`${c.caseType.replace(/_/g, ' ')} · ${c.beneficiaryName}`}
          description={
            <>
              <Link
                href={`/candidates/${c.beneficiaryPersonId}`}
                className="underline underline-offset-2"
              >
                {c.beneficiaryName}
              </Link>
              {c.sponsorName && (
                <>
                  {' · sponsor: '}
                  {c.sponsorEmployerId ? (
                    <Link
                      href={`/employers/${c.sponsorEmployerId}`}
                      className="underline underline-offset-2"
                    >
                      {c.sponsorName}
                    </Link>
                  ) : (
                    c.sponsorName
                  )}
                </>
              )}
              {c.authorityReference && <> · ref {c.authorityReference}</>}
            </>
          }
          badge={c.status.replace(/_/g, ' ')}
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <FadeUp delay={0.05}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Case details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={STATUS_VARIANT[c.status] ?? 'secondary'} className="rounded-full">
                  {c.status.replace(/_/g, ' ')}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Type</span>
                <span>{c.caseType.replace(/_/g, ' ')}</span>
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

        <FadeUp delay={0.15}>
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

      <FadeUp delay={0.2} className="mt-8">
        <CaseTasksSection caseId={id} rows={caseTasks} />
      </FadeUp>

      <FadeUp delay={0.25} className="mt-6">
        <CaseDocumentsSection
          caseId={id}
          beneficiaryPersonId={c.beneficiaryPersonId}
          requirements={requirements}
          attachedDocs={attachedDocs}
          documentTypes={allDocumentTypes}
          beneficiaryDocuments={beneficiaryDocuments}
        />
      </FadeUp>
    </div>
  );
}
