import { describe, expect, it } from 'vitest';
import { env } from './env';

describe('env', () => {
  it('loads and validates without throwing', () => {
    expect(env.NODE_ENV).toBeDefined();
    expect(env.LOG_LEVEL).toBeDefined();
    expect(env.DATABASE_URL).toBeDefined();
  });
});
