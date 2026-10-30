import { format } from 'date-fns';
import {
  Briefcase,
  CalendarClock,
  CalendarPlus,
  History,
  Mail,
  Megaphone,
  Phone,
  Sparkles,
  UserCheck,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { initialsOf } from '@/components/ds/entity-card';
import { DsStatusPill } from '@/components/ds/status-pill';
import {
  ActivityTimeline,
  DetailRows,
  SectionCard,
  WorkspaceHeader,
} from '@/components/ds/workspace';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { checkPermission, requirePermission } from '@/lib/auth/session';
import { formatZoned, toZonedLocal } from '@/lib/zoned-time';
import { PROSPECT_STATUS_LABEL, type ProspectStatus } from '@/modules/campaigns/labels';
import { fetchFollowUpAssignees, fetchProspectDetail } from '@/modules/campaigns/prospects';
import { PROSPECT_DS_TONE } from '../../campaigns/campaign-tones';
import { ProspectActions } from '../prospect-actions';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const stamp = (d: Date) => format(d, 'd MMM yyyy · HH:mm');

/**
 * R4 — one prospect: who, which campaign / ad, status, notes, follow-up and
 * full history. Stage 6G workspace treatment (approved mockup 04).
 */
export default async function ProspectPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('recruitment', 'prospects', 'view');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const p = await fetchProspectDetail(id);
  if (!p) notFound();
  const [canEdit, assignees] = await Promise.all([
    checkPermission('recruitment', 'prospects', 'edit'),
    fetchFollowUpAssignees(),
  ]);
  const due = p.followUpDueAt;
  const overdue = Boolean(due && due.getTime() <= Date.now());
  const jobOpen = p.campaignJobId && p.campaignStatus !== 'CANCELLED';
  const tone = PROSPECT_DS_TONE[p.status];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <WorkspaceHeader
          breadcrumbs={[{ label: 'Prospects', href: '/prospects' }, { label: p.personName }]}
          avatar={{ initials: initialsOf(p.personName), tone }}
          title={p.personName}
          status={<DsStatusPill tone={tone}>{PROSPECT_STATUS_LABEL[p.status]}</DsStatusPill>}
          meta={[
            {
              key: 'campaign',
              icon: Sparkles,
              content: (
                <Link
                  href={`/campaigns/${p.campaignId}`}
                  className="underline-offset-2 hover:text-foreground hover:underline"
                >
                  {p.campaignName}
                </Link>
              ),
            },
            {
              key: 'ad',
              icon: Megaphone,
              content: `${p.advertisementCountry}${p.advertisementPlatform ? ` · ${p.advertisementPlatform}` : ''}`,
            },
            {
              key: 'job',
              icon: Briefcase,
              content: p.campaignJobId ? (
                <Link
                  href={`/requisitions/${p.campaignJobId}`}
                  className="underline-offset-2 hover:text-foreground hover:underline"
                >
                  {p.campaignJobTitle}
                </Link>
              ) : null,
            },
            { key: 'email', icon: Mail, content: p.personEmail },
            { key: 'phone', icon: Phone, content: p.personPhone },
          ]}
          chips={[
            { key: 'recorded', icon: CalendarPlus, content: `Recorded ${stamp(p.createdAt)}` },
            {
              key: 'handled',
              icon: UserCheck,
              content: p.screenedByName ? `Last handled by ${p.screenedByName}` : null,
            },
            {
              key: 'followup',
              icon: CalendarClock,
              className: overdue
                ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-500/10 dark:text-amber-200'
                : undefined,
              content: due
                ? `${overdue ? 'Follow-up due' : 'Follow-up'} ${formatZoned(due)}${p.followUpAssigneeName ? ` · ${p.followUpAssigneeName}` : ''}`
                : null,
            },
          ]}
          actions={
            <ProspectActions
              layout="header"
              prospect={{
                id: p.id,
                personId: p.personId,
                personName: p.personName,
                status: p.status,
                hasCandidateProfile: p.hasCandidateProfile,
                followUpDueOn: due ? toZonedLocal(due, 'Europe/Dublin').slice(0, 10) : null,
              }}
              canEdit={canEdit && !p.campaignArchived}
              jobTitle={jobOpen ? p.campaignJobTitle : null}
              assignees={assignees}
            />
          }
        />
        {!canEdit && (
          <p
            className="mt-4 rounded-2xl border border-border/60 bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm"
            data-testid="prospect-read-only"
          >
            View only. Your role cannot change prospects.
          </p>
        )}
      </FadeUp>

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[1fr_1.2fr]">
        <FadeUp delay={0.03}>
          <SectionCard icon={UserRound} title="Details">
            <DetailRows
              rows={[
                ...(p.personEmail || p.personPhone
                  ? [
                      {
                        label: 'Contact',
                        value: [p.personEmail, p.personPhone].filter(Boolean).join(' · '),
                      },
                    ]
                  : []),
                {
                  label: 'Source',
                  value: `${p.advertisementCountry} advertisement${p.advertisementPlatform ? ` on ${p.advertisementPlatform}` : ''}`,
                },
                ...(p.screenedByName
                  ? [{ label: 'Last handled by', value: p.screenedByName }]
                  : []),
                ...(due
                  ? [
                      {
                        label: 'Follow-up',
                        value: (
                          <span
                            className={
                              overdue ? 'font-medium text-amber-700 dark:text-amber-300' : undefined
                            }
                          >
                            {overdue ? 'Due ' : ''}
                            {formatZoned(due)}
                            {p.followUpAssigneeName ? ` · ${p.followUpAssigneeName}` : ''}
                          </span>
                        ),
                      },
                    ]
                  : []),
                {
                  label: 'Candidate profile',
                  value: p.hasCandidateProfile ? (
                    <Link href={`/candidates/${p.personId}`} className="hover:underline">
                      Open candidate
                    </Link>
                  ) : (
                    'Not a candidate yet'
                  ),
                },
                ...(p.otherCampaigns.length > 0
                  ? [
                      {
                        label: 'Also a prospect in',
                        value: (
                          <ul className="space-y-1">
                            {p.otherCampaigns.map((o) => (
                              <li key={o.prospectId} className="flex flex-wrap items-center gap-2">
                                <Link
                                  href={`/prospects/${o.prospectId}`}
                                  className="hover:underline"
                                >
                                  {o.campaignName}
                                </Link>
                                <DsStatusPill tone={PROSPECT_DS_TONE[o.status as ProspectStatus]}>
                                  {PROSPECT_STATUS_LABEL[o.status as ProspectStatus]}
                                </DsStatusPill>
                              </li>
                            ))}
                          </ul>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
            {p.notes && (
              <div className="mt-4 border-t border-border/60 pt-3">
                <p className="text-xs font-medium text-muted-foreground">Notes</p>
                <p
                  className="mt-1 whitespace-pre-wrap text-sm text-foreground/80"
                  data-testid="prospect-notes"
                >
                  {p.notes}
                </p>
              </div>
            )}
          </SectionCard>
        </FadeUp>
        <FadeUp delay={0.05}>
          <SectionCard icon={History} title="History" count={p.history.length}>
            {p.history.length === 0 ? (
              <EmptyState
                icon={History}
                title="No history yet"
                description="Changes will appear here."
              />
            ) : (
              <ActivityTimeline
                testId="prospect-history"
                items={p.history.map((h) => ({
                  id: h.id,
                  title: h.summary,
                  subtitle: h.actorName ?? 'System',
                  at: h.occurredAt,
                }))}
              />
            )}
          </SectionCard>
        </FadeUp>
      </div>
    </div>
  );
}
