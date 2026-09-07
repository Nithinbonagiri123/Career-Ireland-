'use client';

import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { statusTone } from '@/lib/ui/status-tone';
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
      <ul className="divide-y rounded-md border">
        {rows.map((s) => (
          <li key={s.profile.id} className="flex items-center justify-between px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium">{s.userName}</p>
              <p className="text-[11px] text-muted-foreground">
                {s.userEmail}
                {s.profile.department ? ` · ${s.profile.department}` : ''}
                {s.profile.position ? ` · ${s.profile.position}` : ''}
                {s.managerName ? ` · reports to ${s.managerName}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={statusTone(s.profile.status)} className="rounded-full">
                {s.profile.status.replace(/_/g, ' ')}
              </Badge>
              <Button
                variant="ghost"
                size="icon-sm"
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
                <Pencil className="size-3.5" />
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
