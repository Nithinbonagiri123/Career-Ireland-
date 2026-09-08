'use client';

import { CheckCircle2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  convertProspectToCandidateAction,
  updateProspectStatusAction,
} from '@/modules/campaigns/actions';
import type { ProspectListRow } from '@/modules/campaigns/service';

const CHANGEABLE_STATUSES: Array<ProspectListRow['status']> = [
  'NEW',
  'SCREENED',
  'RETAINED_IN_POOL',
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

  const convert = () => {
    setBusy(true);
    startTransition(async () => {
      const r = await convertProspectToCandidateAction({ prospectId: prospect.id });
      setBusy(false);
      if (r.ok) {
        toast.success(
          r.data.created
            ? `${prospect.personName} converted to candidate`
            : `${prospect.personName} linked to existing candidate profile`,
        );
      } else {
        toast.error(r.error.message);
      }
    });
  };

  const alreadyConverted = prospect.status === 'CONVERTED_TO_CANDIDATE';

  return (
    <div className="flex items-center gap-1.5">
      {!alreadyConverted && (
        <Button variant="outline" size="sm" onClick={convert} disabled={busy} className="h-8">
          <CheckCircle2 className="mr-1.5 size-3.5" />
          Convert
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="sm" disabled={busy}>
              {busy ? '…' : 'Change status'}
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          {CHANGEABLE_STATUSES.filter((s) => s !== prospect.status).map((s) => (
            <DropdownMenuItem key={s} onClick={() => setStatus(s)}>
              Mark {s.toLowerCase().replace(/_/g, ' ')}
            </DropdownMenuItem>
          ))}
          {!alreadyConverted && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setStatus('CONVERTED_TO_CANDIDATE')}>
                Mark converted (no profile)
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
