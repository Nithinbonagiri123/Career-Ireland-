import type { ReactNode } from 'react';

/** White toolbar card above a ledger report: date control left, status right. */
export function ReportToolbar({ picker, status }: { picker: ReactNode; status?: ReactNode }) {
  return (
    <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card p-3 shadow-sm sm:px-4">
      <div className="min-w-0">{picker}</div>
      {status && <div className="flex min-w-0 flex-wrap items-center gap-2">{status}</div>}
    </div>
  );
}
