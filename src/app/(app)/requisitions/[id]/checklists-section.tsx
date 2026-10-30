'use client';

import { formatDistanceToNow } from 'date-fns';
import { ArrowRight, ClipboardCheck, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { initialsOf } from '@/components/ds/entity-card';
import { DS_SOFT } from '@/components/ds/tones';
import { DS_ROW, DS_ROW_LIST, SectionCard } from '@/components/ds/workspace';
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
import { cn } from '@/lib/utils';
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
  canEdit = true,
}: {
  requisitionId: string;
  /** R6 — recruitment.requisitions edit; hides "New checklist" when false. */
  canEdit?: boolean;
  existing: WorkPermitChecklistRow[];
  /** Candidates already engaged with this requisition (shortlist + apps). */
  candidatePool: Array<{ personId: string; personName: string }>;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pickedPersonId, setPickedPersonId] = useState<string>('');
  const [pending, startTransition] = useTransition();

  const existingPersonIds = new Set(existing.map((r) => r.personId));
  const availableCandidates = candidatePool.filter((c) => !existingPersonIds.has(c.personId));

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
    <SectionCard
      icon={ClipboardCheck}
      title="Work permit checklists"
      count={existing.length}
      description="One per candidate — verifies the advert matches the contract they're being offered and tracks the documents you've collected."
      action={
        canEdit ? (
          <Button
            size="sm"
            variant="outline"
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
        ) : undefined
      }
    >
      {existing.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No checklists yet"
          description="Create one per candidate the moment a job offer is being finalised. Prints to A4 for the file."
        />
      ) : (
        <ul className={DS_ROW_LIST}>
          {existing.map((row) => (
            <li key={row.id} className={DS_ROW}>
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span
                  aria-hidden
                  className={cn(
                    'grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold',
                    DS_SOFT.blue,
                  )}
                >
                  {initialsOf(row.personName)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{row.personName}</p>
                  <p className="text-xs text-muted-foreground">
                    Updated {formatDistanceToNow(row.updatedAt, { addSuffix: true })}
                    <span className="mx-1.5 text-muted-foreground/60">·</span>
                    <Timestamp date={row.updatedAt} absoluteOnly className="inline text-xs" />
                  </p>
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
    </SectionCard>
  );
}
