import { describe, expect, it } from 'vitest';
import {
  automatedRunRefusal,
  databaseNameFromUrl,
  isManualDatabaseLabel,
  isManualDatabaseName,
  isManualDatabaseUrl,
  isManualServerUrl,
  liveIdentityRefusal,
  manualServerRefusal,
  setupRunRefusal,
} from './manual-db-guard';

// Fake URLs only — never real credentials.
const MANUAL = 'postgres://u:p@127.0.0.1:5432/ireland_careers_manual';
const MANUAL_OTHER = 'postgresql://u:secretpw@localhost:5432/scratch_manual?sslmode=disable';
const DEV = 'postgres://u:p@127.0.0.1:5432/ireland_careers_dev';
const CI = 'postgres://u:p@localhost:5432/ci';

describe('manual-db-guard: database name detection', () => {
  it('extracts the database name segment', () => {
    expect(databaseNameFromUrl(MANUAL)).toBe('ireland_careers_manual');
    expect(databaseNameFromUrl(MANUAL_OTHER)).toBe('scratch_manual');
    expect(databaseNameFromUrl('postgres://u:p@h:5432/my%5Fmanual')).toBe('my_manual');
    expect(databaseNameFromUrl('not a url')).toBeNull();
    expect(databaseNameFromUrl(undefined)).toBeNull();
    expect(databaseNameFromUrl('postgres://u:p@h:5432/')).toBeNull();
  });

  it('flags the exact manual name and any *_manual name, case-insensitively', () => {
    expect(isManualDatabaseName('ireland_careers_manual')).toBe(true);
    expect(isManualDatabaseName('IRELAND_CAREERS_MANUAL')).toBe(true);
    expect(isManualDatabaseName('foo_manual')).toBe(true);
    expect(isManualDatabaseName('ireland_careers_dev')).toBe(false);
    expect(isManualDatabaseName('ci')).toBe(false);
    expect(isManualDatabaseName('manual_notes')).toBe(false);
    expect(isManualDatabaseName(null)).toBe(false);
  });

  it('classifies URLs', () => {
    expect(isManualDatabaseUrl(MANUAL)).toBe(true);
    expect(isManualDatabaseUrl(MANUAL_OTHER)).toBe(true);
    expect(isManualDatabaseUrl(DEV)).toBe(false);
    expect(isManualDatabaseUrl(CI)).toBe(false);
    expect(isManualDatabaseUrl(undefined)).toBe(false);
  });

  it('recognises the COMMENT label', () => {
    expect(isManualDatabaseLabel('icg:manual-testing — never run automated tests here')).toBe(true);
    expect(isManualDatabaseLabel('something else')).toBe(false);
    expect(isManualDatabaseLabel(null)).toBe(false);
  });
});

describe('manual-db-guard: automated runs (vitest, e2e, test seeds)', () => {
  it('refuses the manual DB with no override, even with the setup flag', () => {
    expect(automatedRunRefusal('vitest', MANUAL)).toMatch(/refuses to run/);
    expect(automatedRunRefusal('vitest', MANUAL)).toMatch(/no override/);
  });

  it('allows dev, CI and an unset URL', () => {
    expect(automatedRunRefusal('vitest', DEV)).toBeNull();
    expect(automatedRunRefusal('vitest', CI)).toBeNull();
    expect(automatedRunRefusal('vitest', undefined)).toBeNull();
  });

  it('never echoes credentials in the refusal message', () => {
    const msg = automatedRunRefusal('seed-e2e-admin', MANUAL_OTHER) ?? '';
    expect(msg).toContain('scratch_manual');
    expect(msg).not.toContain('secretpw');
    expect(msg).not.toContain('postgresql://');
  });
});

describe('manual-db-guard: migrations and reference seeds', () => {
  it('refuses the manual DB without ALLOW_MANUAL_DB_MIGRATE=1', () => {
    expect(setupRunRefusal('migrate', MANUAL, {})).toMatch(/ALLOW_MANUAL_DB_MIGRATE=1/);
    expect(setupRunRefusal('migrate', MANUAL, { ALLOW_MANUAL_DB_MIGRATE: 'true' })).not.toBeNull();
  });

  it('allows the manual DB with the explicit flag', () => {
    expect(setupRunRefusal('migrate', MANUAL, { ALLOW_MANUAL_DB_MIGRATE: '1' })).toBeNull();
  });

  it('allows dev without the flag (normal workflow unchanged)', () => {
    expect(setupRunRefusal('migrate', DEV, {})).toBeNull();
    expect(setupRunRefusal('seed-currencies', CI, {})).toBeNull();
  });

  it('refuses the flag on a non-manual DB (stray exported DATABASE_URL)', () => {
    const msg = setupRunRefusal('migrate', DEV, { ALLOW_MANUAL_DB_MIGRATE: '1' });
    expect(msg).toMatch(/not the manual-testing database/);
    expect(msg).not.toContain('postgres://');
  });
});

describe('manual-db-guard: Playwright server target', () => {
  it('refuses port 3001 on any host', () => {
    expect(isManualServerUrl('http://127.0.0.1:3001')).toBe(true);
    expect(isManualServerUrl('http://localhost:3001/login')).toBe(true);
    expect(manualServerRefusal('playwright', 'http://localhost:3001')).toMatch(/3001/);
  });

  it('allows the dev server and default URLs', () => {
    expect(manualServerRefusal('playwright', 'http://localhost:3000')).toBeNull();
    expect(manualServerRefusal('playwright', 'http://127.0.0.1:3000')).toBeNull();
    expect(manualServerRefusal('playwright', undefined)).toBeNull();
    expect(manualServerRefusal('playwright', 'garbage')).toBeNull();
  });
});

describe('manual-db-guard: live identity', () => {
  it('refuses when current_database() is manual or the COMMENT label marks it', () => {
    expect(
      liveIdentityRefusal('vitest', { db: 'ireland_careers_manual', label: null }),
    ).not.toBeNull();
    expect(
      liveIdentityRefusal('vitest', {
        db: 'alias_db',
        label: 'icg:manual-testing — never run tests',
      }),
    ).not.toBeNull();
  });

  it('allows an unlabelled dev database', () => {
    expect(liveIdentityRefusal('vitest', { db: 'ireland_careers_dev', label: null })).toBeNull();
  });
});
