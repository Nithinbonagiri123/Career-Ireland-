# AWS migration — step by step, from the console

Move the database from Neon → **AWS RDS PostgreSQL** and documents from
MinIO → **AWS S3**. Vercel keeps hosting the app. All done from the AWS
console — no CLI needed except for the one-off data dump/restore
(there's no reliable console-only way to do that for Postgres).

**Total hands-on time: ~1 hour.** Total AWS cost at MVP scale: ~$13/mo.

---

## 0 — Sign in and check the region

1. Open https://console.aws.amazon.com and sign in.
2. In the **top-right corner**, next to your name, there's a region
   dropdown. Click it and select **Europe (Ireland) eu-west-1**.
3. Every step below assumes you're in `eu-west-1`. If you drift into a
   different region between steps, resources won't see each other.

> 🟢 **Verify:** the top-right corner shows "Ireland" or "eu-west-1".

---

## 1 — Create the S3 bucket (~5 min)

### 1.1 Open S3

- In the search bar at the top, type **S3** → click the S3 result.
- You land on the S3 dashboard.

### 1.2 Create the bucket

- Click the orange **Create bucket** button (top-right).
- **Bucket name**: `career-ireland-documents-prod`
  (must be globally unique. If taken, try `career-ireland-documents-prod-yourorgname`.)
- **AWS Region**: **Europe (Ireland) eu-west-1**.
- **Object Ownership**: leave as **ACLs disabled (recommended)**.
- **Block Public Access settings for this bucket**: leave ALL 4
  checkboxes **CHECKED**. Confirm the tickbox
  "I acknowledge that the current settings will not block…" if it
  appears — you *do* want everything blocked.
- **Bucket Versioning**: switch to **Enable**.
- **Default encryption**: leave as **Server-side encryption with Amazon
  S3 managed keys (SSE-S3)** → **Enable**.
- **Bucket Key**: **Enable** (saves a bit of money on encryption calls).
- Skip Object Lock and Tags for now.
- Scroll to the bottom → click **Create bucket**.

> 🟢 **Verify:** you land back on the bucket list and see
> `career-ireland-documents-prod` with a lock icon.

### 1.3 Add CORS so browser uploads work

Browser uploads use presigned URLs, which need CORS.

- Click your bucket name → **Permissions** tab.
- Scroll down to **Cross-origin resource sharing (CORS)** → click **Edit**.
- Paste this exactly:

  ```json
  [
    {
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
  ```

- Click **Save changes**.
- Once you have your Vercel prod URL (e.g. `https://career-ireland.vercel.app`),
  come back and replace `"*"` in `AllowedOrigins` with just that URL.

> 🟢 **Verify:** the CORS section now shows the JSON you pasted.

---

## 2 — Create the IAM user for S3 access (~5 min)

The app talks to S3 with a scoped IAM user, not root keys.

### 2.1 Open IAM

- Search bar → **IAM** → click IAM.
- Left sidebar → **Users** → click **Create user** (top-right).

### 2.2 Create the user

- **User name**: `ireland-careers-app`
- Leave "Provide user access to the AWS Management Console" **unchecked**
  (this user only exists for programmatic access).
- Click **Next**.

### 2.3 Attach a scoped inline policy

- On the "Set permissions" step, choose **Attach policies directly**.
- Ignore the AWS-managed policy list. Instead, scroll to the bottom.
  Actually — we'll add the policy AFTER creating the user because inline
  policies are cleaner:
- Just click **Next**, then **Create user** with no permissions yet.

- Now on the user list, click your new `ireland-careers-app` user.
- Go to the **Permissions** tab → **Add permissions** → **Create inline policy**.
- Click the **JSON** tab.
- Paste this (replace `career-ireland-documents-prod` if you used a different
  bucket name):

  ```json
  {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Sid": "AppBucketAccess",
        "Effect": "Allow",
        "Action": [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ],
        "Resource": [
          "arn:aws:s3:::career-ireland-documents-prod",
          "arn:aws:s3:::career-ireland-documents-prod/*"
        ]
      }
    ]
  }
  ```

- Click **Next** → give it a name: `IrelandCareersS3Access` → **Create policy**.

> 🟢 **Verify:** the user's Permissions tab now shows one inline policy.

### 2.4 Create the access key

- Still on the user page → **Security credentials** tab.
- Scroll to **Access keys** → click **Create access key**.
- Use case: **Application running outside AWS**.
- Confirm → **Next** → optional description ("Vercel production") → **Create access key**.
- You now see the **Access key** and **Secret access key**. **Click "Download .csv file"**
  and store it somewhere safe (password manager / 1Password / Bitwarden).
- Once you close this screen you can never see the secret again — only rotate.

> 🟢 **Verify:** you have the CSV file (or copied both keys) somewhere safe.

---

## 3 — Create the RDS database (~15 min setup + 5 min wait)

### 3.1 Open RDS

- Search bar → **RDS** → click RDS.
- Left sidebar → **Databases** → click orange **Create database** (top-right).

### 3.2 Fill the form

Long form. Take each section slowly.

**Choose a database creation method**
- **Standard create**.

**Engine options**
- **PostgreSQL**.
- **Engine version**: pick the latest **PostgreSQL 16.x** (e.g. `16.6-R1`).

**Templates**
- If your AWS account is <12 months old: **Free tier**.
- Otherwise: **Dev/Test**.

**Availability and durability** (only shown if Dev/Test)
- **Single DB instance** (skip Multi-AZ — save $).

**Settings**
- **DB instance identifier**: `ireland-careers-prod`
- **Master username**: `postgres` (default is fine)
- **Credentials management**: **Self managed**.
- **Master password**: generate a **strong 32+ char random password** (use
  1Password's generator or `openssl rand -base64 32`). Paste it into both
  fields. **Copy it into your password manager NOW** — RDS never shows it again.

**Instance configuration**
- **DB instance class**: **Burstable classes** → **db.t4g.micro** (~$12/mo)
  or **db.t4g.small** if you want a bit more headroom (~$25/mo).

**Storage**
- **Storage type**: **General Purpose SSD (gp3)**.
- **Allocated storage**: **20 GB**.
- **Storage autoscaling**: **UNCHECK** the "Enable storage autoscaling" box.
  (You can turn it on later; for MVP the last thing you want is a runaway
  bill from an accidental disk-fill.)

**Connectivity**
- **Compute resource**: **Don't connect to an EC2 compute resource**.
- **Network type**: **IPv4**.
- **Virtual private cloud (VPC)**: leave as **Default VPC**.
- **DB subnet group**: **default**.
- **Public access**: **Yes** ← important. Vercel's egress IPs aren't stable
  on Hobby/Pro so the DB needs a public endpoint.
- **VPC security group (firewall)**: **Create new**.
  - New VPC security group name: `ireland-careers-rds`.
- **Availability Zone**: **No preference**.
- **RDS Proxy**: **UNCHECK** (extra cost, not needed at MVP scale).
- **Certificate authority**: leave default (`rds-ca-rsa2048-g1` or similar).

**Database authentication**
- **Password authentication**.

**Monitoring**
- **Enhanced monitoring**: **UNCHECK** (extra cost).

**Additional configuration** (click to expand)
- **Initial database name**: `ireland_careers` ← **important**, if you skip
  this you'll have to create the DB manually with `psql` later.
- **DB parameter group**: leave default for now (we'll swap it in step 4).
- **Backup**: leave 7-day retention (default is fine).
- **Encryption**: leave **Enable encryption** checked, default KMS key is fine.
- **Log exports**: leave all UNCHECKED.
- **Maintenance**: leave defaults.
- **Deletion protection**: **CHECK "Enable deletion protection"**. Cheap
  insurance against fat-fingering a delete in the console.

### 3.3 Create

- Scroll to the bottom → click **Create database**.
- You land on the Databases list. Your new instance shows **Status: Creating**.
- Wait ~5 min. Refresh the page occasionally. When status shows **Available**,
  proceed.

> 🟢 **Verify:** `ireland-careers-prod` shows Status **Available** and
> Endpoint **`ireland-careers-prod.xxxxxxxx.eu-west-1.rds.amazonaws.com`**.
> Copy the endpoint — you'll need it several times.

---

## 4 — Force TLS on the RDS instance (~5 min)

Since the endpoint is public, unencrypted connections must be rejected.

### 4.1 Create a parameter group

- RDS left sidebar → **Parameter groups** → **Create parameter group** (top-right).
- **Parameter group family**: `postgres16`
- **Type**: **DB parameter group**.
- **Group name**: `ireland-careers-forcessl`
- **Description**: "Force SSL for Ireland Careers prod"
- **Create**.

### 4.2 Set `rds.force_ssl = 1`

- Click your new `ireland-careers-forcessl` group.
- In the search box, type `rds.force_ssl`.
- Click **Edit parameters** (top-right).
- Change `rds.force_ssl` value from `0` to `1`.
- **Save changes**.

### 4.3 Attach the parameter group to the DB

- RDS left sidebar → **Databases** → click `ireland-careers-prod` → **Modify**
  (top-right).
- Scroll down to **Additional configuration** → **DB parameter group**.
- Change from `default.postgres16` to `ireland-careers-forcessl`.
- Scroll to the bottom → **Continue**.
- Under "Scheduling of modifications" pick **Apply immediately**.
- **Modify DB instance**.

### 4.4 Reboot for the parameter to take effect

- Databases → `ireland-careers-prod` → **Actions** (top-right) → **Reboot**.
- **Reboot** in the modal.
- Wait ~30 s until Status shows **Available** again.

> 🟢 **Verify:** DB is Available. SSL enforcement is now on.

---

## 5 — Open the security group for connections (~3 min)

The RDS instance has a firewall (security group) that blocks everything by
default. Open PostgreSQL access.

### 5.1 Find the security group

- Databases → `ireland-careers-prod` → **Connectivity & security** tab.
- Under **VPC security groups**, click the `ireland-careers-rds` link.
  This jumps you to the EC2 security group screen.

### 5.2 Add an inbound rule

- Click the security group ID → **Inbound rules** tab (bottom half of screen)
  → **Edit inbound rules**.
- Click **Add rule**.
  - **Type**: `PostgreSQL`.
  - **Source**: `Anywhere-IPv4` (`0.0.0.0/0`).
  - **Description**: "Vercel + team access via TLS".
- Click **Save rules**.

> Why world-open at the network layer is OK here: `rds.force_ssl=1` means
> unencrypted connections are rejected at the DB layer, and only your
> app + you have the password. When you upgrade Vercel to Enterprise (or
> add a bastion), lock this down to specific IPs.

> 🟢 **Verify:** Inbound rules shows a `Custom TCP` or `PostgreSQL` rule
> on port `5432` from `0.0.0.0/0`.

---

## 6 — Test the connection from your machine (~2 min)

Before touching Vercel, prove you can connect.

Open Terminal:

```sh
# Install psql if you don't have it.
brew install libpq && brew link --force libpq

# Paste your endpoint + password here.
export RDS_HOST=ireland-careers-prod.xxxxxxxx.eu-west-1.rds.amazonaws.com
export RDS_PASSWORD='paste-the-password-you-set'

# Should FAIL — proves SSL is required.
PGPASSWORD="$RDS_PASSWORD" psql \
  "postgresql://postgres@$RDS_HOST:5432/ireland_careers?sslmode=disable" \
  -c 'select 1'
# Expected: "no pg_hba.conf entry for host … SSL off"

# Should SUCCEED — TLS connection.
PGPASSWORD="$RDS_PASSWORD" psql \
  "postgresql://postgres@$RDS_HOST:5432/ireland_careers?sslmode=require" \
  -c 'select version()'
# Expected: prints PostgreSQL 16.x version
```

> 🟢 **Verify:** the second command prints a version string. If it hangs,
> check your local IP isn't blocked (some corporate networks block port 5432
> outbound). If it errors with "password authentication failed", double-check
> the password.

---

## 7 — Wire Vercel to AWS (~5 min)

### 7.1 Open Vercel env vars

- https://vercel.com/dashboard → your Ireland Careers project → **Settings**
  (top nav) → **Environment Variables** (left sidebar).

### 7.2 Add/update these variables (Environment: **Production**)

For each row: click **Add** (or edit if it exists), paste name + value,
choose **Production** environment, click **Save**.

| Name | Value |
|---|---|
| `DATABASE_URL` | `postgresql://postgres:<your-rds-password>@<your-rds-endpoint>:5432/ireland_careers?sslmode=require` |
| `AWS_REGION` | `eu-west-1` |
| `S3_BUCKET_DOCUMENTS` | `career-ireland-documents-prod` |
| `AWS_ACCESS_KEY_ID` | (from the CSV downloaded in step 2.4) |
| `AWS_SECRET_ACCESS_KEY` | (from the CSV downloaded in step 2.4) |
| `AUTH_SECRET` | generate locally: `openssl rand -base64 32` |
| `AUTH_URL` | your Vercel prod URL (e.g. `https://career-ireland.vercel.app`) |
| `CRON_SECRET` | generate locally: `openssl rand -hex 32` |
| `EMAIL_CRED_ENC_KEY` | generate locally: `openssl rand -base64 32` |
| `LOG_LEVEL` | `info` |

**Delete** these two if they exist in Production:
- `S3_ENDPOINT`
- `S3_FORCE_PATH_STYLE`

The app's boot guard refuses to start if `S3_ENDPOINT` points at a dev
backend (localhost / private network), so leaving MinIO values in prod is
a self-inflicted 500.

**Do not set** `NODE_ENV` — Vercel sets it to `production` automatically.

> 🟢 **Verify:** Environment Variables page shows all 10 with "Production"
> tag, and none of the S3_ENDPOINT / S3_FORCE_PATH_STYLE ones for Production.

---

## 8 — Migrate the data (~15 min, terminal-only)

**This part has no clean UI equivalent.** AWS DMS (Database Migration Service)
exists but takes ~1 hour to set up for a one-off migration of a small DB —
`pg_dump | pg_restore` is 10 min.

Pick a low-traffic hour. Downtime while dumping/restoring: ~15 min.

### 8.1 Dump Neon

Open Terminal:

```sh
# Paste your existing Neon URL (from Vercel Production env or .env.local).
export NEON_URL='postgresql://neondb_owner:...@ep-xxx.aws.neon.tech/neondb?sslmode=require'

pg_dump --format=custom --no-owner --no-acl \
  --file=/tmp/ireland-careers-neon.dump \
  "$NEON_URL"

ls -lh /tmp/ireland-careers-neon.dump   # a few MB is expected
```

### 8.2 Restore into RDS

```sh
export RDS_URL="postgresql://postgres:$RDS_PASSWORD@$RDS_HOST:5432/ireland_careers?sslmode=require"

pg_restore --no-owner --no-acl --dbname="$RDS_URL" /tmp/ireland-careers-neon.dump
```

You'll see a few warnings about extensions and roles — those are safe. Real
errors will show as lines beginning `ERROR:`. If you see any, stop and
share them with the team.

### 8.3 Row-count sanity check

Or use the helper: `NEON_URL=… RDS_URL=… bash scripts/migrate-neon-to-rds.sh`
does both steps 8.1 + 8.2 + this check in one shot.

```sh
for t in users persons audit_events candidate_profiles documents invoices receipts; do
  neon_n=$(psql "$NEON_URL" -tAc "select count(*) from \"$t\"" 2>/dev/null || echo n/a)
  rds_n=$(psql "$RDS_URL" -tAc "select count(*) from \"$t\"" 2>/dev/null || echo n/a)
  printf '%-28s neon=%-8s rds=%-8s\n' "$t" "$neon_n" "$rds_n"
done
```

Numbers must match. If any mismatch, **stop and investigate** before
touching Vercel.

> 🟢 **Verify:** every row shows neon = rds.

---

## 9 — Trigger a redeploy on Vercel (~2 min)

- Vercel dashboard → your project → **Deployments** tab.
- Top-most (Production) deployment → **⋯ (three dots)** menu → **Redeploy**.
- Confirm (leave "Use existing Build Cache" checked).
- Watch the deploy log for errors. Should take ~2 min.

> 🟢 **Verify:** deployment status **Ready**.

---

## 10 — Verify prod is on AWS (~5 min)

### 10.1 App health

- Open `https://<your-prod-url>/api/health` in the browser.
- Should return JSON `{"ok":true,…}`.

### 10.2 Sign in

- Open `https://<your-prod-url>/login`.
- Sign in with your admin credentials (the ones migrated from Neon).
- Should land on `/dashboard`.

### 10.3 Upload a document

- Go to any candidate → Documents section → upload a test file.
- Should succeed.

### 10.4 Confirm it landed in S3

- AWS Console → S3 → your bucket → click through the year/month prefix folders.
- Your test file's key should be visible (something like
  `2026/09/person/<uuid>/<uuid>/<uuid>-yourfile.pdf`).

> 🟢 **Verify:** file exists in S3 with size matching what you uploaded.

### 10.5 Download the document

- Back in the app → click the document → should download / open.
- Behind the scenes this is a 302 redirect to a signed S3 URL.

### 10.6 CloudWatch check (optional but reassuring)

- AWS Console → **CloudWatch** → **Log groups** (left sidebar) → search
  `/aws/rds/instance/ireland-careers-prod/postgresql`.
- Recent log entries should show your app's connections.

---

## 11 — After a week of clean prod use

- Neon dashboard → project → Settings → Delete project. **Or** downgrade
  to the free tier as a warm fallback for a bit longer.
- AWS S3 → your bucket → **Management** tab → **Create lifecycle rule** →
  transition to **Glacier Instant Retrieval** after 365 days. Saves ~90% on
  storage cost for old documents.

---

## Rollback (if step 10 fails)

Change these two things back in Vercel env vars, redeploy, done:
- `DATABASE_URL` → back to the Neon URL
- Delete `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and set
  `S3_BUCKET_DOCUMENTS` back to whatever you had (or leave empty; the app
  boots without S3, uploads just fail).

The RDS instance and S3 bucket keep running — you can retry the migration
whenever. Cost of leaving them idle overnight: about $0.50.

---

## Day-2 ops via the console

| Task | Where | Steps |
|---|---|---|
| Rotate RDS password | RDS → Databases → your DB → Modify | New password → Apply immediately → update `DATABASE_URL` in Vercel → redeploy |
| Rotate S3 IAM key | IAM → Users → `ireland-careers-app` → Security credentials | Create new access key → update Vercel → redeploy → verify uploads → delete old key |
| Restore a deleted document | S3 → your bucket → **Show versions** toggle | Find the delete marker → Delete the delete marker |
| Restore a dropped table | RDS → Databases → your DB → Actions → **Restore to point in time** | Restores to a new DB (up to 7 days back). Dump the table out → load into prod |
| Increase RDS storage | RDS → Databases → your DB → Modify | New allocated storage → Apply immediately. Live, no downtime |

---

## What we're deliberately skipping (and when to add it)

| Skipping | Add when |
|---|---|
| Multi-AZ RDS (+$12–25/mo) | You have real users and downtime costs money |
| Private VPC subnets + NAT gateway (+$35/mo) | You go Vercel Enterprise or leave Vercel |
| RDS Proxy | You hit connection-count limits (>100 concurrent app instances) |
| Read replica | Read traffic saturates the primary |
| Secrets Manager | You need automatic rotation or 5+ people editing env vars |
| CloudFront in front of S3 | You serve public files or hit egress cost |
| AWS SES | You need to send more than a handful of emails/day |
| WAF | Real attackers show up in the logs |
| CDK/Terraform for the AWS setup | You need to recreate this in a second environment |
