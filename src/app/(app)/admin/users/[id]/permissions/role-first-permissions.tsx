'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Settings2, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { easeStandard } from '@/components/motion/motion-primitives';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import {
  BUSINESSES,
  type Business,
  encodeKey,
  MODULES,
  presetForRole,
  type Role,
  VERBS,
  type Verb,
} from '@/lib/auth/permissions';
import { resetUserPermissionsAction } from '@/modules/permissions/actions';
import type { UserPermissionSnapshot } from '@/modules/permissions/service';
import { changeUserRoleAction } from '@/modules/users/actions';
import { PermissionsEditor } from './permissions-editor';

/**
 * Phase 4 blueprint §10.1 — Role-first permissions UI.
 *
 * The raw matrix (30+ checkboxes) is intimidating for non-technical
 * admins. This wrapper puts a Role dropdown and a plain-English
 * "what this user can do" summary front-and-centre, with the full
 * matrix tucked behind an Advanced disclosure for the rare case
 * where someone needs to tweak a specific verb.
 *
 * §10.2 is wired here too, lightly: when the live grants diverge
 * from the role preset we flag "Modified" so the admin knows the
 * matrix isn't the vanilla preset. One-click reset lives in the
 * existing <PermissionsEditor>.
 */

const WORKSPACE_LABELS: Record<Business, string> = {
  main: 'Main Dashboard',
  candidate_services: 'Candidate Services',
  recruitment: 'Recruitment',
  immigration: 'Immigration',
};

/** The six roles the admin UI is allowed to assign. Mirrors
 *  modules/users/schemas RoleSchema; portal roles are deliberately
 *  excluded from the dropdown. */
type AssignableRole =
  | 'ADMIN'
  | 'MANAGER'
  | 'RECRUITER'
  | 'FINANCE'
  | 'DOCUMENT_SPECIALIST'
  | 'STAFF';

const ROLE_OPTIONS: AssignableRole[] = [
  'ADMIN',
  'MANAGER',
  'RECRUITER',
  'FINANCE',
  'DOCUMENT_SPECIALIST',
  'STAFF',
];

const ROLE_SUMMARY: Record<Role, string> = {
  ADMIN: 'Full control everywhere, including user and permission management.',
  MANAGER: 'Can view, create, and edit across every area. No delete, no permissions.',
  RECRUITER: 'Can work the recruitment pipeline end-to-end.',
  FINANCE: 'Can raise, verify, and refund invoices across every area; read-only on other records.',
  DOCUMENT_SPECIALIST: 'Can manage candidate documents and immigration case paperwork.',
  STAFF: 'Nothing until an admin grants specific permissions.',
  CANDIDATE: 'Portal user — not applicable here.',
  EMPLOYER: 'Portal user — not applicable here.',
};

const VERB_LEVEL: Record<Verb, number> = {
  view: 1,
  create: 2,
  edit: 3,
  delete: 4,
  manage: 5,
};

export function RoleFirstPermissions({ snapshot }: { snapshot: UserPermissionSnapshot }) {
  const router = useRouter();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Compare live grants against the preset for the current role so we
  // can flag "Modified from preset" without a server round-trip.
  const divergence = useMemo(() => {
    const presetSet = new Set(
      presetForRole(snapshot.role).map((k) => encodeKey(k.business, k.module, k.verb)),
    );
    if (presetSet.size !== snapshot.granted.size) return true;
    for (const k of snapshot.granted) if (!presetSet.has(k)) return true;
    return false;
  }, [snapshot.granted, snapshot.role]);

  // Plain-English summary per business — pick the loudest signal we can
  // give an admin: full access, limited verbs, a shortlist of modules,
  // or no access at all.
  const summaryByBusiness = useMemo(() => {
    return BUSINESSES.map((business) => ({
      business,
      line: summarizeBusiness(business, snapshot.granted),
    }));
  }, [snapshot.granted]);

  const onRoleChange = (nextRole: AssignableRole) => {
    if (snapshot.isOwner) return;
    if (nextRole === snapshot.role) return;
    const confirmed = window.confirm(
      `Set role to ${nextRole} and reset permissions to the ${nextRole} preset? Any manual grants will be cleared.`,
    );
    if (!confirmed) return;
    startTransition(async () => {
      // Role change invalidates existing sessions server-side. Reset
      // runs second so the preset for the NEW role is applied.
      const roleResult = await changeUserRoleAction({
        userId: snapshot.userId,
        role: nextRole,
      });
      if (!roleResult.ok) {
        toast.error(roleResult.error.message);
        return;
      }
      const resetResult = await resetUserPermissionsAction(snapshot.userId);
      if (!resetResult.ok) {
        toast.error(resetResult.error.message);
        return;
      }
      toast.success(`Role set to ${nextRole} and permissions reset to its preset.`);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Role</CardTitle>
            {divergence && !snapshot.isOwner && (
              <Badge variant="warning">Modified from preset</Badge>
            )}
          </div>
          <ShieldCheck className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[220px_1fr] sm:items-center">
            <Select
              value={snapshot.role}
              disabled={snapshot.isOwner || pending}
              onChange={(e) => onRoleChange(e.target.value as AssignableRole)}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">{ROLE_SUMMARY[snapshot.role]}</p>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Changing the role resets this user's permissions to the matching preset and ends their
            current session.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">This user can…</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {summaryByBusiness.map((row) => (
              <li
                key={row.business}
                className="flex flex-col gap-0.5 border-b pb-2 last:border-b-0 last:pb-0 sm:flex-row sm:items-baseline sm:gap-3"
              >
                <span className="min-w-[180px] text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {WORKSPACE_LABELS[row.business]}
                </span>
                <span>{row.line}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <div className="flex items-center gap-2">
              <Settings2 className="size-4 text-muted-foreground" />
              <CardTitle className="text-base">Advanced — individual grants</CardTitle>
            </div>
            <ChevronDown
              className={`size-4 shrink-0 text-muted-foreground transition-transform ${
                advancedOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
          <p className="mt-1 text-xs text-muted-foreground">
            Fine-grained matrix of (business × module × verb). Only open this if the role preset
            doesn't quite fit — most teams never need to.
          </p>
        </CardHeader>
        <AnimatePresence initial={false}>
          {advancedOpen && (
            <motion.div
              key="advanced"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: easeStandard }}
              className="overflow-hidden"
            >
              <CardContent>
                <PermissionsEditor snapshot={snapshot} />
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {snapshot.isOwner && (
        <p className="text-center text-xs text-muted-foreground">
          Owner bypass is active for this user — the role dropdown is disabled.
        </p>
      )}
    </div>
  );
}

/**
 * Translate the user's grants in one business into a single plain-
 * English sentence. The levels mirror the admin's mental model:
 *   - no access
 *   - view only
 *   - view + create + edit (the common "collaborator" shape)
 *   - full access (manage)
 *   - a mixed state → list of modules
 */
function summarizeBusiness(business: Business, granted: Set<string>): string {
  const modules = MODULES[business] as readonly string[];
  if (modules.length === 0) return 'No modules.';
  const perModule = new Map<string, number>();
  let moduleWithAny = 0;
  for (const module of modules) {
    let topVerb = 0;
    for (const verb of VERBS) {
      if (granted.has(encodeKey(business, module, verb))) {
        topVerb = Math.max(topVerb, VERB_LEVEL[verb]);
      }
    }
    perModule.set(module, topVerb);
    if (topVerb > 0) moduleWithAny += 1;
  }
  if (moduleWithAny === 0) return 'No access.';
  if (moduleWithAny === modules.length) {
    const lowest = Math.min(...perModule.values());
    if (lowest >= VERB_LEVEL.manage) return 'Full access to every module.';
    if (lowest >= VERB_LEVEL.edit) return 'Can view, create, and edit every module.';
    if (lowest >= VERB_LEVEL.create) return 'Can view and create every module.';
    return 'Can view every module.';
  }
  const moduleList = Array.from(perModule.entries())
    .filter(([, level]) => level > 0)
    .map(([module]) => module)
    .join(', ');
  return `Access to ${moduleList}.`;
}
