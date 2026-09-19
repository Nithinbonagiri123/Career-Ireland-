'use client';

import { formatDistanceToNow } from 'date-fns';
import { ArrowRight, ClipboardCheck, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/empty-state';
import { Timestamp } from '@/components/timestamp';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { upsertChecklistAction } from '@/modules/work-permit-checklists/actions';
import type { WorkPermitChecklistRow } from '@/modules/work-permit-checklists/service';

/**
 * Work Permit Checklist tab body. Lists every existing checklist for
 * this requisition; the "New checklist" button opens a candidate picker
 * (drawn from applications + shortlisted candidates so staff never
 * types a UUID). Selecting one creates the empty row and forwards to
 * the full form.
 */
export function ChecklistsSection({
  requisitionId,
  existing,
  candidatePool,
}: {
  requisitionId: string;
  existing: WorkPermitChecklistRow[];
  /** Candidates already engaged with this requisition (shortlist + apps). */
  candidatePool: Array<{ personId: string; personName: string }>;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pickedPersonId, setPickedPersonId] = useState<string>('');
  const [pending, startTransition] = useTransition();

  const existingPersonIds = new Set(existing.map((r) => r.personId));
  const availableCandidates = candidatePool.filter(
    (c) => !existingPersonIds.has(c.personId),
  );

  const create = () => {
    if (!pickedPersonId) return;
    startTransition(async () => {
      const r = await upsertChecklistAction({
        jobRequisitionId: requisitionId,
        personId: pickedPersonId,
        contractSignedOn: '',
        commencementDate: '',
        matchChecks: {},
        advertInfoChecks: {},
        documentsChecks: {},
        notes: '',
      });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      setDialogOpen(false);
      router.push(`/requisitions/${requisitionId}/checklists/${pickedPersonId}`);
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Work permit checklists</p>
          <p className="text-xs text-muted-foreground">
            One per candidate — verifies the advert matches the contract they're being offered
            and tracks the documents you've collected.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setDialogOpen(true)}
          disabled={availableCandidates.length === 0}
          title={
            availableCandidates.length === 0
              ? 'Add applicants or shortlist candidates first — every one already has a checklist.'
              : undefined
          }
        >
          <Plus className="mr-1.5 size-4" /> New checklist
        </Button>
      </div>

      {existing.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No checklists yet"
          description="Create one per candidate the moment a job offer is being finalised. Prints to A4 for the file."
        />
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {existing.map((row) => (
            <li key={row.id} className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0 space-y-0.5">
                <p className="truncate text-sm font-medium">{row.personName}</p>
                <div className="text-[11px] text-muted-foreground">
                  Updated {formatDistanceToNow(row.updatedAt, { addSuffix: true })}
                  <span className="mx-1.5 text-muted-foreground/60">·</span>
                  <Timestamp date={row.updatedAt} absoluteOnly className="inline text-[11px]" />
                </div>
              </div>
              <Link
                href={`/requisitions/${requisitionId}/checklists/${row.personId}`}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Open
                <ArrowRight className="ml-1 size-3.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New checklist</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cand">Candidate</Label>
            <Select
              id="cand"
              value={pickedPersonId}
              onChange={(e) => setPickedPersonId(e.target.value)}
            >
              <option value="">Select…</option>
              {availableCandidates.map((c) => (
                <option key={c.personId} value={c.personId}>
                  {c.personName}
                </option>
              ))}
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Only candidates already on the shortlist or with an application appear here.
            </p>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={create} disabled={!pickedPersonId || pending}>
              Create checklist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
