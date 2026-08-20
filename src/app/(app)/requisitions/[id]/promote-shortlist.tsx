'use client';

import { ArrowRight, Users } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createApplicationAction } from '@/modules/applications/actions';
import type { ShortlistPromotionCandidate } from '@/modules/applications/service';

export function PromoteShortlistSection({
  requisitionId,
  candidates,
}: {
  requisitionId: string;
  candidates: ShortlistPromotionCandidate[];
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (candidates.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No shortlisted candidates yet"
        description="Shortlist a candidate from Matches above, then come back here to promote them into a formal application."
      />
    );
  }

  const promote = (c: ShortlistPromotionCandidate) => {
    setBusyId(c.shortlistEntryId);
    startTransition(async () => {
      const r = await createApplicationAction({
        jobRequisitionId: requisitionId,
        personId: c.personId,
      });
      setBusyId(null);
      if (r.ok) toast.success(`${c.personName} promoted to APPLIED`);
      else toast.error(r.error.message);
    });
  };

  return (
    <ul className="divide-y">
      {candidates.map((c) => (
        <li key={c.shortlistEntryId} className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm font-medium">{c.personName}</p>
            <p className="text-xs text-muted-foreground">{c.personEmail ?? '—'}</p>
          </div>
          {c.alreadyApplied ? (
            <Badge variant="outline" className="rounded-full text-[10px]">
              Application exists
            </Badge>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={busyId === c.shortlistEntryId}
              onClick={() => promote(c)}
            >
              Promote to application <ArrowRight className="ml-1.5 size-3.5" />
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
