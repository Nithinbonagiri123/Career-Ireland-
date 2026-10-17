'use client';

import { Loader2, UserCheck } from 'lucide-react';
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
} from '@/components/ui/dialog';
import { activateCandidateAction } from '@/modules/clients/activation';

/**
 * Stage 6B — the pure-activation dialog. Deliberately NOT a finance form:
 * it collects nothing, confirms nothing about money, and never writes an
 * invoice or payment. Activation lives independent of settlement; the
 * workspace tracks balances separately on the Billing tab.
 *
 * The old "Convert → activate candidate" dialog bundled service + amount
 * + method + reference + reason, which non-finance operators found
 * confusing (and could inadvertently commit an invoice while thinking
 * they were just activating a candidate). That path still exists for
 * genuine manual-override use cases (client paid in cash, no quote on
 * file) but has moved to an explicit menu item with warning copy — see
 * [[record-payment-outside-quote]] when the Phase D cleanup lands.
 */
export function ActivateCandidateDialog({
  leadId,
  open,
  onOpenChange,
}: {
  leadId: string | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!leadId) {
      toast.error('No lead to activate from.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await activateCandidateAction({ leadId });
      if (r.ok) {
        toast.success(
          r.data.alreadyActivated
            ? 'Candidate was already active — no changes needed.'
            : 'Candidate activated. The client file is open now.',
        );
        onOpenChange(false);
        router.refresh();
      } else {
        setError(r.error.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Activate candidate</DialogTitle>
          <DialogDescription>
            Opens the candidate file so you can start work. This does not create or alter any
            invoice, payment or receipt — billing stays on its own track.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
              <UserCheck className="h-3.5 w-3.5" aria-hidden /> What this does
            </div>
            <ul className="list-inside list-disc space-y-0.5">
              <li>Creates (or reuses) a candidate profile for this person</li>
              <li>Marks the lead as converted</li>
              <li>Assigns you as the owner if nobody is yet</li>
            </ul>
            <div className="mt-2 border-t border-border/60 pt-2 text-[11px]">
              It does <strong>not</strong> issue an invoice, record a payment, or trigger an email.
              Finance confirms payments separately on the Billing tab.
            </div>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" disabled={pending} />}>
            Cancel
          </DialogClose>
          <Button type="button" onClick={submit} disabled={pending || !leadId}>
            {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Activate candidate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
