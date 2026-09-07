import { cn } from '@/lib/utils';

/**
 * Ambient aurora wash for the app canvas. Adapted from 21st.dev's
 * `manuarora700/aurora-background` (aceternity) — the original ships a
 * vibrant blue/indigo/violet CSS gradient designed for landing pages
 * and burns cycles on a fixed background-attachment animation. Here it
 * is retuned for an enterprise CRM canvas:
 *
 *   1. Colours come from the app's warm palette (amber accent hue 55 +
 *      a cool counter-tone) rather than saturated indigo.
 *   2. Radial-blob positioning + heavy blur instead of the repeating
 *      linear-gradient aurora bands — reads as "soft warm/cool wash"
 *      rather than "northern lights."
 *   3. Static in light mode (no motion when nobody is prompting it);
 *      slow drift in dark mode where the effect is subtler.
 *   4. Radial mask fades toward the bottom so it never competes with
 *      content sitting near the fold.
 *
 * The component is a positioned `<div>` — mount it once as the first
 * child of a `relative` container and let siblings sit on top with
 * `z-10`.
 */
export function AuroraBackground({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden',
        '[mask-image:linear-gradient(to_bottom,black,transparent_75%)]',
        className,
      )}
    >
      {/* Warm accent blob — top-right, matches our --accent hue. */}
      <div
        className={cn(
          'absolute -right-24 -top-32 h-[520px] w-[520px] rounded-full',
          'bg-[radial-gradient(circle_at_center,oklch(0.85_0.13_55/0.35),transparent_70%)]',
          'dark:bg-[radial-gradient(circle_at_center,oklch(0.65_0.14_55/0.28),transparent_70%)]',
          'blur-3xl',
        )}
      />
      {/* Cool counter-tone — top-left, cyan-leaning for chromatic balance. */}
      <div
        className={cn(
          'absolute -left-40 top-20 h-[560px] w-[560px] rounded-full',
          'bg-[radial-gradient(circle_at_center,oklch(0.9_0.08_215/0.32),transparent_70%)]',
          'dark:bg-[radial-gradient(circle_at_center,oklch(0.6_0.11_215/0.24),transparent_70%)]',
          'blur-3xl',
        )}
      />
      {/* Softer wash bottom-centre — provides a hint of colour so the
          middle of a scroll doesn't feel abandoned. */}
      <div
        className={cn(
          'absolute left-1/2 top-[45%] h-[420px] w-[900px] -translate-x-1/2 rounded-full',
          'bg-[radial-gradient(ellipse_at_center,oklch(0.94_0.05_100/0.35),transparent_65%)]',
          'dark:bg-[radial-gradient(ellipse_at_center,oklch(0.55_0.08_100/0.18),transparent_65%)]',
          'blur-3xl',
        )}
      />
    </div>
  );
}
