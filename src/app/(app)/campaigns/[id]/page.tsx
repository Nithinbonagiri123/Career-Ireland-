import {
  Archive,
  ArchiveRestore,
  Briefcase,
  Building2,
  CalendarClock,
  CheckCircle2,
  Megaphone,
  Pause,
  Pencil,
  Play,
  Plus,
  Sparkles,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/empty-state';
import { KpiTile } from '@/components/kpi-tile';
import { FadeUp } from '@/components/motion/motion-primitives';
import { NextActionCard } from '@/components/next-action-card';
import { RecordHeaderActions } from '@/components/record-header-actions';
import { StatusChip } from '@/components/status-chip';
import { Timestamp } from '@/components/timestamp';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { checkPermission, requirePermission } from '@/lib/auth/session';
import {
  AD_ACCEPTS_PROSPECTS,
  AD_STATUS_LABEL,
  AD_TONE,
  type AdStatus,
  CAMPAIGN_STATUS_LABEL,
  CAMPAIGN_TONE,
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
import { AdDialog } from './ad-dialog';
import { CampaignActivitySection } from './campaign-activity-section';
import { CampaignTabs } from './campaign-tabs';
import { ProspectsPanel } from './prospects-panel';

export const dynamic = 'force-dynamic';

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
    <Card data-testid="campaign-ads">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="size-4 text-muted-foreground" aria-hidden /> Advertisements
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            One advertisement per country or job board. Prospects are recorded against the ad they
            responded to.
          </p>
        </div>
        {canChangeAds && (canCreateCampaign || canEditCampaign) && (
          <AdDialog
            campaignId={id}
            campaignActive={campaign.status === 'ACTIVE'}
            trigger={
              <Button size="sm">
                <Plus className="mr-1.5 size-4" /> New advertisement
              </Button>
            }
          />
        )}
      </CardHeader>
      <CardContent>
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
          <ul className="divide-y rounded-md border" data-testid="ad-rows">
            {ads.map((ad) => (
              <li key={ad.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {ad.country}
                    {ad.platform ? ` · ${ad.platform}` : ''}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                    {ad.startDate} → {ad.expiryDate} · target {ad.targetApplicants} ·{' '}
                    {ad.prospectCount} prospect{ad.prospectCount === 1 ? '' : 's'}
                    {ad.reminderOn ? ` · reminder ${ad.reminderOn}` : ''}
                  </p>
                </div>
                <StatusChip
                  label={AD_STATUS_LABEL[ad.status as AdStatus]}
                  tone={AD_TONE[ad.status as AdStatus]}
                />
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
      </CardContent>
    </Card>
  );

  const overviewTab = (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">About this campaign</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Job</dt>
            <dd>
              {campaign.jobRequisitionId ? (
                <Link
                  href={`/requisitions/${campaign.jobRequisitionId}`}
                  className="hover:underline"
                >
                  {campaign.requisitionTitle}
                </Link>
              ) : (
                'Talent pool (no job)'
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Employer</dt>
            <dd>
              {campaign.employerId ? (
                <Link href={`/employers/${campaign.employerId}`} className="hover:underline">
                  {campaign.employerName}
                </Link>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Created</dt>
            <dd>
              <Timestamp date={campaign.createdAt} absoluteOnly />
              {campaign.createdByName ? ` by ${campaign.createdByName}` : ''}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Started</dt>
            <dd>
              {campaign.startedAt ? (
                <Timestamp date={campaign.startedAt} absoluteOnly />
              ) : (
                'Not started'
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Ended</dt>
            <dd>{campaign.endedAt ? <Timestamp date={campaign.endedAt} absoluteOnly /> : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Last updated</dt>
            <dd>
              <Timestamp date={campaign.updatedAt} absoluteOnly />
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Notes</dt>
            <dd className="whitespace-pre-wrap">{campaign.notes ?? '—'}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
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
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <nav className="mb-4 text-sm text-muted-foreground">
          <Link href="/campaigns" className="hover:text-foreground hover:underline">
            Campaigns
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-foreground">{campaign.name}</span>
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <span
              aria-hidden
              className="grid size-16 shrink-0 place-items-center rounded-2xl bg-pink-100 text-pink-700 ring-1 ring-pink-200/70"
            >
              <Sparkles className="size-7" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground [overflow-wrap:anywhere] sm:text-3xl">
                  {campaign.name}
                </h1>
                <StatusChip
                  label={CAMPAIGN_STATUS_LABEL[campaign.status]}
                  tone={CAMPAIGN_TONE[campaign.status]}
                  className="text-xs"
                />
                {archived && <StatusChip label="Archived" tone="bg-muted text-muted-foreground" />}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                {campaign.jobRequisitionId ? (
                  <Link
                    href={`/requisitions/${campaign.jobRequisitionId}`}
                    className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
                    data-testid="campaign-job-link"
                  >
                    <Briefcase className="size-3" aria-hidden /> {campaign.requisitionTitle}
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Briefcase className="size-3" aria-hidden /> Talent pool
                  </span>
                )}
                {campaign.employerId && (
                  <Link
                    href={`/employers/${campaign.employerId}`}
                    className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
                    data-testid="campaign-employer-link"
                  >
                    <Building2 className="size-3" aria-hidden /> {campaign.employerName}
                  </Link>
                )}
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="size-3" aria-hidden />
                  {campaign.startedAt ? (
                    <>
                      Started{' '}
                      <Timestamp date={campaign.startedAt} absoluteOnly className="text-xs" />
                    </>
                  ) : (
                    'Not started'
                  )}
                </span>
                {campaign.createdByName && <span>Created by {campaign.createdByName}</span>}
              </div>
            </div>
          </div>

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
        </div>

        {archived && (
          <p
            className="mt-4 rounded-md border bg-muted px-3 py-2 text-xs text-muted-foreground"
            data-testid="campaign-archived"
          >
            Archived{' '}
            <Timestamp date={campaign.archivedAt as Date} absoluteOnly className="text-xs" /> — read
            only. Restore it to make changes.
          </p>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="campaign-kpis">
          <KpiTile
            icon={Megaphone}
            label="Ads"
            value={ads.length}
            hint={`${ads.filter((a) => a.status === 'ACTIVE').length} running`}
            tone="blue"
          />
          <KpiTile
            icon={Users}
            label="Prospects"
            value={prospects.length}
            hint={`${newProspects} to screen`}
            tone="amber"
          />
          <KpiTile
            icon={UserCheck}
            label="Ready to convert"
            value={ready}
            hint="Screened or in talent pool"
            tone="rose"
          />
          <KpiTile
            icon={CheckCircle2}
            label="Converted"
            value={campaign.convertedCount}
            hint="Now candidates"
            tone="green"
          />
        </div>
      </FadeUp>

      {nextAction && (
        <FadeUp delay={0.02}>
          <NextActionCard {...nextAction} className="mt-5" />
        </FadeUp>
      )}

      <FadeUp delay={0.05} className="mt-6">
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
