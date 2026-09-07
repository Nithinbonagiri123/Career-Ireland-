import { Briefcase, Building2, MapPin, Users } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AssignToMeButton } from '@/components/assign-to-me-button';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireInternalStaff } from '@/lib/auth/session';
import { statusTone } from '@/lib/ui/status-tone';
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
import { RequisitionTabs } from './requisition-tabs';

export const dynamic = 'force-dynamic';

export default async function RequisitionDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireInternalStaff();
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

  const metaStrip = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
      <Badge variant={statusTone(requisition.status)} className="rounded-full">
        {requisition.status.replace(/_/g, ' ')}
      </Badge>
      <Link
        href={`/employers/${requisition.employerId}`}
        className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-muted-foreground transition-colors hover:text-foreground"
      >
        <Building2 className="size-3" aria-hidden />
        {requisition.employerName}
      </Link>
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Users className="size-3" aria-hidden />
        {requisition.positionsFilled} of {requisition.positionsRequired} filled
      </span>
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-muted-foreground">
        {requisition.employmentType.replace(/_/g, ' ')}
      </span>
      {requisition.location && (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <MapPin className="size-3" aria-hidden />
          {requisition.location}
        </span>
      )}
    </div>
  );

  const overviewTab = (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
      {requisition.description && (
        <FadeUp delay={0.05}>
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
    </div>
  );

  const matchesTab = (
    <FadeUp>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Matches</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Score: occupation +40 · available +15 · active +5 · location +5 · required skills up to
            +25 (proportional) · required qualifications up to +10. Click "Why?" on any row for the
            breakdown. Bucket: ≥70 HIGH · 40–69 MEDIUM · else LOW.
          </p>
        </CardHeader>
        <CardContent>
          <MatchesSection requisitionId={id} matches={matches} />
        </CardContent>
      </Card>
    </FadeUp>
  );

  const shortlistTab = (
    <FadeUp>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Shortlist</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Promote a shortlisted candidate into a formal Job Application.
          </p>
        </CardHeader>
        <CardContent>
          <PromoteShortlistSection requisitionId={id} candidates={shortlistPromotions} />
        </CardContent>
      </Card>
    </FadeUp>
  );

  const applicationsTab = (
    <FadeUp>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Applications</CardTitle>
        </CardHeader>
        <CardContent>
          <ApplicationsSection requisitionId={id} applications={applications} />
        </CardContent>
      </Card>
    </FadeUp>
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Briefcase}
          title={requisition.title}
          breadcrumbs={[
            { label: 'Requisitions', href: '/requisitions' },
            { label: requisition.title },
          ]}
          meta={metaStrip}
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

      <RequisitionTabs
        overview={overviewTab}
        matches={matchesTab}
        shortlist={shortlistTab}
        applications={applicationsTab}
        counts={{
          matches: matches.length,
          shortlist: shortlistPromotions.length,
          applications: applications.length,
        }}
      />

      <div className="mt-8 text-xs text-muted-foreground">
        <Link href="/placements" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          View placements
        </Link>
      </div>
    </div>
  );
}
