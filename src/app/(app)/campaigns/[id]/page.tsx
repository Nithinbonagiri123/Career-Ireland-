import { format } from 'date-fns';
import {
  Archive,
  ArchiveRestore,
  Briefcase,
  Building2,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  FileText,
  Globe2,
  Megaphone,
  Pause,
  Pencil,
  Play,
  Plus,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StatTile, StatTileGrid } from '@/components/ds/stat-tile';
import { DsStatusPill } from '@/components/ds/status-pill';
import { DS_SOFT } from '@/components/ds/tones';
import {
  DetailRows,
  NextActionBanner,
  SectionCard,
  WorkspaceHeader,
} from '@/components/ds/workspace';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { RecordHeaderActions } from '@/components/record-header-actions';
import { Button } from '@/components/ui/button';
import { checkPermission, requirePermission } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import {
  AD_ACCEPTS_PROSPECTS,
  AD_STATUS_LABEL,
  type AdStatus,
  CAMPAIGN_STATUS_LABEL,
} from '@/modules/campaigns/labels';
import { computeCampaignNextAction } from '@/modules/campaigns/next-action';
import { fetchCampaignActivity, fetchFollowUpAssignees } from '@/modules/campaigns/prospects';
import {
  fetchAdsForCampaign,
  fetchCampaign,
  fetchCampaignProspects,
} from '@/modules/campaigns/service';
import { CampaignFormDialog } from '../campaign-dialog';
import { ArchiveCampaignDialog, CampaignTransitionDialog } from '../campaign-status-dialogs';
import { AD_DS_TONE, CAMPAIGN_DS_TONE } from '../campaign-tones';
import { AdDialog } from './ad-dialog';
import { CampaignActivitySection } from './campaign-activity-section';
import { CampaignTabs } from './campaign-tabs';
import { ProspectsPanel } from './prospects-panel';

export const dynamic = 'force-dynamic';

/** Absolute date + time, e.g. "30 Oct 2026 · 12:58". */
const stamp = (d: Date) => format(d, 'd MMM yyyy · HH:mm');
/** "2026-11-01" → "1 Nov 2026" (date-only columns). */
const formatDay = (d: string) => format(new Date(`${d}T00:00:00`), 'd MMM yyyy');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * R4 — campaign workspace (R1/R2 treatment): header with status, job and
 * employer links and lifecycle actions; KPI tiles; one next action; tabs
 * for Prospects (default), Advertisements, Overview and Activity.
 * Writes are offered only with recruitment.campaigns / prospects and are
 * re-checked by every server action.
 */
export default async function CampaignWorkspace({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ activityPage?: string }>;
}) {
  await requirePermission('recruitment', 'campaigns', 'view');
  const { id } = await params;
  const { activityPage } = await searchParams;
  // A malformed id is a missing page, not a server error.
  if (!UUID.test(id)) notFound();
  const campaign = await fetchCampaign(id);
  if (!campaign) notFound();

  const pageNo = Math.max(1, Number.parseInt(activityPage ?? '1', 10) || 1);
  const [
    ads,
    prospects,
    activity,
    assignees,
    canEditCampaign,
    canCreateCampaign,
    canCreateProspect,
    canEditProspect,
  ] = await Promise.all([
    fetchAdsForCampaign(id),
    fetchCampaignProspects(id),
    fetchCampaignActivity(id, { page: pageNo }),
    fetchFollowUpAssignees(),
    checkPermission('recruitment', 'campaigns', 'edit'),
    checkPermission('recruitment', 'campaigns', 'create'),
    checkPermission('recruitment', 'prospects', 'create'),
    checkPermission('recruitment', 'prospects', 'edit'),
  ]);

  const archived = Boolean(campaign.archivedAt);
  const ended = campaign.status === 'COMPLETED' || campaign.status === 'CANCELLED';
  // New prospects only while the campaign is not cancelled, archived or paused.
  const campaignOpen = !archived && campaign.status !== 'CANCELLED' && campaign.status !== 'PAUSED';
  const canChangeAds = canEditCampaign && !archived && !ended;
  const now = new Date();
  const newProspects = prospects.filter((p) => p.status === 'NEW').length;
  const ready = prospects.filter(
    (p) => p.status === 'SCREENED' || p.status === 'RETAINED_IN_POOL',
  ).length;
  const followUpsDue = prospects.filter(
    (p) => p.followUpDueAt && p.followUpDueAt.getTime() <= now.getTime(),
  ).length;
  const jobOpen =
    campaign.jobRequisitionId &&
    campaign.requisitionStatus !== 'CLOSED' &&
    campaign.requisitionStatus !== 'CANCELLED';

  const nextAction = computeCampaignNextAction({
    campaignId: id,
    status: campaign.status,
    archived,
    adCount: ads.length,
    activeAdCount: ads.filter((a) => a.status === 'ACTIVE').length,
    newProspects,
    readyToConvert: ready,
    followUpsDue,
  });

  const adOptions = ads.map((a) => ({
    id: a.id,
    label: `${a.country}${a.platform ? ` · ${a.platform}` : ''} (${AD_STATUS_LABEL[a.status as AdStatus].toLowerCase()})`,
    open: AD_ACCEPTS_PROSPECTS.includes(a.status as AdStatus),
  }));

  const adsTab = (
    <SectionCard
      testId="campaign-ads"
      icon={Megaphone}
      title="Advertisements"
      count={ads.length}
      description="One advertisement per country or job board. Prospects are recorded against the ad they responded to."
      action={
        canChangeAds && (canCreateCampaign || canEditCampaign) ? (
          <AdDialog
            campaignId={id}
            campaignActive={campaign.status === 'ACTIVE'}
            trigger={
              <Button size="sm">
                <Plus className="mr-1.5 size-4" /> New advertisement
              </Button>
            }
          />
        ) : undefined
      }
    >
      {ads.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No advertisements yet"
          description={
            canChangeAds
              ? 'Add one per country or job board to start collecting prospects.'
              : 'This campaign has no advertisements.'
          }
        />
      ) : (
        <ul
          className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60"
          data-testid="ad-rows"
        >
          {ads.map((ad) => (
            <li
              key={ad.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/30"
            >
              <span
                aria-hidden
                className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-lg',
                  DS_SOFT[AD_DS_TONE[ad.status as AdStatus]],
                )}
              >
                <Globe2 className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {ad.country}
                  {ad.platform && (
                    <span className="font-normal text-muted-foreground">· {ad.platform}</span>
                  )}
                  <DsStatusPill tone={AD_DS_TONE[ad.status as AdStatus]}>
                    {AD_STATUS_LABEL[ad.status as AdStatus]}
                  </DsStatusPill>
                </p>
                <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                  {formatDay(ad.startDate)} → {formatDay(ad.expiryDate)} · target{' '}
                  {ad.targetApplicants} · {ad.prospectCount} prospect
                  {ad.prospectCount === 1 ? '' : 's'}
                  {ad.reminderOn ? ` · reminder ${formatDay(ad.reminderOn)}` : ''}
                </p>
              </div>
              {canChangeAds && ad.status !== 'CLOSED' && (
                <AdDialog
                  campaignId={id}
                  campaignActive={campaign.status === 'ACTIVE'}
                  initial={ad}
                  trigger={
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`Edit advertisement ${ad.country}`}
                    >
                      <Pencil className="mr-1.5 size-3.5" /> Edit
                    </Button>
                  }
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );

  const overviewTab = (
    <SectionCard icon={FileText} title="About this campaign">
      <DetailRows
        rows={[
          {
            label: 'Job',
            value: campaign.jobRequisitionId ? (
              <Link href={`/requisitions/${campaign.jobRequisitionId}`} className="hover:underline">
                {campaign.requisitionTitle}
              </Link>
            ) : (
              'Talent pool (no job)'
            ),
          },
          ...(campaign.employerId
            ? [
                {
                  label: 'Employer',
                  value: (
                    <Link href={`/employers/${campaign.employerId}`} className="hover:underline">
                      {campaign.employerName}
                    </Link>
                  ),
                },
              ]
            : []),
          {
            label: 'Created',
            value: (
              <span>
                {stamp(campaign.createdAt)}
                {campaign.createdByName ? ` by ${campaign.createdByName}` : ''}
              </span>
            ),
          },
          ...(campaign.startedAt ? [{ label: 'Started', value: stamp(campaign.startedAt) }] : []),
          ...(campaign.endedAt ? [{ label: 'Ended', value: stamp(campaign.endedAt) }] : []),
          { label: 'Last updated', value: stamp(campaign.updatedAt) },
        ]}
      />
      {campaign.notes && (
        <div className="mt-4 border-t border-border/60 pt-3">
          <p className="text-xs font-medium text-muted-foreground">Notes</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/80">{campaign.notes}</p>
        </div>
      )}
    </SectionCard>
  );

  // One primary lifecycle step per state; Complete sits beside it while running or paused.
  const lifecycle = !archived &&
    canEditCampaign && [
      campaign.status === 'DRAFT' && (
        <CampaignTransitionDialog
          key="activate"
          campaignId={id}
          to="ACTIVE"
          trigger={
            <Button size="sm">
              <Play className="mr-1.5 size-4" /> Activate
            </Button>
          }
        />
      ),
      campaign.status === 'ACTIVE' && (
        <CampaignTransitionDialog
          key="pause"
          campaignId={id}
          to="PAUSED"
          trigger={
            <Button size="sm" variant="outline">
              <Pause className="mr-1.5 size-4" /> Pause
            </Button>
          }
        />
      ),
      campaign.status === 'PAUSED' && (
        <CampaignTransitionDialog
          key="resume"
          campaignId={id}
          to="RESUME"
          trigger={
            <Button size="sm">
              <Play className="mr-1.5 size-4" /> Resume
            </Button>
          }
        />
      ),
    ];
  const running = campaign.status === 'ACTIVE' || campaign.status === 'PAUSED';

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <WorkspaceHeader
          breadcrumbs={[{ label: 'Campaigns', href: '/campaigns' }, { label: campaign.name }]}
          avatar={{ icon: Megaphone, tone: CAMPAIGN_DS_TONE[campaign.status] }}
          title={campaign.name}
          status={
            <span className="flex flex-wrap items-center gap-1.5">
              <DsStatusPill tone={CAMPAIGN_DS_TONE[campaign.status]}>
                {CAMPAIGN_STATUS_LABEL[campaign.status]}
              </DsStatusPill>
              {archived && <DsStatusPill tone="slate">Archived</DsStatusPill>}
            </span>
          }
          meta={[
            {
              key: 'job',
              icon: Briefcase,
              content: campaign.jobRequisitionId ? (
                <Link
                  href={`/requisitions/${campaign.jobRequisitionId}`}
                  className="underline-offset-2 hover:text-foreground hover:underline"
                  data-testid="campaign-job-link"
                >
                  {campaign.requisitionTitle}
                </Link>
              ) : (
                'Talent pool'
              ),
            },
            {
              key: 'employer',
              icon: Building2,
              content: campaign.employerId ? (
                <Link
                  href={`/employers/${campaign.employerId}`}
                  className="underline-offset-2 hover:text-foreground hover:underline"
                  data-testid="campaign-employer-link"
                >
                  {campaign.employerName}
                </Link>
              ) : null,
            },
          ]}
          chips={[
            {
              key: 'started',
              icon: CalendarClock,
              content: campaign.startedAt ? `Started ${stamp(campaign.startedAt)}` : 'Not started',
            },
            {
              key: 'ended',
              icon: CheckCircle2,
              content: campaign.endedAt ? `Ended ${stamp(campaign.endedAt)}` : null,
            },
            {
              key: 'created',
              icon: CalendarPlus,
              content: `Created ${stamp(campaign.createdAt)}${campaign.createdByName ? ` by ${campaign.createdByName}` : ''}`,
            },
          ]}
          actions={
            <RecordHeaderActions
              primary={lifecycle ? lifecycle.find(Boolean) : undefined}
              secondary={[
                !archived && canEditCampaign && running && (
                  <CampaignTransitionDialog
                    key="complete"
                    campaignId={id}
                    to="COMPLETED"
                    trigger={
                      <Button size="sm" variant="outline">
                        <CheckCircle2 className="mr-1.5 size-4" /> Complete
                      </Button>
                    }
                  />
                ),
                !archived && canEditCampaign && (
                  <CampaignFormDialog
                    key="edit"
                    initial={{
                      id,
                      name: campaign.name,
                      notes: campaign.notes,
                      jobRequisitionId: campaign.jobRequisitionId,
                      requisitionTitle: campaign.requisitionTitle,
                      employerId: campaign.employerId,
                      employerName: campaign.employerName,
                      jobLocked: campaign.prospectCount > 0 || ended,
                    }}
                    trigger={
                      <Button size="sm" variant="outline">
                        <Pencil className="mr-1.5 size-4" /> Edit
                      </Button>
                    }
                  />
                ),

                !archived && canEditCampaign && !ended && (
                  <CampaignTransitionDialog
                    key="cancel"
                    campaignId={id}
                    to="CANCELLED"
                    trigger={
                      <Button size="sm" variant="outline">
                        <XCircle className="mr-1.5 size-4" /> Cancel campaign
                      </Button>
                    }
                  />
                ),
                canEditCampaign && !running && (
                  <ArchiveCampaignDialog
                    key="archive"
                    campaignId={id}
                    restore={archived}
                    trigger={
                      <Button size="sm" variant="outline">
                        {archived ? (
                          <ArchiveRestore className="mr-1.5 size-4" />
                        ) : (
                          <Archive className="mr-1.5 size-4" />
                        )}
                        {archived ? 'Restore' : 'Archive'}
                      </Button>
                    }
                  />
                ),
              ]}
            />
          }
        />

        {archived && (
          <p
            className="mt-4 flex items-center gap-2 rounded-2xl border border-border/60 bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm"
            data-testid="campaign-archived"
          >
            <Archive className="size-4 shrink-0" aria-hidden />
            Archived {stamp(campaign.archivedAt as Date)}. Read only; restore it to make changes.
          </p>
        )}

        <StatTileGrid className="mt-6">
          <StatTile
            testId="kpi-Ads"
            icon={Megaphone}
            label="Ads"
            value={ads.length}
            hint={`${ads.filter((a) => a.status === 'ACTIVE').length} running`}
            tone="blue"
          />
          <StatTile
            testId="kpi-Prospects"
            icon={Users}
            label="Prospects"
            value={prospects.length}
            hint={`${newProspects} to screen`}
            tone="amber"
          />
          <StatTile
            testId="kpi-Ready to convert"
            icon={UserCheck}
            label="Ready to convert"
            value={ready}
            hint="Screened or in talent pool"
            tone="violet"
          />
          <StatTile
            testId="kpi-Converted"
            icon={CheckCircle2}
            label="Converted"
            value={campaign.convertedCount}
            hint="Now candidates"
            tone="green"
          />
        </StatTileGrid>
      </FadeUp>

      {nextAction && (
        <FadeUp delay={0.02}>
          <NextActionBanner {...nextAction} className="mt-4" />
        </FadeUp>
      )}

      <FadeUp delay={0.05} className="mt-5">
        <CampaignTabs
          panels={{
            prospects: (
              <ProspectsPanel
                rows={prospects}
                ads={adOptions}
                canCreate={canCreateProspect}
                canEdit={canEditProspect}
                campaignOpen={campaignOpen}
                paused={campaign.status === 'PAUSED' && !archived}
                jobTitle={jobOpen ? campaign.requisitionTitle : null}
                assignees={assignees}
                nowIso={now.toISOString()}
              />
            ),
            ads: adsTab,
            overview: overviewTab,
            activity: (
              <CampaignActivitySection
                campaignId={id}
                rows={activity.rows}
                page={activity.page}
                hasMore={activity.hasMore}
              />
            ),
          }}
          counts={{ prospects: prospects.length, ads: ads.length }}
        />
      </FadeUp>
    </div>
  );
}
