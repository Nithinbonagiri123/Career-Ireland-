'use client';

import { AlertCircle, Loader2 } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AttendanceSession } from '@/lib/db/schema/hr';
import { correctAttendanceAction } from '@/modules/hr/actions';

/**
 * Admin correction dialog. Controlled — parent owns the target so
 * the same instance backs every row's Correct button. Reason is
 * required and audited server-side.
 */
export function CorrectionDialog({
  target,
  onOpenChange,
}: {
  target: AttendanceSession | null;
  onOpenChange: (next: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [clockInAt, setClockInAt] = useState('');
  const [clockOutAt, setClockOutAt] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target) {
      setClockInAt(toLocalDatetime(target.clockInAt));
      setClockOutAt(target.clockOutAt ? toLocalDatetime(target.clockOutAt) : '');
      setReason('');
      setError(null);
    }
  }, [target]);

  const submit = () => {
    if (!target) return;
    setError(null);
    if (reason.trim().length < 3) {
      setError('A reason of at least 3 characters is required.');
      return;
    }
    startTransition(async () => {
      const r = await correctAttendanceAction({
        sessionId: target.id,
        clockInAt: new Date(clockInAt).toISOString(),
        clockOutAt: clockOutAt ? new Date(clockOutAt).toISOString() : null,
        reason: reason.trim(),
      });
      if (r.ok) {
        toast.success('Attendance corrected');
        onOpenChange(false);
      } else {
        setError(r.error.message);
        toast.error(r.error.message);
      }
    });
  };

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Correct attendance</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <p className="text-xs text-muted-foreground">
            Adjust the clock-in or clock-out timestamp. Every correction is written to the audit log
            with your reason so the trail stays intact.
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="clock-in">Clock-in at</Label>
              <Input
                id="clock-in"
                type="datetime-local"
                value={clockInAt}
                onChange={(e) => setClockInAt(e.currentTarget.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clock-out">Clock-out at</Label>
              <Input
                id="clock-out"
                type="datetime-local"
                value={clockOutAt}
                onChange={(e) => setClockOutAt(e.currentTarget.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Leave blank to keep the session open.
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason (audited)</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.currentTarget.value)}
              maxLength={500}
              placeholder="e.g. Staff forgot to clock out; verified with manager."
            />
          </div>
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Save correction
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Convert a JS Date to a value the `datetime-local` input can display. */
function toLocalDatetime(d: Date): string {
  const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString();
  return iso.slice(0, 16);
}
