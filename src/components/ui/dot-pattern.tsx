import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * Ambient SVG dot pattern for backgrounds. Adapted from 21st.dev's
 * `dillionverma/dot-pattern` (magicui) — swapped the hardcoded
 * `fill-neutral-400/80` for `fill-foreground` at very low opacity so the
 * dots ride the theme (readable in light + dark without a manual
 * override).
 *
 * Typical usage — sit it inside a `relative` container and mask it with a
 * radial gradient so the dots fade toward the edges instead of tiling
 * uniformly, which would compete with foreground content:
 *
 *   <div className="relative">
 *     <DotPattern className="[mask-image:radial-gradient(600px_circle_at_top,white,transparent)]" />
 *     …content…
 *   </div>
 */
interface DotPatternProps {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  cx?: number;
  cy?: number;
  cr?: number;
  className?: string;
}

export function DotPattern({
  width = 16,
  height = 16,
  x = 0,
  y = 0,
  cx = 1,
  cy = 1,
  cr = 1,
  className,
}: DotPatternProps) {
  const id = useId();

  return (
    <svg
      aria-hidden="true"
      className={cn(
        // The base opacity is deliberately low; masks / opacity utilities on
        // the caller can bump it up if a particular surface needs more punch.
        'pointer-events-none absolute inset-0 h-full w-full fill-foreground/[0.06]',
        className,
      )}
    >
      <defs>
        <pattern
          id={id}
          width={width}
          height={height}
          patternUnits="userSpaceOnUse"
          patternContentUnits="userSpaceOnUse"
          x={x}
          y={y}
        >
          <circle cx={cx} cy={cy} r={cr} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" strokeWidth={0} fill={`url(#${id})`} />
    </svg>
  );
}
