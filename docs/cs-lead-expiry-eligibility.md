# CS Lead expiry — eligibility design

**Status:** Design only. Cron is NOT activated in Stage 2. Stage 1 added the nullable columns (`leads.expired_at`, `leads.expired_by_reason`, EXPIRED status). This document specifies the exact SQL query that identifies which Candidate Services leads are eligible for automatic expiry, and the guard-rails that keep active financial state from being touched.

## Core rule

A Candidate Services lead is eligible for automatic expiry when **all** of the following hold:

1. `target_business = 'CANDIDATE_SERVICES'`
2. `status IN ('NEW', 'CONTACTED')` (never AWAITING_PAYMENT, CONVERTED, LOST, REJECTED, EXPIRED)
3. `created_at < now() - interval '30 days'`
4. `converted_at IS NULL`
5. `archived_at IS NULL`
6. No pro-forma exists for this lead with status in `('DRAFT','ISSUED','ACCEPTED','CONVERTED')` — i.e. no live or won offer
7. No `service_engagements` row with status `ACTIVE` or `PENDING` is linked back to the lead's person
8. No payment with `pro_forma_invoice_id` referencing any pro forma on this lead is in `PENDING` or `VERIFIED` state (i.e. money is in flight or already in)
9. No `invoices` row references this lead via `source_lead_id` in a non-terminal state (unpaid / outstanding)
10. The lead's `assigned_user_id` has not updated the lead within the last 30 days (we check via the audit log for `LEAD_UPDATED` events on this lead)

## Reference query

Returns the leads the Stage 3 cron should transition to `EXPIRED`:

```sql
SELECT l.id
FROM leads l
WHERE l.target_business = 'CANDIDATE_SERVICES'
  AND l.status IN ('NEW', 'CONTACTED')
  AND l.converted_at IS NULL
  AND l.archived_at IS NULL
  AND l.created_at < NOW() - INTERVAL '30 days'

  -- no live or won pro forma
  AND NOT EXISTS (
    SELECT 1 FROM pro_forma_invoices pf
    WHERE pf.source_lead_id = l.id
      AND pf.status IN ('DRAFT','ISSUED','ACCEPTED','CONVERTED')
  )

  -- no active engagement for this lead's person
  AND NOT EXISTS (
    SELECT 1 FROM service_engagements e
    WHERE e.person_id = l.person_id
      AND e.status IN ('ACTIVE','PENDING')
  )

  -- no verified / pending payment attached to any pro forma on this lead
  AND NOT EXISTS (
    SELECT 1
    FROM payments p
    JOIN pro_forma_invoices pf ON pf.id = p.pro_forma_invoice_id
    WHERE pf.source_lead_id = l.id
      AND p.status IN ('PENDING','VERIFIED')
  )

  -- no outstanding official invoice attached to this lead
  AND NOT EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.source_lead_id = l.id
      AND i.status NOT IN ('VOIDED', 'PAID_IN_FULL')
  )

  -- no recent LEAD_UPDATED / LEAD_CONTACTED audit event in the last 30 days
  AND NOT EXISTS (
    SELECT 1 FROM audit_events ae
    WHERE ae.entity_type = 'lead'
      AND ae.entity_id = l.id
      AND ae.action IN ('LEAD_UPDATED', 'LEAD_CONTACTED', 'STATUS_CHANGED')
      AND ae.created_at > NOW() - INTERVAL '30 days'
  )

ORDER BY l.created_at
LIMIT 500;  -- cron batches 500 at a time
```

## Writer path (Stage 3)

```ts
await db.transaction(async (tx) => {
  const eligible = await tx.execute(/* the query above */);
  for (const row of eligible) {
    // Re-lock + re-check inside the tx — the 30s between query and
    // update is enough for a payment to come in or an operator to
    // touch the lead.
    const [l] = await tx
      .select()
      .from(leads)
      .where(eq(leads.id, row.id))
      .for('update')
      .limit(1);
    if (!l || !eligibilityStillHolds(l, tx)) continue;
    await tx.update(leads)
      .set({
        status: 'EXPIRED',
        expiredAt: new Date(),
        expiredByReason: 'auto_expiry_30d_inactive',
      })
      .where(and(eq(leads.id, l.id), eq(leads.status, l.status))); // guard
    await recordAudit(tx, {
      actorUserId: null, // system
      entityType: 'lead',
      entityId: l.id,
      action: 'EXPIRED',
      before: { status: l.status },
      after: { status: 'EXPIRED' },
      context: { reason: 'auto_expiry_30d_inactive' },
    });
  }
});
```

## Explicit exclusions (safety)

The following cases are **never** auto-expired. Each is enforced by a `NOT EXISTS` clause above:

| Case | What protects it |
|---|---|
| Lead with an accepted pro forma | pro_forma_invoices.status IN ('ACCEPTED','CONVERTED') clause |
| Lead with an active engagement | service_engagements.status IN ('ACTIVE','PENDING') clause |
| Lead with pending / verified payments | payments.status IN ('PENDING','VERIFIED') clause |
| Lead with outstanding official invoices | invoices.status NOT IN ('VOIDED','PAID_IN_FULL') clause |
| Recently touched lead | audit_events last 30 days clause |
| Already converted / rejected / lost / expired | status filter |
| Archived lead | archived_at IS NULL clause |

**Hard rule — accepted agreements are never cancelled by expiry.** If (bug) a lead with status `AWAITING_PAYMENT` and an accepted pro forma ever got into the eligible set, the Stage 3 writer would re-check with FOR UPDATE and refuse to proceed. The query is the first line of defence; the writer re-check is the backstop.

## Operator override

Operators can manually mark a lead `EXPIRED` from the lead detail page without this cron — that writer path lives in `src/modules/leads/service.ts`'s existing archive flow. The cron is only the automatic 30-day sweep.

## Not activated

- No cron / scheduled job is registered in Stage 2.
- No API route / server action for triggering expiry exists.
- The SQL above is a design artefact; its first implementation is a Stage 3 task tracked under "lead expiry sweep".
