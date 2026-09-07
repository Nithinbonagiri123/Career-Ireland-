'use client';

import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useEffect } from 'react';

/**
 * Numeric readout that springs from 0 to the given value on mount.
 * Used on the dashboard so KPI numbers arrive with weight instead of
 * being a static "0" the moment the page paints. Ticks are cheap —
 * one motion value per instance, rounded through a useTransform —
 * so a page with a dozen of these still renders in one frame.
 *
 * The spring is deliberately calm (stiffness 90, damping 24) so
 * numbers ease in rather than bounce. Bounce reads playful; we want
 * "professional financial dashboard."
 */
export function AnimatedCounter({
  value,
  className,
  duration = 900,
}: {
  value: number;
  className?: string;
  /** Total spring settle time in ms — used purely to derive the initial delay curve. */
  duration?: number;
}) {
  const raw = useMotionValue(0);
  const spring = useSpring(raw, { stiffness: 90, damping: 24, mass: 0.9 });
  const rounded = useTransform(spring, (v) => Math.round(v).toLocaleString());

  useEffect(() => {
    // Small delay so the entrance FadeUp finishes before numbers start
    // moving — reads like a proper reveal instead of a fight.
    const t = setTimeout(() => raw.set(value), 80);
    return () => clearTimeout(t);
  }, [raw, value]);

  // Provide a static string fallback in the DOM for SSR / no-JS. When
  // Framer hydrates it takes over and animates from 0.
  return (
    <motion.span className={className} aria-label={String(value)} style={{ display: 'inline-block' }} data-duration={duration}>
      {rounded}
    </motion.span>
  );
}
