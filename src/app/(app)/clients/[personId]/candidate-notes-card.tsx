'use client';

import { format } from 'date-fns';
import { MoreHorizontal, Pencil, StickyNote, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DS_SOFT } from '@/components/ds/tones';
import { PromptDialog } from '@/components/prompt-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  archiveCommunicationAction,
  createCommunicationAction,
  updateCommunicationAction,
} from '@/modules/activities/actions';

/**
 * Stage B Wave 3 — Notes card on the candidate Overview tab.
 *
 * Notes reuse the existing communication-log model (type INTERNAL_NOTE,
 * direction INTERNAL) rather than a new table: the author is the
 * staffUserId stamped server-side at creation, the date + time is
 * occurredAt, and archiving keeps the row + audit trail. Any internal
 * staff member can add a note; Edit/Archive only render for the note's
 * author or an admin/owner, and the server re-enforces the same rule
 * (canModifyNote) so a crafted request can't bypass the UI.
 */
export type CandidateNote = {
  id: string;
  body: string | null;
  staffUserId: string;
  staffName: string;
  /** ISO string — serialized across the RSC boundary. */
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
};

const NOTE_TIME_FORMAT = "d MMM yyyy 'at' HH:mm";

export function CandidateNotesCard({
  personId,
  notes,
  currentUserId,
  canModerate,
}: {
  personId: string;
  notes: CandidateNote[];
  currentUserId: string;
  /** True for ADMIN / account owner — may edit or archive anyone's note. */
  canModerate: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [editTarget, setEditTarget] = useState<CandidateNote | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [archiveTarget, setArchiveTarget] = useState<CandidateNote | null>(null);

  const saveNew = () => {
    const body = draft.trim();
    if (!body) return;
    startTransition(async () => {
      const r = await createCommunicationAction({
        type: 'INTERNAL_NOTE',
        direction: 'INTERNAL',
        body,
        personId,
        followUpRequired: false,
      });
      if (r.ok) {
        toast.success('Note added');
        setDraft('');
        setAddOpen(false);
        router.refresh();
      } else {
        toast.error(r.error.message);
      }
    });
  };

  const saveEdit = () => {
    if (!editTarget) return;
    const body = editDraft.trim();
    if (!body) return;
    startTransition(async () => {
      const r = await updateCommunicationAction({
        communicationId: editTarget.id,
        type: 'INTERNAL_NOTE',
        direction: 'INTERNAL',
        body,
        followUpRequired: false,
      });
      if (r.ok) {
        toast.success('Note updated');
        setEditTarget(null);
        router.refresh();
      } else {
        toast.error(r.error.message);
      }
    });
  };

  const confirmArchive = (reason: string) => {
    if (!archiveTarget) return;
    startTransition(async () => {
      const r = await archiveCommunicationAction({
        communicationId: archiveTarget.id,
        reason,
      });
      if (r.ok) {
        toast.success('Note archived');
        setArchiveTarget(null);
        router.refresh();
      } else {
        toast.error(r.error.message);
      }
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
          <span
            aria-hidden
            className={cn('grid size-8 place-items-center rounded-lg', DS_SOFT.amber)}
          >
            <StickyNote className="size-4" />
          </span>
          Notes
        </CardTitle>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          + Add note
        </button>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        {notes.length === 0 ? (
          <p className="italic text-muted-foreground">
            No notes yet. Notes are internal — the candidate never sees them.
          </p>
        ) : (
          notes.map((n) => {
            const mayModify = canModerate || n.staffUserId === currentUserId;
            const edited = n.updatedAt !== n.createdAt;
            return (
              <div key={n.id} className="border-b pb-2.5 last:border-b-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 whitespace-pre-wrap text-foreground">{n.body}</p>
                  {mayModify && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label="Note actions"
                        className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <MoreHorizontal className="size-3.5" aria-hidden />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditTarget(n);
                            setEditDraft(n.body ?? '');
                          }}
                        >
                          <Pencil className="mr-2 size-3.5" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setArchiveTarget(n)}
                        >
                          <Trash2 className="mr-2 size-3.5" /> Archive
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {n.staffName} ·{' '}
                  <time dateTime={n.occurredAt}>
                    {format(new Date(n.occurredAt), NOTE_TIME_FORMAT)}
                  </time>
                  {edited && (
                    <>
                      {' '}
                      · edited{' '}
                      <time dateTime={n.updatedAt}>
                        {format(new Date(n.updatedAt), NOTE_TIME_FORMAT)}
                      </time>
                    </>
                  )}
                </p>
              </div>
            );
          })
        )}
      </CardContent>

      {/* Add note */}
      <Dialog open={addOpen} onOpenChange={(o) => !pending && setAddOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add note</DialogTitle>
          </DialogHeader>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Internal note about this candidate…"
            rows={4}
            maxLength={10000}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={saveNew} disabled={pending || draft.trim().length === 0}>
              {pending ? 'Saving…' : 'Save note'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit note */}
      <Dialog
        open={editTarget !== null}
        onOpenChange={(o) => !pending && !o && setEditTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit note</DialogTitle>
          </DialogHeader>
          <Textarea
            value={editDraft}
            onChange={(e) => setEditDraft(e.target.value)}
            rows={4}
            maxLength={10000}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={pending || editDraft.trim().length === 0}>
              {pending ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive note — reason is audited, row + history preserved. */}
      <PromptDialog
        open={archiveTarget !== null}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={confirmArchive}
        title="Archive this note?"
        description="The note disappears from this card but stays in the audit history."
        label="Reason (audited)"
        placeholder="e.g. Added to the wrong candidate"
        confirmLabel="Archive"
        confirmVariant="destructive"
        pending={pending}
      />
    </Card>
  );
}
