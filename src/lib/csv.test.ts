import { describe, expect, it } from 'vitest';
import { escapeCell, toCsv } from './csv';

describe('escapeCell', () => {
  describe('RFC 4180 basics', () => {
    it('empty string for null / undefined', () => {
      expect(escapeCell(null)).toBe('');
      expect(escapeCell(undefined)).toBe('');
    });

    it('quotes cells containing a comma', () => {
      expect(escapeCell('one, two')).toBe('"one, two"');
    });

    it('quotes and doubles internal quotes', () => {
      expect(escapeCell('she said "hi"')).toBe('"she said ""hi"""');
    });

    it('quotes cells containing newlines / carriage returns', () => {
      // Note: leading \r is also a formula trigger, so the cell gets a leading quote first.
      expect(escapeCell('a\nb')).toBe('"a\nb"');
    });

    it('serialises Date to ISO', () => {
      const d = new Date('2026-09-03T21:00:00.000Z');
      expect(escapeCell(d)).toBe('2026-09-03T21:00:00.000Z');
    });
  });

  describe('CSV formula-injection defence (OWASP)', () => {
    it.each([
      ['=CMD("calc")', '\'=CMD("calc")'],
      ['=1+1', "'=1+1"],
      ['+1', "'+1"],
      ['-1', "'-1"],
      ['@SUM(A1)', "'@SUM(A1)"],
      ['\tsneaky', "'\tsneaky"],
      ['\revil', "'\revil"], // and it also carries \r → quoted
    ])('prefixes formula-triggering cell %j with a single quote', (input, expected) => {
      const out = escapeCell(input);
      // For \r case the RFC quoting also kicks in — accept both bare and quoted forms.
      expect(out === expected || out === `"${expected.replace(/"/g, '""')}"`).toBe(true);
    });

    it('does NOT prefix ordinary text starting with a digit or letter', () => {
      expect(escapeCell('123 High St')).toBe('123 High St');
      expect(escapeCell('Priya')).toBe('Priya');
    });

    it('does NOT prefix cells where the trigger appears mid-string', () => {
      expect(escapeCell('Priya =Patel')).toBe('Priya =Patel');
    });
  });
});

describe('toCsv', () => {
  it('emits header + rows terminated by newlines', () => {
    const out = toCsv(
      [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 22 },
      ],
      [
        { key: 'name', header: 'Name' },
        { key: 'age', header: 'Age' },
      ],
    );
    expect(out).toBe('Name,Age\nAlice,30\nBob,22\n');
  });

  it('escapes values in the body', () => {
    const out = toCsv(
      [{ name: '=CMD("calc")', note: 'has, comma' }],
      [
        { key: 'name', header: 'Name' },
        { key: 'note', header: 'Note' },
      ],
    );
    expect(out).toContain("'=CMD");
    expect(out).toContain('"has, comma"');
  });
});
