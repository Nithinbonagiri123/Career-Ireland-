'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { PromptDialog } from '@/components/prompt-dialog';
import { Button } from '@/components/ui/button';
import { postYearEndCloseAction } from '@/modules/accounting/year-end-actions';

/**
 * One-click year-end close. Prompts for confirmation (free-form note
 * goes into the audit log via the service's recordAudit call) and
 * fires the server action. On success routes to the new journal.
 */
export function YearEndCloseButton({
  year,
  disabled,
  disabledReason,
}: {
  year: number;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const onConfirm = (_note: string) => {
    startTransition(async () => {
      const r = await postYearEndCloseAction({ year });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success(`Year-end close posted (${r.data.number})`);
      setOpen(false);
      router.push(`/admin/accounting/journals/${r.data.id}`);
    });
  };

  if (disabled) {
    return (
      <Button variant="outline" size="sm" disabled title={disabledReason}>
        Close {year}
      </Button>
    );
  }

  return (
    <>
      <Button variant="default" size="sm" onClick={() => setOpen(true)}>
        {pending && <Loader2 className="mr-1.5 size-4 animate-spin" />} Close {year}
      </Button>
      <PromptDialog
        open={open}
        onCancel={() => setOpen(false)}
        onConfirm={onConfirm}
        title={`Close FY ${year}?`}
        description="Posts a single journal that zeroes every P&L account's balance into 3100 Retained Earnings. After it posts, the Balance Sheet's synthetic current-year-profit line drops to zero and the equity is 'real'. Only ADMIN can run this."
        label="Note (audited)"
        placeholder="e.g. Annual close prepared by accountant"
        confirmLabel="Post close"
        confirmVariant="default"
        pending={pending}
      />
    </>
  );
}
