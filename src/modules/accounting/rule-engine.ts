import { and, eq, gte, isNull, lte, or } from 'drizzle-orm';
import type { DbExecutor } from '@/lib/audit/withAudit';
import { accountingRules, chartOfAccounts } from '@/lib/db/schema/accounting';

/**
 * The rule engine resolves a `(event_type, division, currency)` key to
 * the set of `(debit_account, credit_account)` pairs — one per
 * `line_role` (PRINCIPAL / TAX / FEE / DISCOUNT) — that the outbox
 * drainer uses to build a balanced journal.
 *
 * Rule matching is deliberately simple:
 *   1. Filter by `event_type` (always required).
 *   2. Prefer rows with the specific `division_code`; fall back to NULL
 *      (= "any division").
 *   3. Same cascade for `currency_code`.
 *   4. Row must be effective on `event_date` (between effective_from
 *      and effective_to; the latter is NULL for currently-active rows).
 *   5. Within the matched set, order by `priority ASC` and take the
 *      first for each `line_role`.
 *
 * The matcher runs inside the caller's transaction so a rule-table
 * change during drain can't tear across journals.
 */
export type ResolvedRule = {
  lineRole: 'PRINCIPAL' | 'TAX' | 'FEE' | 'DISCOUNT';
  debitAccountCode: string;
  creditAccountCode: string;
  debitAccountId: string;
  creditAccountId: string;
};

export async function resolveRulesForEvent(
  tx: DbExecutor,
  args: {
    eventType: string;
    divisionCode: string | null;
    currencyCode: string;
    eventDate: Date;
  },
): Promise<ResolvedRule[]> {
  const dateStr = args.eventDate.toISOString().slice(0, 10);

  // Pull every row that *could* match (event_type + currency fallback +
  // division fallback + currently effective). We then sort in JS,
  // preferring specific matches over wildcards per line_role — easier to
  // reason about than nested CTEs.
  const candidates = await tx
    .select({
      id: accountingRules.id,
      divisionCode: accountingRules.divisionCode,
      currencyCode: accountingRules.currencyCode,
      debitAccountCode: accountingRules.debitAccountCode,
      creditAccountCode: accountingRules.creditAccountCode,
      lineRole: accountingRules.lineRole,
      priority: accountingRules.priority,
    })
    .from(accountingRules)
    .where(
      and(
        eq(accountingRules.eventType, args.eventType),
        or(
          eq(accountingRules.divisionCode, args.divisionCode ?? ''),
          isNull(accountingRules.divisionCode),
        ),
        or(
          eq(accountingRules.currencyCode, args.currencyCode),
          isNull(accountingRules.currencyCode),
        ),
        lte(accountingRules.effectiveFrom, dateStr),
        or(isNull(accountingRules.effectiveTo), gte(accountingRules.effectiveTo, dateStr)),
      ),
    );

  // Specificity score: higher = more specific match. Division beats
  // currency beats wildcard.
  function score(r: { divisionCode: string | null; currencyCode: string | null }): number {
    let s = 0;
    if (r.divisionCode === args.divisionCode) s += 10;
    if (r.currencyCode === args.currencyCode) s += 1;
    return s;
  }

  // Group by lineRole, pick best match per role (highest score, then
  // lowest priority).
  const byRole = new Map<string, (typeof candidates)[number]>();
  for (const c of candidates) {
    const existing = byRole.get(c.lineRole);
    if (!existing) {
      byRole.set(c.lineRole, c);
      continue;
    }
    const existingScore = score(existing);
    const cScore = score(c);
    if (cScore > existingScore) byRole.set(c.lineRole, c);
    else if (cScore === existingScore && c.priority < existing.priority) byRole.set(c.lineRole, c);
  }

  if (byRole.size === 0) return [];

  // Resolve account codes to ids in one pass.
  const codes = Array.from(
    new Set(Array.from(byRole.values()).flatMap((r) => [r.debitAccountCode, r.creditAccountCode])),
  );
  const accounts = await tx
    .select({ id: chartOfAccounts.id, code: chartOfAccounts.code })
    .from(chartOfAccounts);
  const accountIdByCode = new Map(
    accounts.filter((a) => codes.includes(a.code)).map((a) => [a.code, a.id]),
  );

  const resolved: ResolvedRule[] = [];
  for (const [role, rule] of byRole) {
    const dId = accountIdByCode.get(rule.debitAccountCode);
    const cId = accountIdByCode.get(rule.creditAccountCode);
    if (!dId || !cId) {
      // Rule references a non-existent account code. Skip rather than
      // crash the whole drain — the event will stay FAILED and show up
      // in the admin events dashboard.
      continue;
    }
    resolved.push({
      lineRole: role as ResolvedRule['lineRole'],
      debitAccountCode: rule.debitAccountCode,
      creditAccountCode: rule.creditAccountCode,
      debitAccountId: dId,
      creditAccountId: cId,
    });
  }
  return resolved;
}

/**
 * Infer the business division for an invoice event by walking the
 * back-link columns added in migration 0036. Falls back to
 * `candidate_services` so an invoice without any explicit back-link
 * (e.g. a historical row from before the back-links existed) still
 * lands in a plausible bucket rather than failing to post.
 */
export function resolveDivisionForInvoice(args: {
  immigrationCaseId?: string | null;
  jobRequisitionId?: string | null;
  placementId?: string | null;
  sourceLeadTargetBusiness?: string | null;
}): string {
  if (args.immigrationCaseId) return 'immigration';
  if (args.placementId || args.jobRequisitionId) return 'recruitment';
  const b = args.sourceLeadTargetBusiness?.toLowerCase();
  if (b === 'candidate_services' || b === 'recruitment' || b === 'immigration') return b;
  return 'candidate_services';
}
