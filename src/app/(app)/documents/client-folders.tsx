import { Building2, Folder, FolderOpen, UserRound } from 'lucide-react';
import Link from 'next/link';
import { FOCUS_RING } from '@/components/ds/segmented';
import { DsStatusPill } from '@/components/ds/status-pill';
import { DS_SOFT } from '@/components/ds/tones';
import { EmptyState } from '@/components/empty-state';
import { Timestamp } from '@/components/timestamp';
import { cn } from '@/lib/utils';
import type { ClientFolder } from '@/modules/documents/hub';

/**
 * Landing view of the /documents hub — one Stage 6G card per client that
 * has any artifact in the system. Click a card to open that client's
 * folder (`/documents?client=<id>&type=<...>`).
 */
export function ClientFolders({ folders }: { folders: ClientFolder[] }) {
  if (folders.length === 0) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm">
        <EmptyState
          icon={Folder}
          title="No client folders yet"
          description="Once staff issue an invoice or a candidate uploads a document, a folder appears here."
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15.5rem),1fr))] gap-4">
      {folders.map((f) => {
        const href = `/documents?client=${encodeURIComponent(f.ownerId)}&type=${f.ownerKind}`;
        const isPerson = f.ownerKind === 'PERSON';
        const stats = [
          { label: 'Files', value: f.filesCount },
          { label: 'Invoices', value: f.invoicesCount },
          { label: 'Receipts', value: f.receiptsCount },
        ];
        return (
          <Link
            key={`${f.ownerKind}-${f.ownerId}`}
            href={href}
            className={cn(
              'group flex min-w-0 flex-col rounded-2xl border border-border/60 bg-card p-4 shadow-sm transition-shadow hover:shadow-md',
              FOCUS_RING,
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <span
                aria-hidden
                className={cn(
                  'grid size-10 shrink-0 place-items-center rounded-xl',
                  DS_SOFT[isPerson ? 'blue' : 'violet'],
                )}
              >
                <FolderOpen className="size-5" />
              </span>
              <DsStatusPill tone={isPerson ? 'blue' : 'violet'} className="gap-1">
                {isPerson ? (
                  <UserRound className="size-3" aria-hidden />
                ) : (
                  <Building2 className="size-3" aria-hidden />
                )}
                {isPerson ? 'Candidate' : 'Employer'}
              </DsStatusPill>
            </div>
            <p
              className="mt-3 truncate text-[15px] font-semibold text-foreground group-hover:underline"
              title={f.ownerName}
            >
              {f.ownerName}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Last activity <Timestamp date={f.lastActivity} absoluteOnly className="inline" />
            </p>
            <dl className="mt-4 grid grid-cols-3 divide-x divide-border/70 border-t border-border/70 pt-3 text-center">
              {stats.map((s) => (
                <div key={s.label} className="min-w-0 px-1">
                  <dd className="text-sm font-semibold tabular-nums text-foreground">{s.value}</dd>
                  <dt className="text-[11px] leading-tight text-muted-foreground">{s.label}</dt>
                </div>
              ))}
            </dl>
          </Link>
        );
      })}
    </div>
  );
}
