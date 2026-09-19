'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { FormErrorAlert } from '@/components/form-error-alert';
import { FormField } from '@/components/form-field';
import { SubmitButton } from '@/components/submit-button';
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
import { Select } from '@/components/ui/select';
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
            <FormField id="sp-department" label="Department">
              <Input
                id="sp-department"
                value={department}
                onChange={(e) => setDepartment(e.currentTarget.value)}
                maxLength={120}
                placeholder="e.g. Candidate Services"
              />
            </FormField>
            <FormField id="sp-position" label="Position">
              <Input
                id="sp-position"
                value={position}
                onChange={(e) => setPosition(e.currentTarget.value)}
                maxLength={120}
                placeholder="e.g. Senior Recruiter"
              />
            </FormField>
            <FormField id="sp-joining" label="Joining date">
              <Input
                id="sp-joining"
                type="date"
                value={joiningDate}
                onChange={(e) => setJoiningDate(e.currentTarget.value)}
              />
            </FormField>
            <FormField id="sp-status" label="Status">
              <Select
                id="sp-status"
                value={status}
                onChange={(e) => setStatus(e.currentTarget.value as typeof status)}
              >
                <option value="ACTIVE">Active</option>
                <option value="ON_LEAVE">On leave</option>
                <option value="TERMINATED">Terminated</option>
              </Select>
            </FormField>
          </div>
          <FormField
            id="sp-manager"
            label="Reporting manager"
            hint="Feeds /hr/team — direct reports show up under their manager."
          >
            <Select
              id="sp-manager"
              value={managerUserId}
              onChange={(e) => setManagerUserId(e.currentTarget.value)}
            >
              <option value="">— none —</option>
              {availableManagers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName} ({m.email})
                </option>
              ))}
            </Select>
          </FormField>
          <FormErrorAlert error={error} />
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
          <SubmitButton type="button" onClick={submit} loading={pending}>
            Save changes
          </SubmitButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
