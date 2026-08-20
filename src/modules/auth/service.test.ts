import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPasswordHash } from './service';

describe('password hashing', () => {
  it('produces a verifiable argon2id hash', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(verifyPasswordHash(hash, 'correct horse battery staple')).resolves.toBe(true);
    await expect(verifyPasswordHash(hash, 'wrong password')).resolves.toBe(false);
  });

  it('produces distinct hashes for the same input (salted)', async () => {
    const a = await hashPassword('same password');
    const b = await hashPassword('same password');
    expect(a).not.toEqual(b);
  });
});
