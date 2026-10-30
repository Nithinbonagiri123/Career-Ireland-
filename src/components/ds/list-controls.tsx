'use client';

import { Check, ChevronDown, Grid3x3, Search, SlidersHorizontal, Table2, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { readMulti } from './params';
import { FOCUS_RING, SEG_TRAY, segItem } from './segmented';
import { DS_DOT, type DsTone } from './tones';

/**
 * Stage 6G list controls (approved mockups 01 / 03). Everything lives in the
 * URL so filtered views are bookmarkable and server-rendered; changing a
 * filter resets `page`.
 */

function useQueryUpdater() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return {
    params,
    hrefWith(changes: Record<string, string | null>) {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(changes)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      if (!('page' in changes)) next.delete('page');
      const qs = next.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    replace(changes: Record<string, string | null>) {
      router.replace(this.hrefWith(changes), { scroll: false });
    },
  };
}

export type FilterSelectDef = {
  param: string;
  label: string;
  /** First option is the "all" option (value ''). */
  options: Array<{ value: string; label: string }>;
  /** Phones only: tuck this select behind the "More filters" button. */
  secondary?: boolean;
  /**
   * Multi-select: checkboxes in a popover; the URL keeps a comma-separated
   * list (`?status=NEW,CONTACTED`). The first ('') option is the label shown
   * when nothing is selected and is not itself selectable.
   */
  multiple?: boolean;
};

/** White filter card: search + labelled selects (+ optional extra controls). */
export function FilterToolbar({
  searchPlaceholder,
  selects,
  searchParam = 'q',
  extra,
}: {
  searchPlaceholder: string;
  selects: FilterSelectDef[];
  searchParam?: string;
  /** Page-specific controls rendered at the end of the bar (e.g. a menu). */
  extra?: React.ReactNode;
}) {
  const q = useQueryUpdater();
  const current = q.params.get(searchParam) ?? '';
  const [text, setText] = useState(current);
  // Latest URL value + updater, read inside the debounce without re-arming it.
  const latest = useRef({ current, q, searchParam });
  latest.current = { current, q, searchParam };
  // Debounce typing into the URL (only when the text differs from the URL).
  useEffect(() => {
    const t = setTimeout(() => {
      const l = latest.current;
      if (text.trim() !== l.current) l.q.replace({ [l.searchParam]: text.trim() || null });
    }, 300);
    return () => clearTimeout(t);
  }, [text]);
  const active = Boolean(current) || selects.some((s) => q.params.get(s.param));
  // Phones: secondary selects sit behind "More filters". The count shows how
  // many of them are set, so an active filter is never silently hidden.
  const secondary = selects.filter((s) => s.secondary);
  const secondaryActive = secondary.filter((s) => q.params.get(s.param)).length;
  const [moreOpen, setMoreOpen] = useState(false);
  const moreId = useId();
  const renderSelect = (s: FilterSelectDef) =>
    s.multiple ? (
      <MultiSelectFilter
        key={s.param}
        def={s}
        values={readMulti(q.params.get(s.param))}
        onChange={(vals) => q.replace({ [s.param]: vals.length ? vals.join(',') : null })}
      />
    ) : (
      <label key={s.param} className="min-w-0 space-y-1 lg:flex-1">
        <span className="block text-xs font-medium text-foreground/70">{s.label}</span>
        <select
          value={q.params.get(s.param) ?? ''}
          onChange={(e) => q.replace({ [s.param]: e.target.value || null })}
          className="h-10 w-full min-w-0 rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {s.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );

  return (
    <section
      aria-label="Filters"
      className="grid gap-3 rounded-2xl border border-border/60 bg-card p-3 shadow-sm sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end"
    >
      <div className="relative min-w-0 sm:col-span-2 lg:flex-[1.6]">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          aria-label={searchPlaceholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-10 rounded-xl border-border/70 bg-background pl-9"
        />
      </div>
      {selects.filter((s) => !s.secondary).map(renderSelect)}
      {secondary.length > 0 && (
        <button
          type="button"
          aria-expanded={moreOpen}
          aria-controls={moreId}
          onClick={() => setMoreOpen((v) => !v)}
          className={cn(
            'inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border/70 bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted sm:col-span-2 md:hidden',
            FOCUS_RING,
          )}
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          {moreOpen ? 'Fewer filters' : 'More filters'}
          {secondaryActive > 0 && (
            <span className="rounded-md bg-primary px-1.5 text-xs tabular-nums text-primary-foreground">
              {secondaryActive}
            </span>
          )}
        </button>
      )}
      {secondary.length > 0 && (
        <div id={moreId} className={moreOpen ? 'contents' : 'hidden md:contents'}>
          {secondary.map(renderSelect)}
        </div>
      )}
      {extra}
      {active && (
        <Link
          href={q.hrefWith({
            [searchParam]: null,
            ...Object.fromEntries(selects.map((s) => [s.param, null])),
          })}
          className={cn(
            'inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:shrink-0',
            FOCUS_RING,
          )}
          scroll={false}
        >
          <X className="size-3.5" aria-hidden /> Clear
        </Link>
      )}
    </section>
  );
}

/** Cards / Table segmented toggle (links with aria-pressed). */
export function ViewToggle({
  current,
  defaultView,
}: {
  current: 'cards' | 'table';
  /** The view used when `?view=` is absent. */
  defaultView: 'cards' | 'table';
}) {
  const q = useQueryUpdater();
  const href = (v: 'cards' | 'table') =>
    q.hrefWith({ view: v === defaultView ? null : v === 'cards' ? 'grid' : 'table', page: null });
  const item = (v: 'cards' | 'table', label: string, Icon: typeof Grid3x3) => (
    <Link
      href={href(v)}
      aria-pressed={current === v}
      scroll={false}
      className={segItem(current === v)}
    >
      <Icon className="size-3.5" aria-hidden /> {label}
    </Link>
  );
  return (
    <fieldset className={cn(SEG_TRAY, 'm-0 shrink-0 flex-nowrap')}>
      <legend className="sr-only">View as</legend>
      {item('cards', 'Cards', Grid3x3)}
      {item('table', 'Table', Table2)}
    </fieldset>
  );
}

export type StatusTabDef = {
  key: string;
  label: string;
  count: number;
  tone?: DsTone;
  /** Extra URL changes made by this tab (e.g. also set the scope). */
  set?: Record<string, string | null>;
  /** Override the active test when a tab is driven by another param. */
  active?: boolean;
};

/** Status tabs with counts (active tab: navy count + underline), optional sort. */
export function StatusTabs({
  tabs,
  param = 'status',
  sort,
  ariaLabel,
}: {
  tabs: StatusTabDef[];
  param?: string;
  /** First option is the default (no `sort` param). */
  sort?: Array<{ value: string; label: string }>;
  ariaLabel: string;
}) {
  const q = useQueryUpdater();
  const active = q.params.get(param) ?? tabs[0]?.key ?? '';
  const sortValue = q.params.get('sort') ?? sort?.[0]?.value ?? '';
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-border/60 bg-card px-3 py-1.5 shadow-sm">
      <nav aria-label={ariaLabel} className="-mb-1.5 flex min-w-0 flex-wrap items-center gap-x-1">
        {tabs.map((t, i) => {
          const isActive = t.active ?? t.key === active;
          return (
            <Link
              key={t.key}
              href={q.hrefWith({ [param]: i === 0 ? null : t.key, ...t.set })}
              aria-current={isActive ? 'page' : undefined}
              scroll={false}
              className={cn(
                'relative inline-flex h-10 items-center gap-2 rounded-md px-2.5 text-sm transition-colors',
                FOCUS_RING,
                isActive
                  ? 'font-semibold text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {!isActive && t.tone && (
                <span aria-hidden className={cn('size-1.5 rounded-full', DS_DOT[t.tone])} />
              )}
              {t.label}
              <span
                className={cn(
                  'rounded-md px-1.5 text-xs tabular-nums',
                  isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                )}
              >
                {t.count}
              </span>
            </Link>
          );
        })}
      </nav>
      {sort && (
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="whitespace-nowrap">Sort by</span>
          <select
            value={sortValue}
            onChange={(e) =>
              q.replace({ sort: e.target.value === sort[0]?.value ? null : e.target.value })
            }
            className="h-9 rounded-lg border border-border/70 bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {sort.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

/** Per-page select for <Pagination>. */
export function PerPageSelect({ value, options }: { value: number; options: number[] }) {
  const q = useQueryUpdater();
  return (
    <select
      aria-label="Rows per page"
      value={value}
      onChange={(e) => q.replace({ per: e.target.value, page: null })}
      className="h-9 rounded-lg border border-border/70 bg-card px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      {options.map((n) => (
        <option key={n} value={n}>
          {n} per page
        </option>
      ))}
    </select>
  );
}

/**
 * Accessible multi-select for the filter bar: a labelled trigger that shows
 * the selection, opening a checkbox panel (Escape / outside click closes and
 * returns focus). Long lists get a search box.
 */
function MultiSelectFilter({
  def,
  values,
  onChange,
}: {
  def: FilterSelectDef;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [needle, setNeedle] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const labelId = useId();
  const allLabel =
    def.options[0]?.value === '' ? def.options[0].label : `Any ${def.label.toLowerCase()}`;
  const choices = def.options.filter((o) => o.value !== '');
  const shown = needle
    ? choices.filter((o) => o.label.toLowerCase().includes(needle.toLowerCase()))
    : choices;
  const summary =
    values.length === 0
      ? allLabel
      : values.length === 1
        ? (choices.find((o) => o.value === values[0])?.label ?? values[0])
        : `${values.length} selected`;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (v: string) =>
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);

  return (
    <div ref={wrapRef} className="relative min-w-0 space-y-1 lg:flex-1">
      <span id={labelId} className="block text-xs font-medium text-foreground/70">
        {def.label}
      </span>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        aria-labelledby={labelId}
        aria-describedby={`${labelId}-v`}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-border/70 bg-background px-3 text-left text-sm text-foreground shadow-xs',
          FOCUS_RING,
          values.length > 0 && 'border-primary/40 bg-sky-50/60 dark:bg-sky-500/10',
        )}
      >
        <span id={`${labelId}-v`} className="truncate">
          {summary}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {values.length > 1 && (
            <span className="rounded-md bg-primary px-1.5 text-xs tabular-nums text-primary-foreground">
              {values.length}
            </span>
          )}
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
        </span>
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute left-0 top-full z-30 mt-1.5 w-full min-w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-border/60 bg-popover p-2 shadow-lg"
        >
          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className="sr-only">{def.label}</legend>
            {choices.length > 8 && (
              <Input
                type="search"
                value={needle}
                onChange={(e) => setNeedle(e.target.value)}
                placeholder={`Search ${def.label.toLowerCase()}…`}
                aria-label={`Search ${def.label.toLowerCase()}`}
                className="mb-2 h-9 rounded-lg"
              />
            )}
            <div className="max-h-64 space-y-0.5 overflow-y-auto">
              {shown.map((o) => {
                const checked = values.includes(o.value);
                return (
                  <label
                    key={o.value}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(o.value)}
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden
                      className={cn(
                        'grid size-4 shrink-0 place-items-center rounded border peer-focus-visible:ring-2 peer-focus-visible:ring-ring',
                        checked
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background',
                      )}
                    >
                      {checked && <Check className="size-3" />}
                    </span>
                    <span className="min-w-0 truncate">{o.label}</span>
                  </label>
                );
              })}
              {shown.length === 0 && (
                <p className="px-2 py-1.5 text-sm text-muted-foreground">No matches</p>
              )}
            </div>
          </fieldset>
          {values.length > 0 && (
            <div className="mt-2 flex justify-end border-t border-border/60 pt-2">
              <button
                type="button"
                onClick={() => onChange([])}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground',
                  FOCUS_RING,
                )}
              >
                Clear {def.label.toLowerCase()}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
