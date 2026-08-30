import { Briefcase } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AssignToMeButton } from '@/components/assign-to-me-button';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireRole } from '@/lib/auth/session';
import {
  listApplicationsForRequisition,
  listShortlistPromotionCandidates,
} from '@/modules/applications/service';
import { listMatches } from '@/modules/matching/service';
import { fetchQualifications } from '@/modules/qualifications/service';
import {
  fetchRequisition,
  listRequisitionQualifications,
  listRequisitionSkills,
} from '@/modules/requisitions/service';
import { fetchSkills } from '@/modules/skills/service';
import { ApplicationsSection } from './applications-section';
import { MatchesSection } from './matches-section';
import { PromoteShortlistSection } from './promote-shortlist';
import { RequisitionQualificationsSection, RequisitionSkillsSection } from './requirements-section';
import { RunMatchingButton } from './requisition-actions';

export const dynamic = 'force-dynamic';

export default async function RequisitionDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const { id } = await params;
  const requisition = await fetchRequisition(id);
  if (!requisition) notFound();

  const [
    matches,
    applications,
    shortlistPromotions,
    requisitionSkillRows,
    requisitionQualRows,
    allSkills,
    allQualifications,
  ] = await Promise.all([
    listMatches(id),
    listApplicationsForRequisition(id),
    listShortlistPromotionCandidates(id),
    listRequisitionSkills(id),
    listRequisitionQualifications(id),
    fetchSkills(),
    fetchQualifications(),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Briefcase}
          title={requisition.title}
          description={
            <>
              <Link
                href={`/employers/${requisition.employerId}`}
                className="underline underline-offset-2"
              >
                {requisition.employerName}
              </Link>
              {' · '}
              {requisition.positionsFilled} of {requisition.positionsRequired} filled ·{' '}
              {requisition.employmentType.replace(/_/g, ' ')}
              {requisition.location ? ` · ${requisition.location}` : ''}
            </>
          }
          badge={requisition.status.replace(/_/g, ' ')}
          action={
            <div className="flex items-center gap-2">
              <AssignToMeButton
                entity="requisition"
                id={id}
                currentUserId={session.user.id}
                currentAssignedUserId={requisition.assignedUserId}
              />
              <RunMatchingButton requisitionId={id} />
            </div>
          }
        />
      </FadeUp>

      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FadeUp delay={0.03}>
          <RequisitionSkillsSection
            requisitionId={id}
            rows={requisitionSkillRows}
            allSkills={allSkills}
          />
        </FadeUp>
        <FadeUp delay={0.04}>
          <RequisitionQualificationsSection
            requisitionId={id}
            rows={requisitionQualRows}
            allQualifications={allQualifications}
          />
        </FadeUp>
      </div>

      <FadeUp delay={0.05} className="mb-8">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Matches</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Score: occupation +40 · available +15 · active +5 · location +5 · required skills up
                to +25 (proportional) · required qualifications up to +10. Click "Why?" on any row
                for the breakdown. Bucket: ≥70 HIGH · 40–69 MEDIUM · else LOW.
              </p>
            </div>
            <Badge variant="secondary" className="rounded-full">
              {matches.length} total
            </Badge>
          </CardHeader>
          <CardContent>
            <MatchesSection requisitionId={id} matches={matches} />
          </CardContent>
        </Card>
      </FadeUp>

      <FadeUp delay={0.08} className="mb-8">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Shortlist</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Promote a shortlisted candidate into a formal Job Application.
              </p>
            </div>
            <Badge variant="secondary" className="rounded-full">
              {shortlistPromotions.length} shortlisted
            </Badge>
          </CardHeader>
          <CardContent>
            <PromoteShortlistSection requisitionId={id} candidates={shortlistPromotions} />
          </CardContent>
        </Card>
      </FadeUp>

      <FadeUp delay={0.1}>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Applications</CardTitle>
            <Badge variant="secondary" className="rounded-full">
              {applications.length}
            </Badge>
          </CardHeader>
          <CardContent>
            <ApplicationsSection requisitionId={id} applications={applications} />
          </CardContent>
        </Card>
      </FadeUp>

      {requisition.description && (
        <FadeUp delay={0.15} className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {requisition.description}
              </p>
              {requisition.candidateRequirements && (
                <>
                  <p className="mt-4 text-sm font-medium">Candidate requirements</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                    {requisition.candidateRequirements}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </FadeUp>
      )}

      <div className="mt-8 text-xs text-muted-foreground">
        <Link href="/placements" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          View placements
        </Link>
      </div>
    </div>
  );
}
