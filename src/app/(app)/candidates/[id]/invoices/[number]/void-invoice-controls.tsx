'use client';

import { Ban } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PromptDialog } from '@/components/prompt-dialog';
import { Button } from '@/components/ui/button';
import { voidInvoiceAction } from '@/modules/billing/actions';

/**
 * Chrome control for an invoice print page. ADMIN-gated at the server; this
 * component only renders when the parent decides to show it (status === 'ISSUED'
 * AND session role === 'ADMIN'). The reason is required and audited.
 */
export function VoidInvoiceControls({
  invoiceId,
  invoiceNumber,
  personId,
}: {
  invoiceId: string;
  invoiceNumber: string;
  personId: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const confirm = async (reason: string) => {
    setPending(true);
    const r = await voidInvoiceAction({ invoiceId, invoiceNumber, personId, reason });
    setPending(false);
    if (r.ok) {
      toast.success(`${invoiceNumber} voided`);
      setOpen(false);
    } else {
      toast.error(r.error.message);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Ban className="mr-1.5 size-4" />
        Void invoice
      </Button>
      <PromptDialog
        open={open}
        onCancel={() => setOpen(false)}
        onConfirm={confirm}
        title={`Void ${invoiceNumber}?`}
        description="Voiding is destructive to the financial trail — the invoice row is preserved but its status flips to VOIDED. Only voidable while the invoice is ISSUED; a paid invoice must be refunded instead."
        label="Reason (audited)"
        placeholder="e.g. Duplicate issued in error, wrong currency"
        confirmLabel="Void invoice"
        confirmVariant="destructive"
        pending={pending}
      />
    </>
  );
}
