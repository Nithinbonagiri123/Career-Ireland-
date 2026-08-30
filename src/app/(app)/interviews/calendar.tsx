'use client';

import {
  addDays,
  differenceInMinutes,
  endOfDay,
  format,
  isSameDay,
  isToday,
  isTomorrow,
  startOfDay,
  startOfWeek,
} from 'date-fns';
import { CalendarClock, ExternalLink, MapPin, Users, Video } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Interview } from '@/lib/db/schema/interviews_offers';
import type { UpcomingInterview } from '@/modules/interviews/service';

const MODE_ICON: Record<Interview['mode'], typeof CalendarClock> = {
  PHONE: CalendarClock,
  VIDEO: Video,
  IN_PERSON: MapPin,
  PANEL: Users,
};

const MODE_LABEL: Record<Interview['mode'], string> = {
  PHONE: 'Phone',
  VIDEO: 'Video',
  IN_PERSON: 'In person',
  PANEL: 'Panel',
};

const STATUS_VARIANT: Record<Interview['status'], 'default' | 'secondary' | 'outline'> = {
  SCHEDULED: 'default',
  COMPLETED: 'secondary',
  NO_SHOW: 'outline',
  RESCHEDULED: 'secondary',
  CANCELLED: 'outline',
};

type Bucket = {
  key: string;
  label: string;
  items: UpcomingInterview[];
};

function bucketize(rows: UpcomingInterview[]): Bucket[] {
  const now = new Date();
  const yesterday = startOfDay(addDays(now, -1));
  const today = startOfDay(now);
  const tomorrow = startOfDay(addDays(now, 1));
  const endOfThisWeek = endOfDay(addDays(startOfWeek(now, { weekStartsOn: 1 }), 6));
  const endOfNextWeek = endOfDay(addDays(endOfThisWeek, 7));

  const buckets: Record<string, Bucket> = {
    past: { key: 'past', label: 'Past', items: [] },
    today: { key: 'today', label: 'Today', items: [] },
    tomorrow: { key: 'tomorrow', label: 'Tomorrow', items: [] },
    thisWeek: { key: 'thisWeek', label: 'Later this week', items: [] },
    nextWeek: { key: 'nextWeek', label: 'Next week', items: [] },
    later: { key: 'later', label: 'Later', items: [] },
  };

  for (const iv of rows) {
    const at = new Date(iv.scheduledAt);
    if (at < today && at >= yesterday) buckets.past?.items.push(iv);
    else if (isToday(at)) buckets.today?.items.push(iv);
    else if (isTomorrow(at)) buckets.tomorrow?.items.push(iv);
    else if (at > tomorrow && at <= endOfThisWeek) buckets.thisWeek?.items.push(iv);
    else if (at > endOfThisWeek && at <= endOfNextWeek) buckets.nextWeek?.items.push(iv);
    else if (at > endOfNextWeek) buckets.later?.items.push(iv);
    else buckets.past?.items.push(iv);
  }

  return Object.values(buckets).filter((b) => b.items.length > 0);
}

function timeUntil(at: Date): string {
  const now = new Date();
  const mins = differenceInMinutes(at, now);
  if (mins < 0) {
    const past = Math.abs(mins);
    if (past < 60) return `${past}m ago`;
    if (past < 60 * 24) return `${Math.round(past / 60)}h ago`;
    return `${Math.round(past / (60 * 24))}d ago`;
  }
  if (mins < 60) return `in ${mins}m`;
  if (mins < 60 * 24) return `in ${Math.round(mins / 60)}h`;
  return `in ${Math.round(mins / (60 * 24))}d`;
}

function InterviewRow({ iv }: { iv: UpcomingInterview }) {
  const at = new Date(iv.scheduledAt);
  const Icon = MODE_ICON[iv.mode];
  const isPast = at < new Date();

  return (
    <li>
      <Link
        href={`/applications/${iv.jobApplicationId}`}
        className="group flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-accent/40"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{format(at, 'HH:mm')}</span>
            <span className="font-medium">{iv.candidateName}</span>
            <span className="text-muted-foreground">·</span>
            <span className="min-w-0 truncate text-muted-foreground">
              {iv.jobLabel}
              {iv.employerLabel && iv.employerLabel !== iv.jobLabel ? ` @ ${iv.employerLabel}` : ''}
            </span>
            {iv.isExternal && (
              <Badge variant="outline" className="rounded-full text-[9px]">
                External
              </Badge>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Icon className="size-3" />
              {MODE_LABEL[iv.mode]}
              {iv.durationMinutes ? ` · ${iv.durationMinutes}m` : ''}
              {iv.round > 1 ? ` · Round ${iv.round}` : ''}
            </span>
            {iv.location && (
              <>
                <span aria-hidden>·</span>
                <span className="min-w-0 max-w-xs truncate" title={iv.location}>
                  {iv.location}
                </span>
              </>
            )}
            {iv.interviewerNames && (
              <>
                <span aria-hidden>·</span>
                <span>{iv.interviewerNames}</span>
              </>
            )}
            <span aria-hidden>·</span>
            <span className={isPast ? 'text-muted-foreground' : 'font-medium'}>
              {timeUntil(at)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant={STATUS_VARIANT[iv.status]} className="rounded-full text-[10px]">
            {iv.status.replace(/_/g, ' ')}
          </Badge>
          {iv.status !== 'SCHEDULED' && iv.outcome !== 'PENDING' && (
            <Badge variant="outline" className="rounded-full text-[10px]">
              {iv.outcome}
            </Badge>
          )}
          <ExternalLink className="size-3 opacity-0 transition-opacity group-hover:opacity-60" />
        </div>
      </Link>
    </li>
  );
}

export function InterviewsCalendar({ interviews }: { interviews: UpcomingInterview[] }) {
  if (interviews.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <EmptyState
            icon={CalendarClock}
            title="No interviews scheduled"
            description="Schedule an interview from any application detail page to see it here."
          />
        </CardContent>
      </Card>
    );
  }

  const buckets = bucketize(interviews);

  return (
    <div className="space-y-6">
      {buckets.map((b) => (
        <Card key={b.key}>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">
              {b.label}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {b.items.length}
              </span>
            </CardTitle>
            {b.items[0] && !isSameDay(new Date(b.items[0].scheduledAt), new Date()) && (
              <span className="text-xs text-muted-foreground">
                {format(new Date(b.items[0].scheduledAt), 'EEE d MMM')}
                {b.items.length > 1 &&
                  !isSameDay(
                    new Date(b.items[0].scheduledAt),
                    new Date(b.items[b.items.length - 1]?.scheduledAt ?? b.items[0].scheduledAt),
                  ) &&
                  ` – ${format(new Date(b.items[b.items.length - 1]?.scheduledAt ?? b.items[0].scheduledAt), 'EEE d MMM')}`}
              </span>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {b.items.map((iv) => (
                <InterviewRow key={iv.id} iv={iv} />
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
