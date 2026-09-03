'use client';

import { Archive } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { PromptDialog } from '@/components/prompt-dialog';
import { Button } from '@/components/ui/button';
import { archiveCaseAction } from '@/modules/immigration/actions';

export function ArchiveCaseButton({
  caseId,
  beneficiaryName,
}: {
  caseId: string;
  beneficiaryName: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = (reason: string) => {
    startTransition(async () => {
      const r = await archiveCaseAction({ caseId, reason });
      if (r.ok) {
        toast.success('Case archived');
        setOpen(false);
      } else {
        toast.error(r.error.message);
      }
    });
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-destructive"
      >
        <Archive className="mr-1.5 size-3.5" /> Archive case
      </Button>
      <PromptDialog
        open={open}
        onCancel={() => setOpen(false)}
        onConfirm={submit}
        title={`Archive ${beneficiaryName}'s case?`}
        description="Removes the case from the active list. Documents, tasks, and audit history stay intact and can be restored."
        label="Reason (audited)"
        placeholder="e.g. Case superseded by a new application"
        confirmLabel="Archive"
        confirmVariant="destructive"
        pending={pending}
      />
    </>
  );
}
