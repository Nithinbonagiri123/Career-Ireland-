'use client';

import { Check, Loader2, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Text-first picker for any catalog reference (skills, qualifications,
 * occupations, services, document types…).
 *
 * Type anything; as you type we show catalog matches ranked by prefix,
 * substring, then alphabetical. Hit a match → we set the canonical id.
 * Type something not in the catalog → the "Use as new: X" row appears.
 *
 * Two "custom" modes controlled by props:
 *
 *   1. `onCreateNew` provided → the "Use as new" row becomes
 *      "+ Add to catalog: X". Clicking it calls the async fn, which
 *      inserts a new catalog row on the server and returns `{ id, label }`.
 *      The selection then commits as `{ kind: 'catalog', id, label }`.
 *      Use this for requisitions / employers / anywhere a foreign key
 *      to the catalog is required.
 *
 *   2. `onCreateNew` NOT provided → the "Use as new" row commits as
 *      `{ kind: 'custom', customName }`, and the caller stores the
 *      free-text on its own row (candidate skills, employment history).
 *
 * Selection is a discriminated union so the caller can dispatch on kind
 * without a follow-up refinement.
 */
export type Selection =
  | { kind: 'catalog'; id: string; label: string }
  | { kind: 'custom'; customName: string }
  | null;

export type CatalogEntry = { id: string; name: string; isActive: boolean };

export function CatalogAutosuggest({
  options,
  value,
  onChange,
  placeholder = 'Type to search — or add a new one',
  excludeIds = new Set<string>(),
  autoFocus = false,
  inputId,
  onCreateNew,
  createLabel = 'Add to catalog',
}: {
  options: CatalogEntry[];
  value: Selection;
  onChange: (v: Selection) => void;
  placeholder?: string;
  /** Ids already used — hidden from suggestions. */
  excludeIds?: Set<string>;
  autoFocus?: boolean;
  inputId?: string;
  /**
   * If set, the "Use as new" row inserts into the catalog server-side
   * and commits the returned id as a `catalog` selection.
   */
  onCreateNew?: (name: string) => Promise<{ id: string; label: string }>;
  /** Prefix for the create row, e.g. "Add skill", "Add occupation". */
  createLabel?: string;
}) {
  const [creating, setCreating] = useState(false);
  const [text, setText] = useState<string>(() => {
    if (!value) return '';
    if (value.kind === 'catalog') return value.label;
    return value.customName;
  });
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  const matches = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return [];
    return options
      .filter((o) => o.isActive && !excludeIds.has(o.id))
      .map((o) => {
        const n = o.name.toLowerCase();
        const prefix = n.startsWith(q);
        const substring = n.includes(q);
        const score = prefix ? 0 : substring ? 1 : 2;
        return { ...o, score };
      })
      .filter((o) => o.score < 2)
      .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [options, text, excludeIds]);

  // Exact catalog match by name (case-insensitive) — offered as the top row.
  const exactMatch = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return null;
    return options.find((o) => o.isActive && o.name.toLowerCase() === q) ?? null;
  }, [options, text]);

  const canUseAsCustom = text.trim().length > 0 && !exactMatch;

  useEffect(() => {
    setHighlight(0);
  }, []);

  const commit = (v: Selection) => {
    onChange(v);
    setText(v?.kind === 'catalog' ? v.label : v?.kind === 'custom' ? v.customName : '');
    setOpen(false);
  };

  const commitCustom = async (name: string) => {
    if (!onCreateNew) {
      commit({ kind: 'custom', customName: name });
      return;
    }
    setCreating(true);
    try {
      const { id, label } = await onCreateNew(name);
      commit({ kind: 'catalog', id, label });
    } catch (e) {
      toast.error((e as Error).message || 'Failed to add to catalog');
    } finally {
      setCreating(false);
    }
  };

  const rows: Array<
    { kind: 'catalog'; entry: CatalogEntry } | { kind: 'custom'; label: string }
  > = [
    ...matches.map((m) => ({ kind: 'catalog' as const, entry: m })),
    ...(canUseAsCustom ? [{ kind: 'custom' as const, label: text.trim() }] : []),
  ];

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(rows.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows[highlight];
      if (!row) return;
      if (row.kind === 'catalog') {
        commit({ kind: 'catalog', id: row.entry.id, label: row.entry.name });
      } else {
        void commitCustom(row.label);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <Input
        id={inputId}
        autoFocus={autoFocus}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          // Clear the selection if the user edits the text.
          if (value) onChange(null);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delay so a click on a suggestion registers before we close.
          setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={onKey}
      />
      {open && rows.length > 0 && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover text-sm shadow-md"
        >
          {rows.map((row, i) => {
            const highlighted = i === highlight;
            if (row.kind === 'catalog') {
              return (
                <button
                  type="button"
                  key={`c-${row.entry.id}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() =>
                    commit({ kind: 'catalog', id: row.entry.id, label: row.entry.name })
                  }
                  onMouseEnter={() => setHighlight(i)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors',
                    highlighted ? 'bg-accent' : 'hover:bg-accent/60',
                  )}
                >
                  <span className="truncate">{row.entry.name}</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Catalog
                  </span>
                </button>
              );
            }
            return (
              <button
                type="button"
                key={`custom-${row.label}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void commitCustom(row.label)}
                onMouseEnter={() => setHighlight(i)}
                disabled={creating}
                className={cn(
                  'flex w-full items-center justify-between gap-2 border-t px-3 py-2 text-left transition-colors disabled:opacity-70',
                  highlighted ? 'bg-accent' : 'hover:bg-accent/60',
                )}
              >
                <span className="flex items-center gap-1.5 truncate">
                  {creating ? (
                    <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                  ) : (
                    <Plus className="size-3.5 text-muted-foreground" />
                  )}
                  {onCreateNew ? `${createLabel}: ` : 'Use as new: '}
                  <span className="font-medium">{row.label}</span>
                </span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {onCreateNew ? 'New' : 'Custom'}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {value?.kind === 'catalog' && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Check className="size-3 text-status-success" />
          Matched to <span className="font-medium">{value.label}</span> — feeds candidate matching.
        </p>
      )}
      {value?.kind === 'custom' && !onCreateNew && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Plus className="size-3" />
          Free text — stored as-is. Won't feed matching against requisitions.
        </p>
      )}
    </div>
  );
}
