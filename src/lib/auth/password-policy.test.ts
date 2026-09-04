import { describe, expect, it } from 'vitest';
import { checkPasswordPolicy, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './password-policy';

describe('checkPasswordPolicy', () => {
  describe('length', () => {
    it('rejects passwords shorter than the minimum', () => {
      const issues = checkPasswordPolicy('Aa1!');
      expect(issues.some((i) => i.toLowerCase().includes(`${MIN_PASSWORD_LENGTH}`))).toBe(true);
    });

    it('accepts passwords at the minimum length with 3 classes', () => {
      // 12 chars, lower + upper + digit
      const issues = checkPasswordPolicy('AbcdefgHij12');
      expect(issues).toEqual([]);
    });

    it('rejects passwords longer than the maximum', () => {
      const pw = `${'A'.repeat(MAX_PASSWORD_LENGTH)}bcd12!`;
      const issues = checkPasswordPolicy(pw);
      expect(issues.some((i) => i.toLowerCase().includes(`${MAX_PASSWORD_LENGTH}`))).toBe(true);
    });
  });

  describe('character classes', () => {
    it('rejects passwords with only 1 class', () => {
      const issues = checkPasswordPolicy('aaaaaaaaaaaaaaa');
      expect(issues.some((i) => i.toLowerCase().includes('mix'))).toBe(true);
    });

    it('rejects passwords with only 2 classes', () => {
      const issues = checkPasswordPolicy('aaaaaaaaaaaaAAA');
      expect(issues.some((i) => i.toLowerCase().includes('mix'))).toBe(true);
    });

    it('accepts passwords with 3 classes', () => {
      expect(checkPasswordPolicy('aaaaaaaaAAA123')).toEqual([]);
    });

    it('accepts passwords with 4 classes', () => {
      expect(checkPasswordPolicy('aaaaAAA123!!!')).toEqual([]);
    });
  });

  describe('blacklist', () => {
    it.each([
      'MyPassword1234!',
      'MyPassw0rd1234',
      'MyWelcome1234!',
      'MyQwerty1234!',
      'MyIloveyou1234!',
      'X12345678aB',
      'MyAdminXYZ12!',
      'MyIrelandXY1!',
      'MyCareerXY123!',
    ])('rejects password containing common weak fragment: %s', (pw) => {
      const issues = checkPasswordPolicy(pw);
      expect(issues.some((i) => i.toLowerCase().includes('common weak'))).toBe(true);
    });

    it('does not reject a password that only touches short fragments incidentally', () => {
      // Doesn't include any full blacklisted substring.
      expect(checkPasswordPolicy('Munchies-Reef-42')).toEqual([]);
    });
  });

  describe('user context', () => {
    it("rejects a password containing the user's email local-part (>=4 chars)", () => {
      const issues = checkPasswordPolicy('Elizabeth1234!', { email: 'elizabeth@example.com' });
      expect(issues.some((i) => i.toLowerCase().includes('name or email'))).toBe(true);
    });

    it("rejects a password containing the user's first name", () => {
      const issues = checkPasswordPolicy('MyJonathan123!', { firstName: 'Jonathan' });
      expect(issues.some((i) => i.toLowerCase().includes('name or email'))).toBe(true);
    });

    it("rejects a password containing the user's last name", () => {
      const issues = checkPasswordPolicy('MyBonagiri123!', { lastName: 'Bonagiri' });
      expect(issues.some((i) => i.toLowerCase().includes('name or email'))).toBe(true);
    });

    it('ignores context substrings shorter than 4 chars', () => {
      // First name 'Al' is too short to be significant.
      expect(checkPasswordPolicy('MyAlbatross1234!', { firstName: 'Al' })).toEqual([]);
    });

    it('honours extraForbidden', () => {
      const issues = checkPasswordPolicy('MyAcmeCorp1234!', {
        extraForbidden: ['AcmeCorp'],
      });
      expect(issues.some((i) => i.toLowerCase().includes('name or email'))).toBe(true);
    });
  });

  describe('happy path', () => {
    it.each(['Correct-Horse-Battery-Staple-42', 'MoltenCraterOwl!99', 'Munchies-Reef-42-plum'])(
      'accepts %s',
      (pw) => {
        expect(checkPasswordPolicy(pw)).toEqual([]);
      },
    );
  });
});
