import { describe, expect, it } from 'vitest';
import { paginate } from './pagination';

const rows = Array.from({ length: 30 }, (_, i) => i + 1);

describe('paginate', () => {
  it('defaults to page 1 with the first per-page option', () => {
    const r = paginate(rows, undefined, undefined, [12, 24]);
    expect(r).toMatchObject({ page: 1, pages: 3, per: 12, total: 30, start: 0 });
    expect(r.items).toEqual(rows.slice(0, 12));
  });

  it('honours an allowed per-page value and ignores others', () => {
    expect(paginate(rows, '1', '24', [12, 24]).per).toBe(24);
    expect(paginate(rows, '1', '999', [12, 24]).per).toBe(12);
  });

  it('clamps out-of-range and junk page numbers', () => {
    expect(paginate(rows, '99', '12', [12]).page).toBe(3);
    expect(paginate(rows, '99', '12', [12]).items).toEqual(rows.slice(24));
    expect(paginate(rows, '-4', '12', [12]).page).toBe(1);
    expect(paginate(rows, 'abc', '12', [12]).page).toBe(1);
  });

  it('handles an empty list as one empty page', () => {
    expect(paginate([], '3', '12', [12])).toMatchObject({ page: 1, pages: 1, total: 0, items: [] });
  });
});
