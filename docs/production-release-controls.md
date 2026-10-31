# Production release controls — investigation

Investigated: 31 Oct 2026, 17:05 GMT (read-only; nothing in Vercel, GitHub settings, workflows or git was changed).
Trigger: push of `main` 4ca43ad → 240b30f at 31 Oct 2026 11:09 GMT. CI run 41195687361 **failed** (E2E), yet Vercel created a **Production** deployment for 240b30f at 11:11:18 GMT.

Labels used below: **VERIFIED** (seen directly in GitHub API / git / public HTTP), **INFERRED** (strong conclusion from verified data), **NOT VERIFIABLE** (needs the Vercel dashboard or a Vercel token).

---

## 1. Why Vercel deployed main straight to production

**VERIFIED — every main push gets a Vercel Production deployment; there are no Preview deployments at all.**

- `GET /repos/Nithinbonagiri123/Career-Ireland-/deployments` returns 82 deployments since 27 Aug 2026 18:55 GMT: 81 with environment `Production` (all created by `vercel[bot]`), 1 with `production` (id 6623984887, sha 98cca63, created by `Nithinbonagiri123`, task `deploy`, 23 Sep 2026 20:41 GMT — a manual/API deploy, not the promote workflow). **Zero** `Preview` deployments.
- Every ref is either a main commit SHA or `main`. The only branch on the remote is `main`.
- None were created by GitHub Actions through the Promote workflow (it has never run — see §3).

Latest 20 deployments (all `Production`, all `vercel[bot]`) correlated with the CI run for the same SHA:

| SHA | Vercel deploy created (GMT) | CI result |
|---|---|---|
| 240b30f | 31 Oct 2026 11:11:18 | **failure** (41195687361) |
| 4ca43ad | 22 Oct 2026 22:55:46 | success |
| 36f7cef | 22 Oct 2026 20:33:47 | success |
| 19b96ec | 22 Oct 2026 19:11:17 | **failure** |
| 1ff7664 | 21 Oct 2026 20:45:32 | **failure** |
| b3ec371 | 21 Oct 2026 20:28:49 | **failure** |
| de3da4b | 19 Oct 2026 21:08:59 | **failure** |
| cf81447 | 19 Oct 2026 18:34:38 | success |
| ab79a0e | 19 Oct 2026 17:31:43 | **failure** |
| 68b1336 | 19 Oct 2026 14:48:24 | **failure** |
| aeaf3be | 18 Oct 2026 23:18:33 | **failure** |
| b92ce57 | 18 Oct 2026 22:43:59 | **failure** |
| e665f5a | 17 Oct 2026 01:42:03 | success |
| aa2466e | 17 Oct 2026 01:27:30 | **failure** |
| e68ec1b | 15 Oct 2026 21:27:56 | success |
| 257d1c5 | 15 Oct 2026 21:26:12 | success |
| 278a266 | 14 Oct 2026 21:20:14 | success |
| be2c705 | 14 Oct 2026 20:47:42 | success |
| 421908e | 11 Oct 2026 19:21:31 | success |
| 5ff145e | 3 Oct 2026 13:29:25 | no CI run recorded |

**VERIFIED — Vercel does not wait for CI.** Timeline on 240b30f (commit statuses + check runs):

| Time (GMT, 31 Oct 2026) | Event |
|---|---|
| 11:09:30 | commit 240b30f authored/pushed |
| 11:09:37 | `Vercel` status `pending` — "Vercel is deploying your app" |
| 11:09:38 / 11:09:39 | CI `Verify` / `E2E` check runs start |
| 11:11:18 | `Vercel` status `success`; GitHub deployment 7457810172, env `Production`, environment_url `https://career-ireland-p7zs27bh2-nithinbonagiri123s-projects.vercel.app` |
| 11:12:26 | `Verify` success |
| 11:49:53 | `E2E` **failure** — 38 min after the build was already in production |

**VERIFIED — 240b30f is what customers are served.** At 31 Oct 2026 17:05 GMT, `https://career-ireland.vercel.app/login` (repo homepage) references exactly the same 19 `/_next/static/...` assets as the 240b30f deployment URL, and a different set from the 4ca43ad deployment URL.

**Why (root cause):**
1. **INFERRED (very strong)** — Vercel's Production Branch is still `main`. The one-time prerequisite in `promote-production.yml` (Production Branch = `production-gate`) was never applied: deployments after that workflow landed (commit 317e5e7, 21 Oct 2026 21:26 BST) are still `Production` with no `Preview` deployments.
2. **VERIFIED** — "Auto-assign Custom Production Domains" is effectively ON (a new production build replaced the live one without anyone promoting it).
3. **VERIFIED** — The old safety net is gone. Until 0a688b9 (27 Oct 2026 16:18 GMT), `deploy.yml` ran on every push, waited for CI and, when CI failed, ran "Rollback Vercel if db-push failed", which re-promoted the previous build via the Vercel API (log of run 39837742102: "✓ Rolled back live production to dpl_HknL…", exit 1 by design). So failed builds were live for ~25–40 min, then rolled back. 0a688b9 made `deploy.yml` manual-only and retired the rollback job, but the matching Vercel setting was never changed. 240b30f was the first push after that commit (one push carried all 19 commits 7450c36…240b30f), so it is the first failed-CI build that **stayed** live.
4. `vercel.json` (committed) has only `crons` — no `git.deploymentEnabled`, no `github.autoAlias`. Nothing in the repo stops Vercel's default behaviour.

Mitigating fact (**VERIFIED**): `git diff 4ca43ad 240b30f -- src/lib/db/migrations` is empty, so this release needs no schema change; the live code is not running against a missing migration.

## 2. Current Vercel Production Branch setting

- **INFERRED:** Production Branch = `main`, auto-assign of production domains ON. Basis: 81/81 `vercel[bot]` deployments from main are `Production`; zero `Preview`; live domain serves the newest main build without a promote.
- **VERIFIED:** `vercel.json` has no git/branch deployment config.
- **NOT VERIFIABLE without the Vercel dashboard/token:** the exact Branch Tracking value, the Auto-assign toggle, whether Deployment Checks are configured (none are acting), Deployment Protection, the plan (a commit message, "Hobby plan limit", suggests **Hobby**), and the production custom-domain list.

## 3. `production-gate` branch and the Promote workflow

- **VERIFIED:** `production-gate` does **not** exist (`git ls-remote origin` and `GET /branches` show only `main`). Nothing in the repo ever pushes to it; the design has production change only by Vercel API promotion.
- **VERIFIED:** "Promote to production" (workflow id 392146343, active) has **never run** (`gh run list --workflow promote-production.yml` is empty).
- **VERIFIED:** "Deploy" has not run since it became manual. All 20 listed runs are `push` events on the old version (last one 22 Oct 2026 22:54 GMT, 4ca43ad).

How `promote-production.yml` works (**VERIFIED** by reading it):
- `workflow_dispatch` only, inputs `sha` (full 40 chars) and `confirm` (= `PROMOTE`). Must run from main, by the repo owner.
- Gate 1/1b: `Verify` and `E2E` check runs on that SHA must be `success` (lewagon/wait-on-check-action, pinned).
- Gate 2: asks the Vercel API for the current READY `target=production` deployment. If migrations changed between that SHA and the requested SHA, it requires a successful Deploy run for that SHA whose "Apply (only the reviewed set)" step succeeded.
- Gate 3: finds a READY Vercel deployment whose `meta.githubCommitSha` matches.
- Promote: `POST https://api.vercel.com/v10/projects/$VERCEL_PROJECT_ID/promote/$DEP_ID?teamId=$VERCEL_ORG_ID`. It **only calls the Vercel API**; it does not push to `production-gate`.
- Then it polls up to 5 min until the newest READY production deployment reports that SHA.

Secrets and variables (names only; values are never returned by the API) — **VERIFIED:**
- Repository secrets (6): `PROD_AUTH_SECRET`, `PROD_AUTH_URL`, `PROD_DATABASE_URL`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VERCEL_TOKEN` (created 22 Sep 2026; `VERCEL_TOKEN` updated 23 Sep 2026 21:20 GMT). Everything Promote needs exists by name.
- Repository variables: **0**. So `PROD_MIGRATIONS_ENABLED` (kill switch) and `PROD_DB_HOST_SHA256` (needed by Deploy) are unset.

**Is manual promotion configured and functional?** **No, not as an enforced control.**
- It is optional today: production updates without it, because Vercel's Production Branch is main.
- **NOT VERIFIABLE:** whether `VERCEL_TOKEN` is still valid or correctly scoped, and whether the IDs match (the old rollback call worked on 22 Oct 2026, which suggests they did then).
- **Risk, not verified:** after the switch to `production-gate`, main builds become **Preview** deployments. Vercel documents that promoting a *preview* means a full rebuild with production env vars (dashboard/CLI confirm this, "will result in a new production deployment"). Whether the raw `v10/.../promote/{id}` endpoint accepts a preview deployment, or rejects it, is not confirmed. Test once with a known-good SHA before relying on it.
- **Blocker for releases that change migrations:** Gate 2 needs a successful Deploy apply run, and Deploy cannot run while `PROD_MIGRATIONS_ENABLED` and `PROD_DB_HOST_SHA256` are unset. Any release that touches `src/lib/db/migrations` can't be promoted until migrations are enabled. That is by design, but it means a schema release will stall.
- **Design caveat (if you choose staged production instead, option B below):** Gate 2 and the final "Confirm production serves this SHA" step read "the newest READY `target=production` deployment" as "what is live". With staged production builds, the newest one is the *staged* build, not the live one. Gate 2 could then wrongly skip the migration check, and the confirm step could report success without a real promotion. Fix the workflow before using option B with it.

## 4. Is CI required before deployment?

All **VERIFIED** unless marked:
- Branch protection on `main`: none (`GET /branches/main/protection` → 404 "Branch not protected").
- Rulesets: none (`GET /rulesets` → `[]`; `GET /rules/branches/main` → `[]`).
- Required status checks: none.
- GitHub environments: one, `Production` (auto-created by Vercel, 27 Aug 2026), with `protection_rules: []` and `deployment_branch_policy: null`.
- Repository visibility: **public** (`private: false`), owner is a personal User account. Branch protection, rulesets and environment required reviewers are **available on GitHub Free for public repos**. The note in `deploy.yml` ("GitHub Free + private repository … required reviewers are unavailable") is out of date for the current public visibility. (Being public also has its own security implications for this codebase; out of scope here.)
- CI (`ci.yml`) runs on push and PR to main. It gates nothing; Vercel ignores it.
- **INFERRED:** Vercel has no CI wait configured. It built 1 s after the push and went live before `Verify` finished. Deployment Checks would have held the build. **NOT VERIFIABLE** without the dashboard: whether any are configured but not taking effect.
- Workflow is direct pushes to main (40/40 recent CI runs are `push:main`, no PRs). So branch protection only helps if you also adopt PRs or block direct pushes.

## 5. Options to stop failed CI from reaching production (none applied)

Ranked by fit for a 3-person team on cheapest-viable infra.

### A. (Recommended) Vercel Deployment Checks requiring GitHub `Verify` + `E2E`
Vercel docs (fetched 31 Oct 2026, page last updated 11 Aug 2026, /docs/deployment-checks): "When you add Deployment Checks to a project, Vercel will hold each production deployment until all required checks pass before assigning it to your custom production domains." It supports **GitHub Checks** ("Vercel reads commit statuses and check run results"). Bypass: "Force Promote" on the deployment page.
- **Owner steps:** Vercel → project `career-ireland` → Settings → Environments → Production: confirm automatic aliasing / "Auto-assign Custom Production Domains" is **on** (a stated prerequisite). → Settings → Build and Deployment → **Deployment Checks** → Add Checks → provider **GitHub** → select `Verify` and `E2E` → Add. Push a commit and confirm the deployment shows "waiting for checks".
- **Effect:** main still builds production deployments, but the domain moves only after CI is green. A red CI leaves the previous build live. No workflow changes are needed, and no Vercel token is needed for normal releases.
- **Trade-offs:** release waits for E2E (~20–40 min). **NOT VERIFIED:** plan availability on Hobby (the docs page names no plan). Check names must stay unique. The docs warn that duplicate job names across workflows collide; today `Verify`/`E2E` exist only in `ci.yml`. It does not enforce the migration gate; keep doing the manual Deploy before pushing schema changes.
- **Rollback:** remove the checks in the same settings panel.

### B. Production Branch = `production-gate` + Promote workflow (the design already in the repo)
- **Owner steps:** Vercel → Settings → Environments → Production → Branch Tracking → set branch to `production-gate` → Save. You don't need to create the branch for the switch. Then promote via GitHub → Actions → "Promote to production" → Run workflow (from main) → full SHA + `PROMOTE`.
- **Effect:** main pushes become Preview builds. Production changes only when the owner promotes a SHA with green CI (and the migration gate).
- **Trade-offs:** every release is a manual step. It depends on `VERCEL_TOKEN` validity (not verifiable here). Unverified whether the v10 promote endpoint accepts preview deployments (see §3); dry-run with a known-good SHA. Preview builds use **Preview** env vars, and production env vars apply only on promotion/rebuild. Cron jobs (`vercel.json`) run only on production. Releases with migrations are blocked until the Deploy kill switch is deliberately enabled.
- **Rollback:** set Branch Tracking back to `main`. Instant Rollback in the Vercel dashboard is available either way.

### C. Staged production (turn off auto-assign)
- **Owner steps:** Vercel → Settings → Environments → Production → Branch Tracking → turn **off** "Auto-assign Custom Production Domains". Promote via Deployments → … → Promote (no rebuild), or the Promote workflow *after fixing* the "latest production = live" assumption (§3 caveat).
- **Effect:** main builds production-target deployments that never go live automatically.
- **Trade-offs:** manual release. Without the workflow there is no automatic CI check: a human must check CI before clicking Promote. Conflicts with A (A needs auto-assign on).
- **Rollback:** turn the toggle back on.

### D. GitHub branch protection / ruleset requiring CI, plus PRs
- **Owner steps:** GitHub → Settings → Rules → Rulesets → New branch ruleset → target `main` → "Require a pull request before merging", "Require status checks to pass" → add `Verify`, `E2E` → "Block force pushes". Optionally don't allow the owner to bypass. Available on Free because the repo is public.
- **Effect:** code reaches main only after green CI on the PR. The Vercel production build then follows a tested merge.
- **Trade-offs:** changes the daily workflow (no direct pushes). CI on the PR head isn't necessarily the merged SHA unless you require up-to-date branches. On its own it does nothing about Vercel (an admin bypass or a direct push still deploys). Best combined with A.
- **Rollback:** disable or delete the ruleset.

### E. Disable automatic Git deployments entirely
- **Steps:** commit `"git": {"deploymentEnabled": {"main": false}}` (or `false`) in `vercel.json`, or disconnect Git in Vercel → Settings → Git. Deploy only with the CLI/API from a workflow.
- **Effect:** nothing builds from pushes.
- **Trade-offs:** you lose preview builds, so the Promote workflow's Gate 3 would find no build. This requires a new build step in Actions and more maintenance. Not recommended for this team.
- **Rollback:** remove the key, or reconnect Git.

**Suggested combination:** A now (one dashboard change, blocks the exact failure that happened). Add D when the team moves to PRs. Keep the Promote/Deploy workflows for schema releases, or retire B if A is adopted, so there's one release path rather than two half-configured ones.

**Immediate decision for the owner (not done):** 240b30f (failed E2E) is live now. Options: Vercel → Deployments → 4ca43ad build (`career-ireland-32pv7yjvn-…`) → Instant Rollback, or fix forward. No schema difference between the two, so rollback is schema-safe. Note that after an Instant Rollback, Vercel stops auto-assigning new production builds until you undo the rollback.

## 6. Last CI runs on main vs production (VERIFIED)

| CI run | SHA | CI | In Production? |
|---|---|---|---|
| 41195687361 | 240b30f | failure (E2E) | yes, 31 Oct 2026 11:11:18 GMT, **currently live** |
| 39868262201 | 4ca43ad | success | yes, 22 Oct 2026 22:55:46 GMT |
| 39849782891 | 36f7cef | success | yes, 22 Oct 2026 20:33:47 GMT |
| 39837741979 | 19b96ec | failure | yes, 22 Oct 2026 19:11:17 GMT. Old rollback job re-promoted the previous build at 19:48:51 GMT |
| 39672926491 | 1ff7664 | failure | yes, 21 Oct 2026 20:45:32 GMT (old rollback job ran) |

Over the last 20 deployments, 10 were failed-CI builds that went to Production. All but 240b30f were followed by the old automatic rollback request.
