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
import type { StaffProfile } from '@/lib/db/schema/hr';
import { upsertStaffProfileAction } from '@/modules/hr/actions';

/**
 * Edit an existing staff HR profile — department, position, joining
 * date, reporting manager, employment status. Manager options are
 * every ADMIN/STAFF/etc. user, minus the profile's own user (a person
 * cannot report to themselves).
 */
export type ManagerOption = { id: string; fullName: string; email: string };

type Target = {
  profile: StaffProfile;
  userName: string;
  userEmail: string;
};

export function StaffProfileDialog({
  target,
  managers,
  onOpenChange,
}: {
  target: Target | null;
  managers: ManagerOption[];
  onOpenChange: (next: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [department, setDepartment] = useState('');
  const [position, setPosition] = useState('');
  const [joiningDate, setJoiningDate] = useState('');
  const [managerUserId, setManagerUserId] = useState<string>('');
  const [status, setStatus] = useState<'ACTIVE' | 'ON_LEAVE' | 'TERMINATED'>('ACTIVE');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target) {
      setDepartment(target.profile.department ?? '');
      setPosition(target.profile.position ?? '');
      setJoiningDate(target.profile.joiningDate ?? '');
      setManagerUserId(target.profile.managerUserId ?? '');
      setStatus(target.profile.status);
      setError(null);
    }
  }, [target]);

  const submit = () => {
    if (!target) return;
    setError(null);
    startTransition(async () => {
      const r = await upsertStaffProfileAction({
        userId: target.profile.userId,
        department: department.trim() || undefined,
        position: position.trim() || undefined,
        joiningDate: joiningDate || undefined,
        managerUserId: managerUserId || null,
        status,
      });
      if (r.ok) {
        toast.success('Staff profile updated');
        onOpenChange(false);
      } else {
        setError(r.error.message);
        toast.error(r.error.message);
      }
    });
  };

  const availableManagers = target
    ? managers.filter((m) => m.id !== target.profile.userId)
    : managers;

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Edit HR profile
            {target && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {target.userName} · {target.userEmail}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sp-department">Department</Label>
              <Input
                id="sp-department"
                value={department}
                onChange={(e) => setDepartment(e.currentTarget.value)}
                maxLength={120}
                placeholder="e.g. Candidate Services"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sp-position">Position</Label>
              <Input
                id="sp-position"
                value={position}
                onChange={(e) => setPosition(e.currentTarget.value)}
                maxLength={120}
                placeholder="e.g. Senior Recruiter"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sp-joining">Joining date</Label>
              <Input
                id="sp-joining"
                type="date"
                value={joiningDate}
                onChange={(e) => setJoiningDate(e.currentTarget.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sp-status">Status</Label>
              <select
                id="sp-status"
                value={status}
                onChange={(e) => setStatus(e.currentTarget.value as typeof status)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                <option value="ACTIVE">Active</option>
                <option value="ON_LEAVE">On leave</option>
                <option value="TERMINATED">Terminated</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sp-manager">Reporting manager</Label>
            <select
              id="sp-manager"
              value={managerUserId}
              onChange={(e) => setManagerUserId(e.currentTarget.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              <option value="">— none —</option>
              {availableManagers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName} ({m.email})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              Feeds /hr/team — direct reports show up under their manager.
            </p>
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
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
