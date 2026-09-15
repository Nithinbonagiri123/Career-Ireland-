import { ShieldCheck } from 'lucide-react';
import { FadeUp } from '@/components/motion/motion-primitives';
import { Badge } from '@/components/ui/badge';
import { requirePermission } from '@/lib/auth/session';
import { parseDateRangeParams } from '@/lib/date-range';
import {
  fetchAuditActions,
  fetchAuditActors,
  fetchAuditEntityTypes,
  fetchAuditEvents,
} from '@/modules/audit/service';
import { AuditFilters } from './audit-filters';
import { AuditTable } from './audit-table';

export const dynamic = 'force-dynamic';

type SearchParams = {
  actor?: string;
  action?: string;
  entity?: string;
  created?: string;
  from?: string;
  to?: string;
};

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePermission('main', 'admin', 'view');
  const params = await searchParams;
  const range = parseDateRangeParams({
    created: params.created,
    from: params.from,
    to: params.to,
  });

  // Fetch options in parallel with the filtered event list — cheap and
  // keeps the render single-round-trip from the client's perspective.
  const [events, actors, actions, entityTypes] = await Promise.all([
    fetchAuditEvents({
      limit: 50,
      actorUserId: params.actor,
      action: params.action,
      entityType: params.entity,
      from: range.from?.toISOString(),
      to: range.to?.toISOString(),
    }),
    fetchAuditActors(),
    fetchAuditActions(),
    fetchAuditEntityTypes(),
  ]);

  const activeFilters = [
    params.actor && 'actor',
    params.action && 'action',
    params.entity && 'entity',
    range.from || range.to ? 'date' : null,
  ].filter(Boolean).length;

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
            Append-only history of every business-critical mutation, plus session events (LOGIN,
            LOGOUT, AUTH_DENIED) and data exports. Reverts create new events — originals are never
            modified.
          </p>
        </div>
      </FadeUp>

      <FadeUp delay={0.03}>
        <AuditFilters
          actors={actors}
          actions={actions}
          entityTypes={entityTypes}
          activeFilters={activeFilters}
        />
      </FadeUp>

      <FadeUp delay={0.06}>
        <AuditTable initialItems={events.items} initialCursor={events.nextCursor} />
      </FadeUp>
    </div>
  );
}
