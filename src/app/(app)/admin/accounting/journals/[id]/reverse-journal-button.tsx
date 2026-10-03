'use client';

import { Undo2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { PromptDialog } from '@/components/prompt-dialog';
import { Button } from '@/components/ui/button';
import { reverseJournalAction } from '@/modules/accounting/actions';

export function ReverseJournalButton({
  journalId,
  journalNumber,
}: {
  journalId: string;
  journalNumber: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const onConfirm = (reason: string) => {
    startTransition(async () => {
      const r = await reverseJournalAction({ journalId, reason });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success(`Posted reversal ${r.data.number}`);
      setOpen(false);
    });
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Undo2 className="mr-1.5 size-4" /> Reverse
      </Button>
      <PromptDialog
        open={open}
        onCancel={() => setOpen(false)}
        onConfirm={onConfirm}
        title={`Reverse ${journalNumber}?`}
        description="Creates a NEW journal with debits and credits swapped. The original is flipped POSTED → REVERSED. Both rows remain visible in the ledger."
        label="Reason (audited)"
        placeholder="e.g. Duplicate posting; correct amount re-raised"
        confirmLabel="Reverse"
        confirmVariant="destructive"
        pending={pending}
      />
    </>
  );
}
