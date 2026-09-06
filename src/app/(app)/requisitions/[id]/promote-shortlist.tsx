'use client';

import { ArrowRight, UserMinus, Users } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { CvPicker } from '@/components/cv-picker';
import { EmptyState } from '@/components/empty-state';
import { PromptDialog } from '@/components/prompt-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { DocumentInstance } from '@/lib/db/schema/documents';
import { createApplicationAction } from '@/modules/applications/actions';
import type { ShortlistPromotionCandidate } from '@/modules/applications/service';
import { removeFromShortlistAction } from '@/modules/matching/actions';

export function PromoteShortlistSection({
  requisitionId,
  candidates,
}: {
  requisitionId: string;
  candidates: ShortlistPromotionCandidate[];
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [target, setTarget] = useState<ShortlistPromotionCandidate | null>(null);
  const [removeTarget, setRemoveTarget] = useState<ShortlistPromotionCandidate | null>(null);
  const [cv, setCv] = useState<DocumentInstance | null>(null);
  const [notes, setNotes] = useState('');
  const [, startTransition] = useTransition();

  const confirmRemove = (reason: string) => {
    if (!removeTarget) return;
    const t = removeTarget;
    setBusyId(t.shortlistEntryId);
    startTransition(async () => {
      const r = await removeFromShortlistAction(t.shortlistEntryId, requisitionId, reason);
      setBusyId(null);
      if (r.ok) {
        toast.success(`${t.personName} removed from shortlist`);
        setRemoveTarget(null);
      } else {
        toast.error(r.error.message);
      }
    });
  };

  if (candidates.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No shortlisted candidates yet"
        description="Shortlist a candidate from Matches above, then come back here to promote them into a formal application."
      />
    );
  }

  const openPromote = (c: ShortlistPromotionCandidate) => {
    setCv(null);
    setNotes('');
    setTarget(c);
  };

  const close = () => {
    setTarget(null);
    setCv(null);
    setNotes('');
  };

  const submit = () => {
    if (!target) return;
    const t = target;
    setBusyId(t.shortlistEntryId);
    startTransition(async () => {
      const r = await createApplicationAction({
        jobRequisitionId: requisitionId,
        personId: t.personId,
        cvDocumentInstanceId: cv?.id ?? '',
        notes,
      });
      setBusyId(null);
      if (r.ok) {
        toast.success(`${t.personName} promoted to APPLIED`);
        close();
      } else {
        toast.error(r.error.message);
      }
    });
  };

  return (
    <>
      <ul className="divide-y">
        {candidates.map((c) => (
          <li key={c.shortlistEntryId} className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-medium">{c.personName}</p>
              <p className="text-xs text-muted-foreground">{c.personEmail ?? '—'}</p>
            </div>
            <div className="flex items-center gap-2">
              {c.alreadyApplied ? (
                <Badge variant="outline" className="rounded-full text-[10px]">
                  Application exists
                </Badge>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === c.shortlistEntryId}
                  onClick={() => openPromote(c)}
                >
                  Promote to application <ArrowRight className="ml-1.5 size-3.5" />
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={busyId === c.shortlistEntryId}
                onClick={() => setRemoveTarget(c)}
                title="Remove from shortlist"
              >
                <UserMinus className="size-3.5" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Dialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Promote to application</DialogTitle>
          </DialogHeader>
          {target && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Creating an application for <span className="font-medium">{target.personName}</span>{' '}
                against this requisition. Pick which CV was submitted (or upload a new one).
              </p>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  CV / Résumé
                </p>
                <CvPicker personId={target.personId} value={cv} onChange={setCv} />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="app-notes"
                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Notes (optional)
                </label>
                <textarea
                  id="app-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  placeholder="Cover-letter summary, submission details, etc."
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={close} disabled={busyId === target?.shortlistEntryId}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busyId === target?.shortlistEntryId}>
              Create application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PromptDialog
        open={removeTarget !== null}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={confirmRemove}
        title={`Remove ${removeTarget?.personName ?? ''} from shortlist?`}
        description="The shortlist entry is deleted. The underlying match flips back to REVIEWED so you can re-shortlist or dismiss it. Auditable."
        label="Reason (audited)"
        placeholder="e.g. Wrong fit on second look, candidate withdrew"
        confirmLabel="Remove"
        confirmVariant="destructive"
        pending={busyId === removeTarget?.shortlistEntryId}
      />
    </>
  );
}
