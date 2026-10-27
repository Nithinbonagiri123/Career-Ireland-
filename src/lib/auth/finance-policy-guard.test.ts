import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Phase 1 — static guard. Any non-test source file that performs a
 * privileged financial side effect (writes a VERIFIED payment, issues an
 * invoice or receipt, verifies, or reverses money) must route through the
 * central finance policy. A new money path that forgets the policy fails
 * this test instead of shipping.
 */

const ROOT = path.resolve(__dirname, '../../..');
const SIDE_EFFECTS: Array<[string, RegExp]> = [
  ['VERIFIED payment write', /status:\s*'VERIFIED'/],
  ['receipt issuance', /\binsertReceipt\(/],
  ['invoice issuance', /\binsertInvoice\(/],
  ['official invoice issuance', /\bissueOfficialInvoiceForProForma\(/],
  ['payment verification', /\bperformPaymentVerification\(/],
];
const POLICY = /finance-policy(-rules)?'/;

/**
 * Known exception, reported for decision (Decision K): lead acceptance
 * still issues the lead's invoice for non-finance staff, because
 * Immigration / Recruitment acceptance is their only conversion path. Its
 * payment verification IS policy-gated (decision C1). The file imports the
 * policy, so it passes the import check; this list documents the one
 * remaining staff-reachable issuance.
 */
const STAFF_REACHABLE_ISSUANCE = ['src/modules/leads/service.ts'];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe('every money-moving file uses the central finance policy', () => {
  const files = walk(path.join(ROOT, 'src/modules'));
  const offenders: string[] = [];
  const covered: string[] = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const hits = SIDE_EFFECTS.filter(([, re]) => re.test(src)).map(([label]) => label);
    if (hits.length === 0) continue;
    // The defining module of a primitive (billing/service.ts defines
    // insertInvoice/insertReceipt) is itself covered by its own check.
    const rel = path.relative(ROOT, file);
    if (POLICY.test(src)) covered.push(rel);
    else offenders.push(`${rel} (${hits.join(', ')})`);
  }

  it('finds the known money-moving files', () => {
    expect(covered.length).toBeGreaterThanOrEqual(8);
    for (const f of STAFF_REACHABLE_ISSUANCE) expect(covered).toContain(f);
  });

  it('has no money-moving file without the policy', () => {
    expect(offenders).toEqual([]);
  });
});
