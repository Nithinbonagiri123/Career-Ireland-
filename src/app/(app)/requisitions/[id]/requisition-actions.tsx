'use client';

import { Sparkles } from 'lucide-react';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { runAssistedMatchingAction } from '@/modules/matching/actions';

export function RunMatchingButton({ requisitionId }: { requisitionId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await runAssistedMatchingAction(requisitionId);
          if (r.ok) toast.success(`Matching complete — ${r.data.upserted} candidates scored`);
          else toast.error(r.error.message);
        })
      }
    >
      <Sparkles className="mr-1.5 size-4" />
      {pending ? 'Scoring…' : 'Run assisted matching'}
    </Button>
  );
}
