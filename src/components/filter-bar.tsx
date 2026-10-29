import { Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

export type FilterSelect = {
  name: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
};

/**
 * R5 — server-rendered filter bar (a plain GET form): the URL holds the
 * filters, so views are bookmarkable and work without client JS. Hidden
 * fields keep params the bar does not own (e.g. ?view=).
 */
export function FilterBar({
  action,
  q,
  qPlaceholder,
  selects,
  hidden = {},
  extra,
}: {
  action: string;
  q?: string;
  qPlaceholder: string;
  selects: FilterSelect[];
  hidden?: Record<string, string | undefined>;
  extra?: ReactNode;
}) {
  return (
    <form
      action={action}
      method="get"
      className="mb-4 grid gap-3 rounded-2xl border bg-card p-3 shadow-sm ring-1 ring-border/60 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(auto-fit,minmax(9rem,1fr))_auto] lg:items-end"
      aria-label="Filters"
    >
      {Object.entries(hidden).map(([k, v]) =>
        v ? <input key={k} type="hidden" name={k} value={v} /> : null,
      )}
      <div className="space-y-1 sm:col-span-2 lg:col-span-1">
        <Label htmlFor="flt-q" className="text-xs text-muted-foreground">
          Candidate
        </Label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="flt-q"
            name="q"
            defaultValue={q ?? ''}
            placeholder={qPlaceholder}
            className="pl-9"
          />
        </div>
      </div>
      {selects.map((s) => (
        <div key={s.name} className="min-w-0 space-y-1">
          <Label htmlFor={`flt-${s.name}`} className="text-xs text-muted-foreground">
            {s.label}
          </Label>
          <Select id={`flt-${s.name}`} name={s.name} defaultValue={s.value}>
            {s.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      ))}
      {extra}
      <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
        <Button type="submit" size="sm" className="h-9">
          Apply
        </Button>
        <a
          href={action + (hidden.view ? `?view=${hidden.view}` : '')}
          className="inline-flex h-9 items-center rounded-md px-3 text-sm text-muted-foreground hover:text-foreground"
        >
          Reset
        </a>
      </div>
    </form>
  );
}
