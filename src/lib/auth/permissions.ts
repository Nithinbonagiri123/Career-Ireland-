/**
 * Fine-grained permission model for the workspace-split rebuild.
 *
 * Vocabulary:
 *   - **Business**   = a top-level workspace (main / candidate_services /
 *                       recruitment / immigration)
 *   - **Module**     = a page or feature area inside a business
 *   - **Verb**       = the level of access (view / create / edit / delete /
 *                       manage)
 *
 * Permission keys are stored in `user_permissions` as `(business, module,
 * verb)`. Verbs cascade: `manage > delete > edit > create > view`. A row
 * granting `manage` implicitly satisfies `view`, `create`, `edit`, and
 * `delete` checks — so we don't need to store the implied grants.
 *
 * The owner (`users.is_owner = true`) bypasses every check. `hasPermission`
 * doesn't know about the owner concept; the wrapper `requirePermission` in
 * the auth session module does.
 */

export const BUSINESSES = ['main', 'candidate_services', 'recruitment', 'immigration'] as const;
export type Business = (typeof BUSINESSES)[number];

export const VERBS = ['view', 'create', 'edit', 'delete', 'manage'] as const;
export type Verb = (typeof VERBS)[number];

/**
 * Modules per business. Source of truth for the permissions editor UI and
 * for `hasPermission` validation. Add a new module here and the checkbox
 * matrix picks it up automatically.
 */
export const MODULES = {
  main: ['overview', 'activities', 'hr_board', 'admin', 'accounts'],
  candidate_services: [
    'dashboard',
    'leads',
    'candidates',
    'documents',
    'applications',
    'engagements',
    'payments',
  ],
  recruitment: [
    'dashboard',
    'employers',
    'requisitions',
    'matching',
    'interviews',
    'campaigns',
    'prospects',
    'placements',
  ],
  immigration: ['dashboard', 'cases', 'activities'],
} as const satisfies Record<Business, readonly string[]>;

export type ModuleOf<B extends Business> = (typeof MODULES)[B][number];

export type PermissionKey = {
  business: Business;
  module: string; // constrained by the caller — see the typed overloads below
  verb: Verb;
};

/** `manage > delete > edit > create > view` — larger number = more powerful. */
const VERB_LEVEL: Record<Verb, number> = {
  view: 1,
  create: 2,
  edit: 3,
  delete: 4,
  manage: 5,
};

/**
 * Encode a permission key as the "business.module.verb" string used for
 * fast lookup against the `granted` Set the session hands us.
 */
export function encodeKey(business: Business, module: string, verb: Verb): string {
  return `${business}.${module}.${verb}`;
}

/**
 * Does `granted` include a grant that satisfies `(business, module, verb)`?
 *
 * A grant satisfies the check if its verb level is >= the requested verb
 * level, and the (business, module) match exactly. This is the cascade
 * rule — a `manage` grant covers every lower verb.
 */
export function hasPermission(
  granted: Set<string>,
  business: Business,
  module: string,
  verb: Verb,
): boolean {
  const requiredLevel = VERB_LEVEL[verb];
  for (const candidate of VERBS) {
    if (VERB_LEVEL[candidate] < requiredLevel) continue;
    if (granted.has(encodeKey(business, module, candidate))) return true;
  }
  return false;
}

/**
 * Does the user have *any* permission (any verb) on the given business +
 * module? Used to gate visibility — a module with no view grant should not
 * appear in the sidebar at all.
 */
export function hasAnyPermission(
  granted: Set<string>,
  business: Business,
  module: string,
): boolean {
  return hasPermission(granted, business, module, 'view');
}

/**
 * Which businesses does the user have *any* access to? Drives the business
 * switcher dropdown — only shows workspaces the user can enter.
 */
export function reachableBusinesses(granted: Set<string>): Business[] {
  const found = new Set<Business>();
  for (const key of granted) {
    const [b] = key.split('.', 1);
    if (b && (BUSINESSES as readonly string[]).includes(b)) {
      found.add(b as Business);
    }
  }
  return BUSINESSES.filter((b) => found.has(b));
}

/**
 * Validate that a (business, module, verb) triple names a real permission
 * before writing to the DB. Prevents typos in the grant flow.
 */
export function isValidPermission(
  business: string,
  module: string,
  verb: string,
): business is Business {
  if (!(BUSINESSES as readonly string[]).includes(business)) return false;
  const modules = MODULES[business as Business] as readonly string[];
  if (!modules.includes(module)) return false;
  if (!(VERBS as readonly string[]).includes(verb)) return false;
  return true;
}

/**
 * Role → default permissions preset. Used when a user is first created;
 * the owner can then check/uncheck to customise. The preset is not the
 * source of truth — user_permissions is. Role stays on the record so the
 * "reset to role default" button on the permissions editor knows which
 * preset to reapply.
 *
 * Owner is not in this table — owners are marked with `is_owner = true`
 * and bypass the check entirely.
 */
export type Role =
  | 'ADMIN'
  | 'STAFF'
  | 'MANAGER'
  | 'RECRUITER'
  | 'DOCUMENT_SPECIALIST'
  | 'FINANCE'
  | 'CANDIDATE'
  | 'EMPLOYER';

export function presetForRole(role: Role): PermissionKey[] {
  switch (role) {
    case 'ADMIN':
      // Every verb on every module across every workspace. Effectively the
      // same as owner except an ADMIN can be revoked / re-scoped.
      return allBusinessesAllVerbs();
    case 'MANAGER':
      // View/Create/Edit everywhere; no Delete; no Manage.
      return everywhereWithVerbs(['view', 'create', 'edit']);
    case 'RECRUITER':
      return businessWithVerbs('recruitment', ['view', 'create', 'edit']);
    case 'DOCUMENT_SPECIALIST':
      // Docs + immigration cases (a document-heavy role in practice).
      return [
        ...modulesWithVerbs('candidate_services', ['documents'], ['view', 'create', 'edit']),
        ...modulesWithVerbs('immigration', ['cases'], ['view', 'create', 'edit']),
      ];
    case 'FINANCE':
      // Billing / payments across Candidate Services + Main Accounts.
      return [
        ...modulesWithVerbs(
          'candidate_services',
          ['payments', 'engagements'],
          ['view', 'create', 'edit'],
        ),
        ...modulesWithVerbs('main', ['accounts'], ['view', 'create', 'edit']),
      ];
    case 'STAFF':
      // Deliberately empty — a fresh STAFF user has nothing until the
      // owner grants it. Prevents accidental over-access for utility
      // accounts.
      return [];
    case 'CANDIDATE':
    case 'EMPLOYER':
      // Portal users never touch the internal CRM. They authenticate via
      // the same users table but every permission check should return
      // false for them.
      return [];
  }
}

function allBusinessesAllVerbs(): PermissionKey[] {
  const out: PermissionKey[] = [];
  for (const business of BUSINESSES) {
    for (const module of MODULES[business] as readonly string[]) {
      for (const verb of VERBS) {
        out.push({ business, module, verb });
      }
    }
  }
  return out;
}

function everywhereWithVerbs(verbs: readonly Verb[]): PermissionKey[] {
  const out: PermissionKey[] = [];
  for (const business of BUSINESSES) {
    for (const module of MODULES[business] as readonly string[]) {
      for (const verb of verbs) {
        out.push({ business, module, verb });
      }
    }
  }
  return out;
}

function businessWithVerbs(business: Business, verbs: readonly Verb[]): PermissionKey[] {
  const out: PermissionKey[] = [];
  for (const module of MODULES[business] as readonly string[]) {
    for (const verb of verbs) {
      out.push({ business, module, verb });
    }
  }
  return out;
}

function modulesWithVerbs(
  business: Business,
  modules: readonly string[],
  verbs: readonly Verb[],
): PermissionKey[] {
  const out: PermissionKey[] = [];
  for (const module of modules) {
    for (const verb of verbs) {
      out.push({ business, module, verb });
    }
  }
  return out;
}
