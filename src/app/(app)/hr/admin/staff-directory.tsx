'use client';

import { format } from 'date-fns';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { FOCUS_RING } from '@/components/ds/segmented';
import { DsEnumPill } from '@/components/ds/status-pill';
import { DS_ROW, DS_ROW_LIST } from '@/components/ds/workspace';
import { Button } from '@/components/ui/button';
import type { StaffDirectoryRow } from '@/modules/hr/service';
import { type ManagerOption, StaffProfileDialog } from './staff-profile-dialog';

/**
 * Client-side directory + edit control. Server passes in the rows and
 * the pool of possible managers; this component owns the edit target
 * and mounts the dialog.
 */
export function StaffDirectory({
  rows,
  managers,
}: {
  rows: StaffDirectoryRow[];
  managers: ManagerOption[];
}) {
  const [target, setTarget] = useState<StaffDirectoryRow | null>(null);

  if (rows.length === 0) return null;

  return (
    <>
      <ul aria-label="Staff directory" className={DS_ROW_LIST}>
        {rows.map((s) => (
          <li key={s.profile.id} className={DS_ROW}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{s.userName}</p>
              <p className="text-[11px] text-muted-foreground [overflow-wrap:anywhere]">
                {s.userEmail}
                {s.profile.department ? ` · ${s.profile.department}` : ''}
                {s.profile.position ? ` · ${s.profile.position}` : ''}
                {s.managerName ? ` · reports to ${s.managerName}` : ''}
                {s.profile.joiningDate ? ` · joined ${formatJoining(s.profile.joiningDate)}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <DsEnumPill status={s.profile.status} />
              <Button
                variant="ghost"
                size="icon-sm"
                className={FOCUS_RING}
                aria-label={`Edit HR profile for ${s.userName}`}
                onClick={() =>
                  setTarget({
                    profile: s.profile,
                    userName: s.userName,
                    userEmail: s.userEmail,
                    managerName: s.managerName,
                  })
                }
              >
                <Pencil className="size-3.5" aria-hidden />
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <StaffProfileDialog
        target={target}
        managers={managers}
        onOpenChange={(next) => {
          if (!next) setTarget(null);
        }}
      />
    </>
  );
}

/** Joining date is a calendar date (YYYY-MM-DD) — shown as "3 Mar 2025". */
function formatJoining(isoDay: string): string {
  const [y, m, d] = isoDay.split('-').map(Number);
  if (!y || !m || !d) return isoDay;
  return format(new Date(y, m - 1, d), 'd MMM yyyy');
}
