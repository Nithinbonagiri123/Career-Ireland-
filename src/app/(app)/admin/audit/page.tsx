import { ShieldCheck } from 'lucide-react';
import { FadeUp } from '@/components/motion/motion-primitives';
import { Badge } from '@/components/ui/badge';
import { fetchAuditEvents } from '@/modules/audit/service';
import { AuditTable } from './audit-table';

export const dynamic = 'force-dynamic';

export default async function AuditLogPage() {
  const { items, nextCursor } = await fetchAuditEvents({ limit: 50 });

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <ShieldCheck className="size-4 text-muted-foreground" />
            <Badge variant="secondary" className="rounded-full">
              Admin
            </Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
          <p className="text-sm text-muted-foreground">
            Append-only history of every business-critical mutation. Reverts create new events —
            originals are never modified.
          </p>
        </div>
      </FadeUp>

      <FadeUp delay={0.05}>
        <AuditTable initialItems={items} initialCursor={nextCursor} />
      </FadeUp>
    </div>
  );
}
