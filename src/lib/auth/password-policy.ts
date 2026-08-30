/**
 * Password complexity policy — NIST-style: length wins over character-class theatrics,
 * but we still require multiple classes to prevent trivial "aaaaaaaaaaaa" passwords,
 * block a small explicit blacklist, and refuse passwords containing the user's own
 * identifiers (email local-part, first/last name).
 *
 * Policy:
 *   - Length ≥ 12 characters
 *   - Length ≤ 128 characters
 *   - At least 3 of 4 character classes: lowercase, uppercase, digit, symbol
 *   - Not one of a small explicit weak-password blacklist
 *   - Must not contain the user's email local-part or first/last name (≥4 chars)
 */

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

/** Small explicit blacklist of common weak passwords. Case-insensitive substring check. */
const WEAK_BLACKLIST = [
  'password',
  'passw0rd',
  'welcome',
  'letmein',
  'qwerty',
  'iloveyou',
  '12345678',
  '87654321',
  'admin',
  'administrator',
  'candidate',
  'employer',
  'ireland',
  'career',
];

export type PasswordContext = {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  /** Callers can add more forbidden substrings — e.g. company name. */
  extraForbidden?: string[];
};

/** Human-readable policy rules — surface these in the UI. */
export const PASSWORD_POLICY_RULES: string[] = [
  `At least ${MIN_PASSWORD_LENGTH} characters`,
  'Mix of at least 3 of: lowercase, uppercase, digits, symbols',
  'Not a common weak password',
  "Doesn't contain your name or email",
];

function countCharacterClasses(pw: string): number {
  let classes = 0;
  if (/[a-z]/.test(pw)) classes++;
  if (/[A-Z]/.test(pw)) classes++;
  if (/[0-9]/.test(pw)) classes++;
  if (/[^a-zA-Z0-9]/.test(pw)) classes++;
  return classes;
}

/** Returns a list of policy violations. Empty array = password acceptable. */
export function checkPasswordPolicy(password: string, ctx?: PasswordContext): string[] {
  const issues: string[] = [];

  if (password.length < MIN_PASSWORD_LENGTH) {
    issues.push(`Must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    issues.push(`Must be at most ${MAX_PASSWORD_LENGTH} characters`);
  }
  if (countCharacterClasses(password) < 3) {
    issues.push('Must mix at least 3 of: lowercase, uppercase, digits, symbols');
  }

  const pwLower = password.toLowerCase();
  for (const bad of WEAK_BLACKLIST) {
    if (pwLower.includes(bad)) {
      issues.push('Must not contain a common weak password fragment');
      break;
    }
  }

  if (ctx) {
    const forbidden: string[] = [];
    if (ctx.email) {
      const localPart = ctx.email.split('@')[0]?.toLowerCase();
      if (localPart && localPart.length >= 4) forbidden.push(localPart);
    }
    if (ctx.firstName && ctx.firstName.length >= 4) forbidden.push(ctx.firstName.toLowerCase());
    if (ctx.lastName && ctx.lastName.length >= 4) forbidden.push(ctx.lastName.toLowerCase());
    if (ctx.extraForbidden) {
      for (const s of ctx.extraForbidden) {
        if (s.length >= 4) forbidden.push(s.toLowerCase());
      }
    }
    for (const f of forbidden) {
      if (pwLower.includes(f)) {
        issues.push('Must not contain your name or email');
        break;
      }
    }
  }

  return issues;
}
