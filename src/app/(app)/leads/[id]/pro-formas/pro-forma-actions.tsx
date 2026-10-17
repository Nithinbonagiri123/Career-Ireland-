'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  cancelProFormaAction,
  issueProFormaAction,
  recordAcceptanceAction,
  rejectProFormaAction,
} from '@/modules/proformas/actions';

/**
 * Lifecycle action buttons used on the pro-forma view page + lead
 * detail panel. Each one wraps a confirm dialog where the operator
 * must note a reason (except Issue, which has no reason). The reason
 * flows into the audit log; the operator can look it up later.
 *
 * Issue has no confirmation step — it's the common DRAFT → ISSUED
 * transition and operators do it dozens of times a week.
 */

export function IssueProFormaButton({ proFormaInvoiceId }: { proFormaInvoiceId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const r = await issueProFormaAction({ proFormaInvoiceId });
      if (r.ok) {
        toast.success('Pro forma issued');
        router.refresh();
      } else {
        toast.error(r.error.message);
      }
    });
  }

  return (
    <Button size="sm" onClick={submit} disabled={pending}>
      {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
      Issue
    </Button>
  );
}

function ReasonDialog({
  trigger,
  title,
  description,
  reasonLabel,
  confirmLabel,
  variant = 'default',
  minReasonLen = 3,
  onConfirm,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  reasonLabel: string;
  confirmLabel: string;
  variant?: 'default' | 'destructive';
  minReasonLen?: number;
  onConfirm: (reason: string) => Promise<{ ok: boolean; message?: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();

  function submit() {
    if (reason.trim().length < minReasonLen) {
      toast.error(`Please note a reason (min ${minReasonLen} characters)`);
      return;
    }
    startTransition(async () => {
      const r = await onConfirm(reason.trim());
      if (r.ok) {
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.message ?? 'Could not update');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="pf-reason">{reasonLabel}</Label>
          <Input
            id="pf-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder="Required for the audit log"
          />
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" disabled={pending} />}>
            Cancel
          </DialogClose>
          <Button type="button" onClick={submit} disabled={pending} variant={variant}>
            {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RecordAcceptanceButton({ proFormaInvoiceId }: { proFormaInvoiceId: string }) {
  return (
    <ReasonDialog
      trigger={<Button size="sm">Record client acceptance</Button>}
      title="Record client acceptance"
      description="Marks this pro forma ACCEPTED and supersedes any sibling proposals in the same proposal group. Does not create an official invoice — that happens on verified payment (Stage 3)."
      reasonLabel="How did the client accept?"
      confirmLabel="Mark as accepted"
      onConfirm={async (reason) => {
        const r = await recordAcceptanceAction({ proFormaInvoiceId, reason });
        return r.ok ? { ok: true } : { ok: false, message: r.error.message };
      }}
    />
  );
}

export function RejectProFormaButton({ proFormaInvoiceId }: { proFormaInvoiceId: string }) {
  return (
    <ReasonDialog
      trigger={
        <Button size="sm" variant="outline">
          Reject
        </Button>
      }
      title="Reject this pro forma"
      description="Marks the pro forma REJECTED and records your reason in the audit log. Siblings in the same proposal group are unaffected."
      reasonLabel="Reason"
      confirmLabel="Reject"
      variant="destructive"
      onConfirm={async (reason) => {
        const r = await rejectProFormaAction({ proFormaInvoiceId, reason });
        return r.ok ? { ok: true } : { ok: false, message: r.error.message };
      }}
    />
  );
}

export function CancelProFormaButton({ proFormaInvoiceId }: { proFormaInvoiceId: string }) {
  return (
    <ReasonDialog
      trigger={
        <Button size="sm" variant="outline">
          Cancel
        </Button>
      }
      title="Cancel this pro forma"
      description="Marks the pro forma CANCELLED. Use this when an offer is withdrawn before any decision. Siblings in the same proposal group are unaffected."
      reasonLabel="Reason"
      confirmLabel="Cancel pro forma"
      variant="destructive"
      onConfirm={async (reason) => {
        const r = await cancelProFormaAction({ proFormaInvoiceId, reason });
        return r.ok ? { ok: true } : { ok: false, message: r.error.message };
      }}
    />
  );
}
