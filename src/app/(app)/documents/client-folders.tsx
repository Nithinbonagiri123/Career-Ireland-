import { Folder, FolderOpen } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { Timestamp } from '@/components/timestamp';
import { Badge } from '@/components/ui/badge';
import type { ClientFolder } from '@/modules/documents/hub';

/**
 * Landing view of the /documents hub — one card per client that has
 * any artifact in the system. Click a card to open that client's
 * folder (drills into `/documents?client=<id>&type=<...>`), which
 * re-uses the same table as before but scoped to that owner only.
 */
export function ClientFolders({ folders }: { folders: ClientFolder[] }) {
  if (folders.length === 0) {
    return (
      <EmptyState
        icon={Folder}
        title="No client folders yet"
        description="Once staff issue an invoice or a candidate uploads a document, a folder appears here."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {folders.map((f) => {
        const href = `/documents?client=${encodeURIComponent(f.ownerId)}&type=${f.ownerKind}`;
        const bits: string[] = [];
        if (f.filesCount) bits.push(`${f.filesCount} file${f.filesCount === 1 ? '' : 's'}`);
        if (f.invoicesCount)
          bits.push(`${f.invoicesCount} invoice${f.invoicesCount === 1 ? '' : 's'}`);
        if (f.receiptsCount)
          bits.push(`${f.receiptsCount} receipt${f.receiptsCount === 1 ? '' : 's'}`);
        return (
          <Link
            key={`${f.ownerKind}-${f.ownerId}`}
            href={href}
            className="group flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/40"
          >
            <div className="flex items-start justify-between">
              <div className="rounded-lg bg-emerald-900/10 p-2 text-emerald-900 group-hover:bg-emerald-900/15">
                <FolderOpen className="size-5" />
              </div>
              <Badge variant="neutral" className="text-[10px] uppercase">
                {f.ownerKind}
              </Badge>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground" title={f.ownerName}>
                {f.ownerName}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {bits.length > 0 ? bits.join(' · ') : 'No documents yet'}
              </p>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Last activity
              </span>
              <Timestamp date={f.lastActivity} />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
