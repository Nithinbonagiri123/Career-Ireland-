import { cn } from '@/lib/utils';

/**
 * Vercel/Linear-style subtle grid canvas.
 *
 * Pattern inspiration: 21st.dev's `meghtrix/grid-background`
 * (`vercel-grid-subtle` variant) + `designali-in/vercel-hero`.
 * Implemented directly here rather than retrieved because it's four CSS
 * lines and adapting them to our tokens costs less than a component
 * retrieval.
 *
 * Structure:
 *   - Two crossed linear-gradients form 48-px grid cells at ~4-5%
 *     line opacity on the foreground token. Because they use
 *     `currentColor`, the same component works in light + dark.
 *   - A radial mask keeps lines strongest near the top-centre of the
 *     canvas and fades them to zero toward the sides + bottom, so the
 *     grid frames the page header instead of tiling under every table.
 *   - `background-position: center top` locks the mask origin to the
 *     scroll canvas rather than the viewport, so scrolling doesn't
 *     drag the grid downward.
 *
 * Sits absolutely inside a `relative` parent — mount once as the first
 * child of the workspace pane and let real content sit above with a
 * `z-10`.
 */
export function GridBackground({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        // Grid line colour — dark enough to actually read on the warm
        // canvas without dominating card interiors. Adjust here first
        // if the look needs to be tuned; opacity + cell size are the
        // two knobs.
        'pointer-events-none absolute inset-0 text-foreground/[0.14] dark:text-foreground/[0.11]',
        // Soft horizontal fade at both edges so the grid doesn't butt
        // against the sidebar/right gutter. Vertical stays full-height
        // so tables sit on visible grid lines instead of a blank strip.
        '[mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]',
        className,
      )}
      style={{
        backgroundImage: `
          linear-gradient(to right, currentColor 1px, transparent 1px),
          linear-gradient(to bottom, currentColor 1px, transparent 1px)
        `,
        backgroundSize: '56px 56px',
        backgroundPosition: 'center top',
      }}
    />
  );
}
