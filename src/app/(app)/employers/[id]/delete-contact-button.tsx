'use client';

import { Trash2 } from 'lucide-react';
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
import { deleteEmployerContactAction } from '@/modules/employers/actions';

/**
 * R1 — contacts gained delete (they could only be added or edited).
 * Proper confirm dialog; the removal is written to the audit trail with
 * a full before-snapshot, so history survives the row.
 */
export function DeleteContactButton({
  contactId,
  employerId,
  contactName,
}: {
  contactId: string;
  employerId: string;
  contactName: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon" aria-label={`Delete ${contactName}`}>
            <Trash2 className="size-3.5" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete this contact?</DialogTitle>
          <DialogDescription>
            {contactName} will be removed from this employer. The deletion is recorded in the audit
            trail with the contact's details, so the history is kept.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" disabled={pending} />}>
            Cancel
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await deleteEmployerContactAction({ contactId, employerId });
                if (r.ok) {
                  toast.success(`${contactName} removed`);
                  setOpen(false);
                  router.refresh();
                } else toast.error(r.error.message);
              })
            }
          >
            {pending ? 'Deleting…' : 'Delete contact'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
