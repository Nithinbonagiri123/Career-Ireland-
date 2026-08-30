'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { updateProspectStatusAction } from '@/modules/campaigns/actions';
import type { ProspectListRow } from '@/modules/campaigns/service';

const STATUSES: Array<ProspectListRow['status']> = [
  'NEW',
  'SCREENED',
  'RETAINED_IN_POOL',
  'CONVERTED_TO_CANDIDATE',
  'NOT_SUITABLE',
];

export function ProspectRowActions({ prospect }: { prospect: ProspectListRow }) {
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const setStatus = (next: ProspectListRow['status']) => {
    setBusy(true);
    startTransition(async () => {
      const r = await updateProspectStatusAction({ prospectId: prospect.id, status: next });
      setBusy(false);
      if (r.ok) toast.success(`Prospect marked ${next.toLowerCase().replace(/_/g, ' ')}`);
      else toast.error(r.error.message);
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" disabled={busy}>
            {busy ? '…' : 'Change status'}
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        {STATUSES.filter((s) => s !== prospect.status).map((s) => (
          <DropdownMenuItem key={s} onClick={() => setStatus(s)}>
            {s.replace(/_/g, ' ')}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
