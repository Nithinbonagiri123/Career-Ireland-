/** Minimal RFC 4180 CSV encoder. Handles commas, quotes, newlines. */
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = value instanceof Date ? value.toISOString() : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: Array<{ key: keyof T & string; header: string }>,
): string {
  const header = columns.map((c) => escapeCell(c.header)).join(',');
  const body = rows.map((r) => columns.map((c) => escapeCell(r[c.key])).join(',')).join('\n');
  return `${header}\n${body}\n`;
}
