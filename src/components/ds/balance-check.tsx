import { CheckCircle2, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoney } from './money';
import { DS_PILL } from './tones';

/**
 * "Balanced" / "Out of balance by €X" — icon + text, never colour alone.
 * `difference` is whatever the report already computed; display only.
 */
export function BalanceCheck({
  balanced,
  difference,
  currency,
  className,
}: {
  balanced: boolean;
  difference?: number | string | null;
  currency: string;
  className?: string;
}) {
  const Icon = balanced ? CheckCircle2 : TriangleAlert;
  return (
    <span
      role="status"
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset',
        balanced ? DS_PILL.green : DS_PILL.rose,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {balanced
        ? 'Balanced'
        : difference === null || difference === undefined
          ? 'Out of balance'
          : `Out of balance by ${formatMoney(
              typeof difference === 'string'
                ? Math.abs(Number.parseFloat(difference))
                : Math.abs(difference),
              currency,
            )}`}
    </span>
  );
}
