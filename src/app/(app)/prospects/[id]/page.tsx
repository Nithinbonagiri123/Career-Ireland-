import { Briefcase, CalendarClock, History, Megaphone, Sparkles, User } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { StatusChip } from '@/components/status-chip';
import { Timestamp } from '@/components/timestamp';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { checkPermission, requirePermission } from '@/lib/auth/session';
import { formatZoned, toZonedLocal } from '@/lib/zoned-time';
import { PROSPECT_STATUS_LABEL, PROSPECT_TONE } from '@/modules/campaigns/labels';
import { fetchFollowUpAssignees, fetchProspectDetail } from '@/modules/campaigns/prospects';
import { ProspectActions } from '../prospect-actions';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** R4 — one prospect: who, which campaign / ad, status, notes, follow-up and full history. */
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

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <nav className="mb-4 flex flex-wrap items-center text-sm text-muted-foreground">
          <Link href="/prospects" className="hover:text-foreground hover:underline">
            Prospects
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-foreground">{p.personName}</span>
        </nav>
        <div className="flex items-start gap-4">
          <span
            aria-hidden
            className="grid size-14 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-700 ring-1 ring-amber-200/70"
          >
            <User className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h1 className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]">
                {p.personName}
              </h1>
              <StatusChip
                label={PROSPECT_STATUS_LABEL[p.status]}
                tone={PROSPECT_TONE[p.status]}
                className="text-xs"
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
              <Link
                href={`/campaigns/${p.campaignId}`}
                className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
              >
                <Sparkles className="size-3" aria-hidden /> {p.campaignName}
              </Link>
              <span className="inline-flex items-center gap-1">
                <Megaphone className="size-3" aria-hidden /> {p.advertisementCountry}
                {p.advertisementPlatform ? ` · ${p.advertisementPlatform}` : ''}
              </span>
              {p.campaignJobId && (
                <Link
                  href={`/requisitions/${p.campaignJobId}`}
                  className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
                >
                  <Briefcase className="size-3" aria-hidden /> {p.campaignJobTitle}
                </Link>
              )}
              <span>
                Recorded <Timestamp date={p.createdAt} absoluteOnly className="text-xs" />
              </span>
            </div>
          </div>
        </div>
        <div className="mt-5">
          <ProspectActions
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
          {!canEdit && (
            <p className="mt-2 text-xs text-muted-foreground" data-testid="prospect-read-only">
              View only — your role cannot change prospects.
            </p>
          )}
        </div>
      </FadeUp>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <FadeUp delay={0.03}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Contact</dt>
                  <dd>
                    {p.personEmail ?? 'No email'}
                    {p.personPhone ? ` · ${p.personPhone}` : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Source</dt>
                  <dd>
                    {p.advertisementCountry} advertisement
                    {p.advertisementPlatform ? ` on ${p.advertisementPlatform}` : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Last handled by</dt>
                  <dd>{p.screenedByName ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Follow-up</dt>
                  <dd className={overdue ? 'font-medium text-status-warning' : undefined}>
                    {due ? (
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="size-3.5" aria-hidden />
                        {overdue ? 'Due ' : ''}
                        {formatZoned(due)}
                        {p.followUpAssigneeName ? ` · ${p.followUpAssigneeName}` : ''}
                      </span>
                    ) : (
                      'None'
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Candidate profile</dt>
                  <dd>
                    {p.hasCandidateProfile ? (
                      <Link href={`/candidates/${p.personId}`} className="hover:underline">
                        Open candidate
                      </Link>
                    ) : (
                      'Not a candidate yet'
                    )}
                  </dd>
                </div>
                {p.otherCampaigns.length > 0 && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Also a prospect in</dt>
                    <dd>
                      <ul className="space-y-0.5">
                        {p.otherCampaigns.map((o) => (
                          <li key={o.prospectId}>
                            <Link href={`/prospects/${o.prospectId}`} className="hover:underline">
                              {o.campaignName}
                            </Link>{' '}
                            <span className="text-xs text-muted-foreground">
                              (
                              {PROSPECT_STATUS_LABEL[
                                o.status as keyof typeof PROSPECT_STATUS_LABEL
                              ].toLowerCase()}
                              )
                            </span>
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs text-muted-foreground">Notes</dt>
                  <dd className="whitespace-pre-wrap text-xs" data-testid="prospect-notes">
                    {p.notes ?? '—'}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </FadeUp>
        <FadeUp delay={0.05}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="size-4 text-muted-foreground" aria-hidden /> History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {p.history.length === 0 ? (
                <EmptyState
                  icon={History}
                  title="No history yet"
                  description="Changes will appear here."
                />
              ) : (
                <ol className="divide-y rounded-md border" data-testid="prospect-history">
                  {p.history.map((h) => (
                    <li
                      key={h.id}
                      className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm [overflow-wrap:anywhere]">{h.summary}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {h.actorName ?? 'System'}
                        </p>
                      </div>
                      <Timestamp date={h.occurredAt} absoluteOnly className="text-[11px]" />
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </FadeUp>
      </div>
    </div>
  );
}
