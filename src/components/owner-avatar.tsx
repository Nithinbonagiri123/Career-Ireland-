/**
 * Phase 4 blueprint §13 — compact owner-visibility primitive.
 *
 * Used on every list row and record detail header where the operator
 * needs to know "who owns this?" at a glance. Previously that lived
 * only in the raw user-id column (useless) or was absent from card
 * grids entirely.
 *
 * Variants:
 *   - size="sm"   — initials pill only (list cells)
 *   - size="md"   — initials + full name (detail headers)
 *
 * Pass `user=null` to render the "Unassigned" placeholder — same
 * footprint, dashed outline so the gap stays visually loud.
 */

type OwnerUser = { id: string; fullName: string };

const PALETTE = [
  'bg-sky-100 text-sky-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-violet-100 text-violet-700',
  'bg-teal-100 text-teal-700',
];

function hashToIndex(id: string): number {
  // Cheap deterministic colour pick — not security-sensitive.
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % PALETTE.length;
}

function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0]?.slice(0, 2).toUpperCase() ?? '??';
  const first = parts[0]?.[0] ?? '';
  const last = parts[parts.length - 1]?.[0] ?? '';
  return (first + last).toUpperCase();
}

export function OwnerAvatar({
  user,
  size = 'sm',
  showName,
}: {
  user: OwnerUser | null;
  size?: 'sm' | 'md';
  /** Explicit override; defaults to true for md, false for sm. */
  showName?: boolean;
}) {
  const nameVisible = showName ?? size === 'md';
  const dim = size === 'md' ? 'size-7 text-[11px]' : 'size-5 text-[10px]';

  if (!user) {
    return (
      <span className="inline-flex items-center gap-1.5" title="Unassigned">
        <span
          className={`inline-flex ${dim} items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground/60`}
          aria-hidden
        >
          ?
        </span>
        {nameVisible && <span className="text-xs italic text-muted-foreground">Unassigned</span>}
      </span>
    );
  }

  const palette = PALETTE[hashToIndex(user.id)] ?? PALETTE[0];
  return (
    <span className="inline-flex items-center gap-1.5" title={user.fullName}>
      <span
        className={`inline-flex ${dim} items-center justify-center rounded-full font-semibold ${palette}`}
        aria-hidden
      >
        {initialsOf(user.fullName)}
      </span>
      {nameVisible && (
        <span className={size === 'md' ? 'text-sm font-medium' : 'text-xs'}>{user.fullName}</span>
      )}
    </span>
  );
}
