import { describe, expect, it } from 'vitest';
import { safeCallbackUrl } from './safe-callback';

describe('safeCallbackUrl', () => {
  describe('accepts safe same-origin paths', () => {
    it.each([
      ['/dashboard'],
      ['/admin/users'],
      ['/candidates/abc-123'],
      ['/portal/candidate/documents'],
      ['/dashboard?filter=open'],
      ['/dashboard#section'],
    ])('%s', (input) => {
      expect(safeCallbackUrl(input)).toBe(input);
    });
  });

  describe('falls back on missing/empty input', () => {
    it('null', () => expect(safeCallbackUrl(null)).toBe('/dashboard'));
    it('undefined', () => expect(safeCallbackUrl(undefined)).toBe('/dashboard'));
    it('empty string', () => expect(safeCallbackUrl('')).toBe('/dashboard'));
    it('custom fallback', () =>
      expect(safeCallbackUrl(null, '/portal/candidate')).toBe('/portal/candidate'));
  });

  describe('rejects open-redirect attempts', () => {
    it.each([
      ['https://evil.com/fake'], // absolute external
      ['http://evil.com'],
      ['//evil.com/x'], // protocol-relative
      ['/\\evil.com/x'], // backslash trick
      ['javascript:alert(1)'], // scheme without leading slash
      ['data:text/html,foo'],
      ['dashboard'], // no leading slash → treated as scheme-relative by some parsers
    ])('rejects %s', (input) => {
      expect(safeCallbackUrl(input)).toBe('/dashboard');
    });
  });

  describe('rejects scheme-inside-path tricks', () => {
    // `/http://x.com` — router may treat as external in some parsers.
    it.each([['/http://evil.com'], ['/javascript:alert(1)'], ['/data:text/html,foo']])(
      'rejects %s',
      (input) => {
        expect(safeCallbackUrl(input)).toBe('/dashboard');
      },
    );
  });

  describe('rejects whitespace / control chars', () => {
    it.each([
      ['/dash board'],
      ['/dashboard\n'],
      ['/dashboard\r'],
      ['/\x00dashboard'],
      ['/dashboard\x1f'],
      ['/\tdashboard'],
    ])('rejects %j', (input) => {
      expect(safeCallbackUrl(input)).toBe('/dashboard');
    });
  });

  describe('non-string input', () => {
    it('object', () => expect(safeCallbackUrl({} as unknown as string)).toBe('/dashboard'));
    it('number', () => expect(safeCallbackUrl(42 as unknown as string)).toBe('/dashboard'));
  });
});
