'use client';

import { Check, ChevronDown, Search } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { COUNTRIES_SORTED } from '@/lib/iso-countries';
import { cn } from '@/lib/utils';

/**
 * Stage 6G Screen 02 — phone country-code picker.
 *
 * Native <select> was unreadable (cryptic "+252 SO" rows). This control
 * is a searchable combobox: button trigger shows flag + dial code, panel
 * shows flag + country name + dial code and filters as you type.
 *
 * Keyboard: Enter/Space opens; Escape closes; typing in the search input
 * filters live. Click-outside closes.
 */

type Country = {
  code: string;
  name: string;
  callingCode: string | null;
};

const DIALABLE: Country[] = COUNTRIES_SORTED.filter((c) => c.callingCode != null);

function flagFor(iso2: string): string {
  if (iso2.length !== 2) return '';
  const A = 0x1f1e6 - 65;
  return String.fromCodePoint(A + iso2.charCodeAt(0), A + iso2.charCodeAt(1));
}

export function PhoneCountryPicker({
  value,
  onChange,
  className,
  ariaLabel = 'Country calling code',
}: {
  /** The dial code without leading `+`, e.g. `"27"`. */
  value: string;
  /** Fires with the new dial code without `+`. */
  onChange: (callingCode: string) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  // Try to pin a single country to the current dial code (there can be
  // several — US/CA share +1). Prefer the first match in alphabetical
  // order so the trigger stays deterministic.
  const current = useMemo(() => DIALABLE.find((c) => c.callingCode === value), [value]);

  // Case-insensitive match on name OR ISO2 OR dial code.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DIALABLE;
    return DIALABLE.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        (c.callingCode ? c.callingCode.includes(q.replace(/^\+/, '')) : false),
    );
  }, [query]);

  // Close on click outside.
  useEffect(() => {
    if (!open) return;
    function onDocDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  // Focus search on open; reset query on close.
  useEffect(() => {
    if (open) {
      setQuery('');
      // next tick so the input is actually mounted
      queueMicrotask(() => inputRef.current?.focus());
    }
  }, [open]);

  function pick(c: Country) {
    if (c.callingCode) {
      onChange(c.callingCode);
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) setOpen(false);
        }}
        className="inline-flex h-full w-full items-center gap-1.5 bg-muted/40 px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <span className="text-base leading-none">{current ? flagFor(current.code) : '🌐'}</span>
        <span className="font-medium tabular-nums">+{value || '—'}</span>
        <ChevronDown className="ml-auto size-3.5 opacity-70" aria-hidden />
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 top-[calc(100%+4px)] z-50 w-72 rounded-lg border bg-popover p-2 shadow-lg ring-1 ring-black/5"
        >
          <div className="relative mb-2">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setOpen(false);
                if (e.key === 'Enter' && filtered[0]) {
                  e.preventDefault();
                  pick(filtered[0]);
                }
              }}
              placeholder="Search country or code…"
              className="h-9 pl-8"
            />
          </div>
          <div className="max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-2 py-3 text-xs text-muted-foreground">No matches.</div>
            ) : (
              filtered.map((c) => {
                const selected = c.callingCode === value;
                return (
                  <button
                    key={c.code}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => pick(c)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground',
                      selected && 'bg-accent/60',
                    )}
                  >
                    <span className="text-base leading-none">{flagFor(c.code)}</span>
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      +{c.callingCode}
                    </span>
                    {selected && (
                      <Check className="size-3.5 shrink-0 text-foreground" aria-hidden />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
