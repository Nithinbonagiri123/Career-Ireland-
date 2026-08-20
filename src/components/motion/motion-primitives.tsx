'use client';

import { type HTMLMotionProps, motion } from 'framer-motion';
import type { ReactNode } from 'react';

/** Standard ease curve used across the app. */
export const easeStandard = [0.4, 0, 0.2, 1] as const;
/** Slower ease for larger elements (drawers, modals). */
export const easeEmphasized = [0.32, 0.72, 0, 1] as const;

/** Fade + rise, used for page entries and cards. */
export function FadeUp({
  children,
  delay = 0,
  ...props
}: HTMLMotionProps<'div'> & { children: ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: easeStandard, delay }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/** Staggered container — pair with FadeUp children for list entrances. */
export function StaggerContainer({
  children,
  stagger = 0.04,
  ...props
}: HTMLMotionProps<'div'> & { children: ReactNode; stagger?: number }) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: stagger } },
      }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/** Individual item inside StaggerContainer. */
export function StaggerItem({
  children,
  ...props
}: HTMLMotionProps<'div'> & { children: ReactNode }) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 8 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.24, ease: easeStandard } },
      }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
