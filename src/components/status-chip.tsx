import { cn } from '@/lib/utils';

/** Small rounded status label with a tone class (R4 campaign / prospect states). */
export function StatusChip({
  label,
  tone,
  className,
}: {
  label: string;
  tone: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
        tone,
        className,
      )}
    >
      {label}
    </span>
  );
}
