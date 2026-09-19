'use client';

import { motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';

/**
 * The animated top-of-form error alert every dialog uses when a server
 * action fails at the form level (not a field-level Zod error).
 *
 * Every `*-dialog.tsx` was inlining the same framer-motion + AlertCircle
 * + destructive-bordered box — this is that box.
 *
 * Renders `null` when `error` is null/undefined so callers can drop
 * `<FormErrorAlert error={formError} />` right into their JSX without a
 * conditional wrapper.
 */
export function FormErrorAlert({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
      role="alert"
    >
      <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
      <span>{error}</span>
    </motion.div>
  );
}
