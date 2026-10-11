'use client';

import { CheckCircle2 } from 'lucide-react';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { markEmployerOnboardingCompleteAction } from '@/modules/employers/actions';

/**
 * Phase 1 blueprint §4.1 — gives employer onboarding a defined "done"
 * moment. Shown only when the record is not yet marked complete.
 * Server enforces the hard rules (primary contact present, billing
 * email present for standard VAT); the client just surfaces the verb.
 */
export function CompleteOnboardingButton({ employerId }: { employerId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="default"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await markEmployerOnboardingCompleteAction(employerId);
          if (r.ok) toast.success('Onboarding complete — this client is ready for business.');
          else toast.error(r.error.message);
        })
      }
    >
      <CheckCircle2 className="mr-1.5 size-4" />
      {pending ? 'Saving…' : 'Mark onboarding complete'}
    </Button>
  );
}
