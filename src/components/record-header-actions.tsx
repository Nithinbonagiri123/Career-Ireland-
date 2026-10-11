'use client';

import { MoreHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Record-page action row primitive — Phase 2 blueprint §1.2 / Gap B.
 *
 * Before this landed, record pages carried 4–8 header buttons with no
 * hierarchy — Candidate (4-5), Employer (5-6), Requisition (8+),
 * Immigration (4-5). The eye had nowhere to land. "Edit", "Reassign",
 * "Assign to me", "Add candidate", "Run matching", "Start
 * advertisement", "Set reminder" all competed for attention.
 *
 * This primitive splits the row into three slots:
 *
 *   • Primary  — the ONE filled verb the user most likely wants to
 *                click right now. State-aware. Null when the record
 *                has no clear next step.
 *   • Secondary — 2–3 outlined visible verbs that make sense in the
 *                current state. The common moves kept at a glance.
 *   • Overflow  — everything else under a single `⋮ More` dropdown.
 *                Still one click away, not hidden.
 *
 * The slots accept raw ReactNodes so callers can pass their existing
 * Dialog triggers / Links / Buttons without wrapping. Overflow items
 * are wrapped in `DropdownMenuItem` on the way out.
 *
 * Taste rule: don't put a verb in Secondary if it's never used in the
 * current state. Let it live in Overflow. The row should always look
 * tight regardless of record state.
 */
export function RecordHeaderActions({
  primary,
  secondary = [],
  overflow = [],
}: {
  primary?: ReactNode;
  secondary?: ReactNode[];
  overflow?: ReactNode[];
}) {
  const visibleSecondary = secondary.filter((v) => v != null && v !== false);
  const overflowItems = overflow.filter((v) => v != null && v !== false);

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {visibleSecondary.map((node, i) => (
        // Secondary verbs are stable per state — index-key is safe
        // because callers pass a fresh array per render and don't
        // reorder across renders.
        // biome-ignore lint/suspicious/noArrayIndexKey: stable per-state order
        <span key={`sec-${i}`}>{node}</span>
      ))}
      {primary && <span>{primary}</span>}
      {overflowItems.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="More actions"
                className="shrink-0"
              />
            }
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[200px]">
            {overflowItems.map((node, i) => (
              // Same rationale as secondary above — stable order.
              // biome-ignore lint/suspicious/noArrayIndexKey: stable per-state order
              <div key={`ovf-${i}`}>{node}</div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
