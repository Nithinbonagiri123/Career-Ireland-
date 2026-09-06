# Backup & restore runbook

Scope: the AWS RDS Postgres cluster and the S3 documents bucket described in [aws-migration.md](./aws-migration.md). Aimed at the 3-person MVP team — cheap, defensible, verifiable in one hour.

## 1. Recovery objectives

| Metric | Target | Rationale |
|---|---|---|
| RPO (data loss window) | ≤ 15 min | RDS PITR is second-granularity; 15 min is the SLA we tell customers. |
| RTO (recovery time) | ≤ 2 h | Time to restore RDS + swap DNS + smoke-test the app. |
| Retention | 30 days automated, 12 months monthly | Covers most "we deleted the wrong candidate" incidents without paying enterprise cold-storage rates. |

## 2. What we back up

- **Postgres (RDS)** — the entire cluster. Automated backups (daily snapshot + 5-min WAL) cover PITR; monthly manual snapshots retained 12 months for compliance.
- **S3 documents bucket** — versioning ON + a lifecycle rule that expires non-current versions after 90 days. Cross-region replication is deferred until we have paying customers.
- **What we do NOT back up**: MinIO (local dev only, throwaway), Vercel build artefacts (rebuild from git), redis/cache (none in prod).

## 3. RDS configuration to verify (once, at launch)

1. **RDS Console → Databases → `career-ireland-prod` → Modify**
   - Backup retention period: **30 days** (default is 7)
   - Backup window: **02:00-03:00 UTC** (off-peak for Ireland customers)
   - Enable "Copy tags to snapshots"
   - Deletion protection: **ON**
2. **Apply immediately** (this is a metadata change, no downtime).
3. Confirm the automated-backup badge shows "Enabled" on the DB instance summary.

## 4. Monthly manual snapshot (calendar task, 1st of the month)

```
RDS Console → Snapshots → Take snapshot
  DB instance: career-ireland-prod
  Snapshot name: career-ireland-prod-YYYY-MM-01
```

Add a tag `retention=12mo` so the janitor script (not yet written) can prune older snapshots without touching PITR retention.

## 5. Restore drills (quarterly)

The only backup you can trust is one you've restored. Every quarter, on a Friday afternoon, do this:

1. **Pick a snapshot** ≥ 24 h old (from the automated list).
2. **Restore into a new instance**: `career-ireland-restore-drill-YYYY-MM-DD` — `db.t4g.small` is fine, no need to match prod size.
3. From your laptop:
   ```bash
   psql "$RESTORED_URL" -c 'select count(*) from persons;'
   psql "$RESTORED_URL" -c 'select count(*) from audit_events;'
   psql "$RESTORED_URL" -c 'select max(created_at) from audit_events;'
   ```
   The `max(created_at)` should be within a few minutes of the snapshot timestamp.
4. **Delete the restore drill instance** — leaving it running is £30/month wasted.
5. Log the drill in `docs/backup-drills.md` (create on first run): date, snapshot ID, `max(created_at)` observed, any issues.

## 6. Real recovery: PITR (data-loss incident)

When something bad happens (`DELETE FROM persons WHERE …` fired against prod):

1. **Do not touch prod.** Every minute you wait, the PITR window shrinks by nothing — RDS keeps 30 days. But every minute the app runs, more legitimate writes need to be replayed manually.
2. **Put the app in maintenance mode**: Vercel → Project → Deployments → Promote the last known-good deployment, OR flip a maintenance env var if one exists.
3. **Restore to a point in time** just before the incident:
   ```
   RDS Console → Databases → career-ireland-prod → Actions → Restore to point in time
     Restore time: <UTC timestamp 1 minute before the bad query>
     New instance identifier: career-ireland-prod-restored
   ```
   Restore takes ~15-30 min for our current data size.
4. **Point Vercel at the restored instance**: update `DATABASE_URL` env var, redeploy.
5. **Rename**: after smoke-testing, rename `career-ireland-prod` → `career-ireland-prod-broken` and `career-ireland-prod-restored` → `career-ireland-prod`. RDS renames trigger a reboot but no data change.
6. **Post-mortem**: what fired the bad query, why it wasn't caught, what guard-rail (RLS? read-only replica for reports?) would have prevented it.

## 7. Real recovery: full-cluster loss (AZ outage, corruption)

1. Same as §6 but restore from the most recent automated snapshot rather than PITR (PITR requires the primary to be intact).
2. Expect to lose 5-15 minutes of writes — the app must be idempotent on retry (it is, per audit trail).

## 8. S3 bucket recovery

- **Accidental delete of one object**: bucket has versioning ON, so the previous version is one click away.
  ```
  S3 Console → career-ireland-documents-prod → object → Versions tab → Restore
  ```
- **Bucket-wide compromise**: attach a bucket policy denying `s3:DeleteObject` and `s3:DeleteObjectVersion` for everyone except a break-glass IAM role. Not enabled by default because it complicates day-to-day cleanup, but flip it on the moment a real customer's docs land in there.

## 9. Ownership

- **On call** for backup verification: rotates weekly among the three engineers.
- **Drill runner**: whoever's on-call that quarter.
- **Escalation** if a restore drill fails: pull in AWS Support (Business tier is £80/month and cheaper than being wrong about backups).

## 10. What we're deliberately not doing yet

- **Off-AWS backups** (e.g., Backblaze mirror). Adds cost and complexity; RDS + S3 durability guarantees are strong enough for pre-revenue.
- **Automated backup-verification pipeline**. Would replay a snapshot into a scratch DB and diff row counts nightly. Worth building once the team is >3 people or once we have a compliance need.
- **Encrypted backups with a customer-managed KMS key**. RDS default encryption uses an AWS-managed key, which is fine until we have a customer contract that specifies otherwise.
