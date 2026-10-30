/**
 * URL-param helpers shared by server pages and the client list controls
 * (kept out of the 'use client' module so server components can call them).
 */

/** Read a comma-separated multi-select param (`?status=NEW,CONTACTED`). */
export function readMulti(value: string | null | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}
