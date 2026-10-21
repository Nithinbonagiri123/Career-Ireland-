import { describe, expect, it } from 'vitest';
import { isRecipientAllowed, parseAllowedDomains, recipientDomain } from './sink';

// Staging mail safety — the sink matrix. Production keeps the variable
// unset, which must mean "send everything, change nothing".
describe('mail sink', () => {
  it('unset allowlist disables the sink entirely (production default)', () => {
    expect(parseAllowedDomains(undefined)).toBeNull();
    expect(parseAllowedDomains('')).toBeNull();
    expect(parseAllowedDomains('  ,  ')).toBeNull();
    expect(isRecipientAllowed('anyone@real-company.ie', null)).toBe(true);
  });

  it('allows only listed domains (and their subdomains) when set', () => {
    const allowed = parseAllowedDomains('example.test, icg-staging.dev');
    expect(allowed).toEqual(['example.test', 'icg-staging.dev']);
    expect(isRecipientAllowed('tester@example.test', allowed)).toBe(true);
    expect(isRecipientAllowed('TESTER@EXAMPLE.TEST', allowed)).toBe(true);
    expect(isRecipientAllowed('a@sub.example.test', allowed)).toBe(true);
    expect(isRecipientAllowed('qa@icg-staging.dev', allowed)).toBe(true);
  });

  it('suppresses real-world recipients when the sink is active', () => {
    const allowed = parseAllowedDomains('example.test');
    expect(isRecipientAllowed('someone@gmail.com', allowed)).toBe(false);
    expect(isRecipientAllowed('candidate@real-company.ie', allowed)).toBe(false);
    // Lookalikes don't slip through.
    expect(isRecipientAllowed('x@example.test.evil.com', allowed)).toBe(false);
    expect(isRecipientAllowed('x@notexample.test', allowed)).toBe(false);
    // Malformed addresses are suppressed, never sent.
    expect(isRecipientAllowed('no-at-sign', allowed)).toBe(false);
  });

  it('log-safe recipient form carries the domain only', () => {
    expect(recipientDomain('Person.Name@Company.IE')).toBe('company.ie');
    expect(recipientDomain('malformed')).toBe('(malformed)');
  });
});
