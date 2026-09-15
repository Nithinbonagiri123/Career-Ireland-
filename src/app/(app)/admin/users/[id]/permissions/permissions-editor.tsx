'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, RotateCcw, Save } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { easeStandard, FadeUp } from '@/components/motion/motion-primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  BUSINESSES,
  type Business,
  encodeKey,
  MODULES,
  type PermissionKey,
  VERBS,
  type Verb,
} from '@/lib/auth/permissions';
import {
  resetUserPermissionsAction,
  updateUserPermissionsAction,
} from '@/modules/permissions/actions';
import type { UserPermissionSnapshot } from '@/modules/permissions/service';

/**
 * Interactive permission matrix. Renders one Card per Business with a
 * grid of (module × verb) checkboxes.
 *
 * Cascade rules baked into the UI so the DB row set stays minimal:
 *   - Checking a higher verb (e.g. `manage`) auto-checks every lower
 *     verb on the same row.
 *   - Unchecking a lower verb (e.g. `view`) auto-unchecks every higher
 *     verb on the same row (they'd be meaningless without view).
 *
 * The service normalises again on save, so a hand-crafted payload
 * can't create weird states.
 */

const WORKSPACE_LABELS: Record<Business, string> = {
  main: 'Main Dashboard',
  candidate_services: 'Candidate Services',
  recruitment: 'Recruitment',
  immigration: 'Immigration',
};

const VERB_LABELS: Record<Verb, string> = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  manage: 'Manage',
};

const VERB_HELP: Record<Verb, string> = {
  view: 'See the page and its data',
  create: 'Add new records',
  edit: 'Modify existing records',
  delete: 'Soft-archive or permanently remove',
  manage: 'Full control including granting perms',
};

const MODULE_LABELS: Record<string, string> = {
  overview: 'Overview',
  activities: 'Activities',
  hr_board: 'HR Board',
  admin: 'Admin',
  accounts: 'Accounts',
  dashboard: 'Dashboard',
  leads: 'Leads',
  candidates: 'Candidates',
  documents: 'Documents',
  applications: 'Applications',
  engagements: 'Engagements',
  payments: 'Payments',
  employers: 'Employers',
  requisitions: 'Requisitions',
  matching: 'Matching',
  interviews: 'Interviews',
  campaigns: 'Campaigns',
  prospects: 'Prospects',
  placements: 'Placements',
  cases: 'Cases',
};

const VERB_LEVEL: Record<Verb, number> = {
  view: 1,
  create: 2,
  edit: 3,
  delete: 4,
  manage: 5,
};

export function PermissionsEditor({ snapshot }: { snapshot: UserPermissionSnapshot }) {
  const readOnly = snapshot.isOwner;
  const reduce = useReducedMotion();

  // Local state — mutated by the checkboxes, compared against snapshot
  // on save to compute the grants/revokes delta.
  const [current, setCurrent] = useState<Set<string>>(new Set(snapshot.granted));
  const [pending, startTransition] = useTransition();

  const toggle = (business: Business, module: string, verb: Verb, next: boolean) => {
    if (readOnly) return;
    setCurrent((prev) => {
      const nextSet = new Set(prev);
      const targetLevel = VERB_LEVEL[verb];
      if (next) {
        // Check → also check every lower verb on the same row (cascade).
        for (const v of VERBS) {
          if (VERB_LEVEL[v] <= targetLevel) {
            nextSet.add(encodeKey(business, module, v));
          }
        }
      } else {
        // Uncheck → also uncheck every higher verb on the same row.
        for (const v of VERBS) {
          if (VERB_LEVEL[v] >= targetLevel) {
            nextSet.delete(encodeKey(business, module, v));
          }
        }
      }
      return nextSet;
    });
  };

  const dirty = useMemo(() => {
    if (current.size !== snapshot.granted.size) return true;
    for (const key of current) if (!snapshot.granted.has(key)) return true;
    return false;
  }, [current, snapshot.granted]);

  const save = () => {
    const grants: PermissionKey[] = [];
    const revokes: PermissionKey[] = [];
    for (const key of current) {
      if (!snapshot.granted.has(key)) {
        const [b, m, v] = key.split('.') as [Business, string, Verb];
        grants.push({ business: b, module: m, verb: v });
      }
    }
    for (const key of snapshot.granted) {
      if (!current.has(key)) {
        const [b, m, v] = key.split('.') as [Business, string, Verb];
        revokes.push({ business: b, module: m, verb: v });
      }
    }
    startTransition(async () => {
      const r = await updateUserPermissionsAction({
        targetUserId: snapshot.userId,
        grants,
        revokes,
      });
      if (r.ok) {
        toast.success(`Saved — ${grants.length} granted, ${revokes.length} revoked`);
      } else {
        toast.error(r.error.message);
      }
    });
  };

  const reset = () => {
    if (
      !window.confirm(
        `Reset permissions to the ${snapshot.role} preset? Any manual grants and revokes will be lost.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const r = await resetUserPermissionsAction(snapshot.userId);
      if (r.ok) {
        toast.success(`Reset to ${snapshot.role} preset — ${r.data.count} grants`);
        // The page will revalidate; the fresh snapshot re-mounts this
        // component with the new set.
      } else {
        toast.error(r.error.message);
      }
    });
  };

  return (
    <>
      {readOnly && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-3 text-xs">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
          <span>
            <strong className="font-medium">This user is the owner.</strong> Owner has every
            permission implicitly and cannot be edited from here. To transfer ownership run{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
              pnpm tsx scripts/set-owner.ts &lt;email&gt;
            </code>{' '}
            in a shell.
          </span>
        </div>
      )}

      <div className="space-y-4">
        {BUSINESSES.map((business, bIdx) => (
          <FadeUp key={business} delay={0.04 + bIdx * 0.02}>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{WORKSPACE_LABELS[business]}</CardTitle>
                  <Badge variant="outline" className="rounded-full text-[10px]">
                    {MODULES[business].length} modules
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        <th className="pb-2 pr-4">Module</th>
                        {VERBS.map((v) => (
                          <th key={v} className="pb-2 px-3 text-center" title={VERB_HELP[v]}>
                            {VERB_LABELS[v]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {MODULES[business].map((module) => (
                        <tr key={module} className="border-b last:border-b-0">
                          <td className="py-3 pr-4 text-sm font-medium">
                            {MODULE_LABELS[module] ?? module}
                          </td>
                          {VERBS.map((verb) => {
                            const key = encodeKey(business, module, verb);
                            const checked = readOnly ? true : current.has(key);
                            return (
                              <td key={verb} className="px-3 py-3 text-center">
                                <Checkbox
                                  checked={checked}
                                  disabled={readOnly}
                                  onCheckedChange={(v) =>
                                    toggle(business, module, verb, v === true)
                                  }
                                  aria-label={`${MODULE_LABELS[module] ?? module} ${VERB_LABELS[verb]}`}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </FadeUp>
        ))}
      </div>

      {!readOnly && (
        // The pill reshapes when `dirty` flips: clean state shows only the
        // always-available Reset; dirty state adds an "Unsaved changes"
        // label and a Save button. `layout` handles the width change via
        // FLIP (transform-based, GPU-friendly). Reduced motion drops the
        // enter/exit translation but keeps the fade.
        <motion.div
          layout
          transition={{ duration: 0.2, ease: easeStandard }}
          className="sticky bottom-4 z-20 mx-auto mt-6 flex w-fit items-center gap-2 rounded-full border bg-popover px-4 py-2 shadow-xl ring-1 ring-foreground/10"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {dirty && (
              <motion.span
                key="dirty-label"
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: easeStandard }}
                className="text-xs text-muted-foreground"
              >
                Unsaved changes
              </motion.span>
            )}
          </AnimatePresence>
          <Button variant="outline" size="sm" onClick={reset} disabled={pending} className="h-8">
            <RotateCcw className="mr-1.5 size-3.5" />
            Reset to {snapshot.role} preset
          </Button>
          <AnimatePresence mode="popLayout" initial={false}>
            {dirty && (
              <motion.div
                key="save"
                layout
                initial={{ opacity: 0, transform: reduce ? 'none' : 'translateX(8px)' }}
                animate={{ opacity: 1, transform: 'translateX(0px)' }}
                exit={{ opacity: 0, transform: reduce ? 'none' : 'translateX(8px)' }}
                transition={{ duration: 0.18, ease: easeStandard }}
              >
                <Button size="sm" onClick={save} disabled={pending} className="h-8">
                  <Save className="mr-1.5 size-3.5" />
                  Save
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </>
  );
}
