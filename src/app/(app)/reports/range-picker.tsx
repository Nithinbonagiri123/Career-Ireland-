'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

const PRESETS: Array<{ days: number; label: string }> = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '1 year' },
];

export function ReportRangePicker({ currentDays }: { currentDays: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setDays = (days: number) => {
    const usp = new URLSearchParams(params?.toString() ?? '');
    if (days === 90) usp.delete('days');
    else usp.set('days', String(days));
    const qs = usp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div
      role="tablist"
      aria-label="Report date range"
      className="inline-flex rounded-md border bg-card p-0.5 text-xs"
    >
      {PRESETS.map((p) => {
        const active = currentDays === p.days;
        return (
          <button
            key={p.days}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setDays(p.days)}
            className={cn(
              'rounded px-2.5 py-1 transition-colors',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent/50',
            )}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
