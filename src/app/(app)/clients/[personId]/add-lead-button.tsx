'use client';

import { UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { createLeadAction } from '@/modules/leads/actions';

/**
 * Stage C workflow collapse — start the Candidate Services journey from
 * the profile itself. One click creates a CS lead for this existing
 * person through the existing createLead service (audited, assigned per
 * the normal rules); the page refresh then lights up the quote and
 * direct-payment actions that need a lead. No dialog: every field a
 * lead needs is already on the person record.
 */
export function AddLeadButton({ personId }: { personId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await createLeadAction({
            mode: 'EXISTING_PERSON',
            targetBusiness: 'CANDIDATE_SERVICES',
            personId,
          });
          if (r.ok) {
            toast.success('Candidate Services lead opened — you can quote or take payment now');
            router.refresh();
          } else {
            toast.error(r.error.message);
          }
        })
      }
    >
      <UserPlus className="mr-1.5 size-4" aria-hidden />
      {pending ? 'Opening…' : 'Start Candidate Services lead'}
    </Button>
  );
}
