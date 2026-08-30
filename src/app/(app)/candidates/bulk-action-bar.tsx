'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { UserCheck, UserX, X } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  bulkAssignCandidatesAction,
  bulkUpdateCandidateLifecycleAction,
} from '@/modules/candidates/actions';
import type { LifecycleStatus } from '@/modules/candidates/bulk-service';

type UserOption = { id: string; fullName: string; email: string };

export function CandidatesBulkActionBar({
  selectedIds,
  onClear,
  staffUsers,
}: {
  selectedIds: string[];
  onClear: () => void;
  staffUsers: UserOption[];
}) {
  const count = selectedIds.length;

  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          key="bulk-bar"
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="pointer-events-auto fixed inset-x-0 bottom-6 z-40 mx-auto flex w-fit max-w-[92vw] items-center gap-3 rounded-full border bg-popover px-4 py-2 text-sm text-popover-foreground shadow-xl ring-1 ring-foreground/10"
          role="region"
          aria-label="Bulk actions"
        >
          <Badge variant="secondary" className="rounded-full">
            {count} selected
          </Badge>
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear
          </Button>
          <span className="h-4 w-px bg-border" />
          <AssignDialog selectedIds={selectedIds} staffUsers={staffUsers} onDone={onClear} />
          <LifecycleDialog selectedIds={selectedIds} onDone={onClear} />
          <button
            type="button"
            onClick={onClear}
            aria-label="Close bulk actions"
            className="ml-1 inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-accent/50"
          >
            <X className="size-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Assign dialog ────────────────────────────────────────────────────────────

function AssignDialog({
  selectedIds,
  staffUsers,
  onDone,
}: {
  selectedIds: string[];
  staffUsers: UserOption[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string>('');
  const [pending, startTransition] = useTransition();

  const submit = (assignTo: string | null) => {
    startTransition(async () => {
      const r = await bulkAssignCandidatesAction({
        personIds: selectedIds,
        userId: assignTo,
      });
      if (r.ok) {
        toast.success(
          r.data.changed > 0
            ? `${r.data.changed} candidate${r.data.changed === 1 ? '' : 's'} ${assignTo ? 'assigned' : 'unassigned'}`
            : 'Already up-to-date — nothing to change',
        );
        setOpen(false);
        onDone();
      } else {
        toast.error(r.error.message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <UserCheck className="mr-1.5 size-3.5" /> Assign
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Assign {selectedIds.length} candidate{selectedIds.length === 1 ? '' : 's'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="bulk-assign-user">Assign to</Label>
            <select
              id="bulk-assign-user"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm"
            >
              <option value="">Select a staff member…</option>
              {staffUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} · {u.email}
                </option>
              ))}
            </select>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Each candidate profile is updated in a single transaction. Audit history is preserved
            per-record. Unchanged rows are silently skipped.
          </p>
        </div>
        <DialogFooter className="justify-between sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => submit(null)}
            disabled={pending}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <UserX className="mr-1.5 size-3.5" /> Unassign all
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={() => submit(userId)} disabled={pending || !userId}>
              Assign
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Lifecycle dialog ─────────────────────────────────────────────────────────

function LifecycleDialog({ selectedIds, onDone }: { selectedIds: string[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<LifecycleStatus>('ACTIVE');
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      const r = await bulkUpdateCandidateLifecycleAction({
        personIds: selectedIds,
        lifecycleStatus: status,
      });
      if (r.ok) {
        toast.success(
          r.data.changed > 0
            ? `${r.data.changed} candidate${r.data.changed === 1 ? '' : 's'} marked ${status.toLowerCase()}`
            : `All selected candidates already ${status.toLowerCase()}`,
        );
        setOpen(false);
        onDone();
      } else {
        toast.error(r.error.message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            Set lifecycle…
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Change lifecycle status for {selectedIds.length} candidate
            {selectedIds.length === 1 ? '' : 's'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="bulk-lifecycle">Set to</Label>
            <select
              id="bulk-lifecycle"
              value={status}
              onChange={(e) => setStatus(e.target.value as LifecycleStatus)}
              className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm"
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Does not touch availability. Archived candidates stay searchable but won't be scored by
            the matching engine.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
