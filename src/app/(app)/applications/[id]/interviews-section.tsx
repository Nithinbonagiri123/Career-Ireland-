'use client';

import { format, formatDistanceToNow } from 'date-fns';
import { CalendarClock, MapPin, Plus, Trash2, Users, Video } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Interview } from '@/lib/db/schema/interviews_offers';
import {
  removeInterviewAction,
  scheduleInterviewAction,
  updateInterviewAction,
} from '@/modules/interviews/actions';

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

const OUTCOME_VARIANT: Record<Interview['outcome'], 'default' | 'secondary' | 'outline'> = {
  PENDING: 'outline',
  PASS: 'default',
  FAIL: 'outline',
  HOLD: 'secondary',
};

/** Format a Date to the local `YYYY-MM-DDTHH:mm` value that `<input type="datetime-local">` expects. */
function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ScheduleDialog({ applicationId }: { applicationId: string }) {
  const [open, setOpen] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(() => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    t.setHours(10, 0, 0, 0);
    return toDatetimeLocal(t);
  });
  const [durationMinutes, setDurationMinutes] = useState('45');
  const [mode, setMode] = useState<Interview['mode']>('VIDEO');
  const [round, setRound] = useState('1');
  const [location, setLocation] = useState('');
  const [interviewerNames, setInterviewerNames] = useState('');
  const [notes, setNotes] = useState('');
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      const r = await scheduleInterviewAction({
        jobApplicationId: applicationId,
        scheduledAt: new Date(scheduledAt).toISOString(),
        durationMinutes: durationMinutes.trim().length ? Number(durationMinutes) : null,
        mode,
        round: Number(round) || 1,
        location,
        interviewerNames,
        notes,
      });
      if (r.ok) {
        toast.success('Interview scheduled');
        setOpen(false);
      } else {
        toast.error(r.error.message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus className="mr-1 size-3.5" /> Schedule interview
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule interview</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="when">Date & time *</Label>
              <Input
                id="when"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="duration">Duration (min)</Label>
              <Input
                id="duration"
                type="number"
                min={5}
                max={600}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="mode">Mode</Label>
              <select
                id="mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as Interview['mode'])}
                className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm"
              >
                <option value="VIDEO">Video</option>
                <option value="PHONE">Phone</option>
                <option value="IN_PERSON">In person</option>
                <option value="PANEL">Panel</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="round">Round</Label>
              <Input
                id="round"
                type="number"
                min={1}
                max={20}
                value={round}
                onChange={(e) => setRound(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="location">
              {mode === 'IN_PERSON' ? 'Address' : 'Meeting link / dial-in'}
            </Label>
            <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ivs">Interviewers</Label>
            <Input
              id="ivs"
              value={interviewerNames}
              onChange={(e) => setInterviewerNames(e.target.value)}
              placeholder="e.g. Aoife Kelly, John Ryan"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="inotes">Notes / prep</Label>
            <Input id="inotes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !scheduledAt}>
            Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InterviewRow({
  interview,
  applicationId,
}: {
  interview: Interview;
  applicationId: string;
}) {
  const [, startTransition] = useTransition();

  const update = (status: Interview['status'], outcome: Interview['outcome']) => {
    startTransition(async () => {
      const r = await updateInterviewAction(
        { id: interview.id, status, outcome, notes: interview.notes ?? '' },
        applicationId,
      );
      if (r.ok) toast.success('Interview updated');
      else toast.error(r.error.message);
    });
  };

  const remove = () => {
    if (!confirm('Remove this interview?')) return;
    startTransition(async () => {
      const r = await removeInterviewAction({ id: interview.id }, applicationId);
      if (r.ok) toast.success('Interview removed');
      else toast.error(r.error.message);
    });
  };

  const isTerminal =
    interview.status === 'COMPLETED' ||
    interview.status === 'CANCELLED' ||
    interview.status === 'NO_SHOW';

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">
            Round {interview.round} · {MODE_LABEL[interview.mode]}
          </span>
          <Badge variant={STATUS_VARIANT[interview.status]} className="rounded-full text-[10px]">
            {interview.status.replace(/_/g, ' ')}
          </Badge>
          {interview.status !== 'SCHEDULED' && (
            <Badge
              variant={OUTCOME_VARIANT[interview.outcome]}
              className="rounded-full text-[10px]"
            >
              {interview.outcome}
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          <CalendarClock className="mr-1 inline size-3" />
          {format(interview.scheduledAt, 'PPpp')} ·{' '}
          {formatDistanceToNow(interview.scheduledAt, { addSuffix: true })}
          {interview.durationMinutes ? ` · ${interview.durationMinutes} min` : ''}
        </p>
        {interview.location && (
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {interview.mode === 'IN_PERSON' ? (
              <MapPin className="mr-1 inline size-3" />
            ) : (
              <Video className="mr-1 inline size-3" />
            )}
            {interview.location}
          </p>
        )}
        {interview.interviewerNames && (
          <p className="mt-1 text-xs text-muted-foreground">
            <Users className="mr-1 inline size-3" />
            {interview.interviewerNames}
          </p>
        )}
        {interview.notes && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{interview.notes}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {!isTerminal && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => update('COMPLETED', 'PASS')}
              disabled={interview.status === 'RESCHEDULED'}
            >
              Passed
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => update('COMPLETED', 'FAIL')}
              disabled={interview.status === 'RESCHEDULED'}
            >
              Failed
            </Button>
            <Button size="sm" variant="ghost" onClick={() => update('NO_SHOW', 'PENDING')}>
              No-show
            </Button>
            <Button size="sm" variant="ghost" onClick={() => update('CANCELLED', 'PENDING')}>
              Cancel
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" onClick={remove} aria-label="Remove interview">
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </li>
  );
}

export function InterviewsSection({
  applicationId,
  rows,
}: {
  applicationId: string;
  rows: Interview[];
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="size-4" /> Interviews
            <Badge variant="secondary" className="ml-1 rounded-full">
              {rows.length}
            </Badge>
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Every round scheduled or completed for this application.
          </p>
        </div>
        <ScheduleDialog applicationId={applicationId} />
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No interviews yet"
            description="Schedule the first round when the employer asks to interview."
          />
        ) : (
          <ul className="divide-y">
            {rows.map((iv) => (
              <InterviewRow key={iv.id} interview={iv} applicationId={applicationId} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
