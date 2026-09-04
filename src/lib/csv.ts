/**
 * Minimal RFC 4180 CSV encoder. Handles commas, quotes, newlines.
 *
 * Also defuses CSV/formula injection: cells starting with `= + - @ \t \r` are
 * treated as formulas by Excel / Numbers / LibreOffice. If a person's name is
 * `=CMD("calc")` and staff opens the export, Excel executes it. Prefix any
 * such cell with a single quote per OWASP guidance — the quote is stripped
 * by the spreadsheet on paste but neutralises the formula.
 * https://owasp.org/www-community/attacks/CSV_Injection
 */
const FORMULA_TRIGGERS = new Set(['=', '+', '-', '@', '\t', '\r']);

export function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (s.length > 0 && FORMULA_TRIGGERS.has(s[0] ?? '')) {
    s = `'${s}`;
  }
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
