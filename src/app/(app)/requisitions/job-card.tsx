import { format, formatDistanceToNowStrict } from 'date-fns';
import {
  ArrowRight,
  Briefcase,
  Calendar,
  Coins,
  MapPin,
  SearchCheck,
  User2,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { CARD_ACTION, CARD_ACTION_TINT, EntityCard } from '@/components/ds/entity-card';
import { DsStatusPill } from '@/components/ds/status-pill';
import type { DsTone } from '@/components/ds/tones';
import { formatCurrency } from '@/lib/currency';
import type { RequisitionCardRow } from '@/modules/requisitions/service';

/** Job status → Stage 6G pill tone + label. */
export const JOB_STATUS: Record<RequisitionCardRow['status'], { tone: DsTone; label: string }> = {
  DRAFT: { tone: 'slate', label: 'Draft' },
  OPEN: { tone: 'blue', label: 'Open' },
  IN_PROGRESS: { tone: 'violet', label: 'In progress' },
  PARTIALLY_FILLED: { tone: 'amber', label: 'Partially filled' },
  FILLED: { tone: 'green', label: 'Filled' },
  CLOSED: { tone: 'slate', label: 'Closed' },
  CANCELLED: { tone: 'rose', label: 'Cancelled' },
};

export const EMPLOYMENT_LABEL: Record<RequisitionCardRow['employmentType'], string> = {
  FULL_TIME: 'Full time',
  PART_TIME: 'Part time',
  CONTRACT: 'Contract',
  TEMP: 'Temporary',
};

function salary(r: RequisitionCardRow): string | null {
  const c = r.salaryCurrencyCode;
  if (!c) return null;
  const o = { maximumFractionDigits: 0 } as const;
  if (r.salaryMin && r.salaryMax)
    return `${formatCurrency(r.salaryMin, c, o)} – ${formatCurrency(r.salaryMax, c, o)} / month`;
  if (r.salaryMin) return `From ${formatCurrency(r.salaryMin, c, o)} / month`;
  if (r.salaryMax) return `Up to ${formatCurrency(r.salaryMax, c, o)} / month`;
  return null;
}

/** Stage 6G job card (mockup 03 card language applied to a job). */
export function JobCard({ job }: { job: RequisitionCardRow }) {
  const status = JOB_STATUS[job.status];
  const created = new Date(job.createdAt);
  const pay = salary(job);
  const remaining = Math.max(0, job.positionsRequired - job.positionsFilled);
  return (
    <EntityCard
      testId="job-card"
      avatar={{ icon: Briefcase, tone: status.tone }}
      status={<DsStatusPill tone={status.tone}>{status.label}</DsStatusPill>}
      timestamp={
        <time dateTime={created.toISOString()} title={format(created, 'd MMM yyyy · HH:mm')}>
          {formatDistanceToNowStrict(created, { addSuffix: true })}
        </time>
      }
      title={job.title}
      titleHref={`/requisitions/${job.id}`}
      subtitle={job.employerName}
      meta={[
        {
          key: 'location',
          icon: MapPin,
          content: job.location,
        },
        {
          key: 'seats',
          icon: Users,
          content: (
            <>
              {job.positionsFilled} of {job.positionsRequired} placed
              {remaining > 0 && (
                <span className="text-muted-foreground"> · {remaining} to fill</span>
              )}
            </>
          ),
        },
        {
          key: 'type',
          icon: Calendar,
          content: (
            <>
              {EMPLOYMENT_LABEL[job.employmentType]}
              {job.targetFillDate && (
                <span className="text-muted-foreground">
                  {' '}
                  · fill by {format(new Date(job.targetFillDate), 'd MMM yyyy')}
                </span>
              )}
            </>
          ),
        },
        {
          key: 'pay',
          icon: Coins,
          content: pay,
        },
        {
          key: 'owner',
          icon: User2,
          content: job.ownerName ?? <span className="text-muted-foreground">Unassigned</span>,
        },
      ]}
      stats={[
        { value: job.matchedCount, label: 'Matched' },
        { value: job.shortlistedCount, label: 'Shortlisted' },
        { value: job.appliedCount, label: 'Applied' },
      ]}
      actions={
        <>
          <Link href={`/requisitions/${job.id}`} className={CARD_ACTION}>
            Manage
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
          <Link href={`/matching?job=${job.id}`} className={CARD_ACTION_TINT}>
            <SearchCheck className="size-3.5" aria-hidden /> Find candidates
          </Link>
        </>
      }
    />
  );
}
