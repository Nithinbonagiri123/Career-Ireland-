import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Bell,
  Briefcase,
  Building2,
  CalendarClock,
  CheckSquare,
  ClipboardList,
  Clock,
  Coins,
  FileText,
  GitMerge,
  Globe,
  GraduationCap,
  Home,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  MessagesSquare,
  Package,
  PlaneTakeoff,
  ScrollText,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  Tags,
  Trophy,
  UserCog,
  UserPlus,
  Users,
  Users2,
} from 'lucide-react';
import type { Business } from '@/lib/auth/permissions';

/**
 * Workspace-scoped nav. Each business owns its own sidebar; the current
 * workspace is resolved server-side (cookie → user record → default) and
 * only that workspace's `sections` render.
 *
 * `module` on each item is the permission key (see
 * `src/lib/auth/permissions.ts`). The sidebar filters items where the
 * current user has no `view` grant. Owner bypasses the filter.
 *
 * URLs are unchanged from the pre-redesign layout — the workspace concept
 * is display-only, so every existing bookmark and E2E test keeps working.
 */

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Permission module key. Used to gate visibility per user. */
  module: string;
};

export type NavSection = {
  label: string;
  items: NavItem[];
};

export type WorkspaceConfig = {
  key: Business;
  label: string;
  icon: LucideIcon;
  /** Short description for the switcher dropdown. */
  description: string;
  /** Where clicking the workspace in the switcher sends the user. */
  landingPath: string;
  sections: NavSection[];
};

export const WORKSPACES: Record<Business, WorkspaceConfig> = {
  main: {
    key: 'main',
    label: 'Main Dashboard',
    icon: Home,
    description: 'Overall business view — activities, HR, admin, accounts',
    landingPath: '/dashboard',
    sections: [
      {
        label: 'Overview',
        items: [
          { label: 'Overview', href: '/dashboard', icon: LayoutDashboard, module: 'overview' },
        ],
      },
      {
        label: 'Business',
        items: [
          {
            label: 'Activities',
            href: '/communications',
            icon: MessagesSquare,
            module: 'activities',
          },
          { label: 'HR Board', href: '/hr/admin', icon: Users2, module: 'hr_board' },
          { label: 'Admin', href: '/admin', icon: UserCog, module: 'admin' },
          { label: 'Accounts', href: '/payments', icon: Coins, module: 'accounts' },
          // Audit logs live under Admin already, but the owner uses this daily
          // to see what happened across the whole business — surfaced as a
          // top-level nav item so it's one click away.
          { label: 'Audit logs', href: '/admin/audit', icon: ShieldCheck, module: 'admin' },
        ],
      },
    ],
  },
  candidate_services: {
    key: 'candidate_services',
    label: 'Candidate Services',
    icon: Users,
    description: 'Leads, candidates, docs, payments',
    landingPath: '/dashboard/candidate-services',
    sections: [
      {
        label: 'Overview',
        items: [
          {
            label: 'Dashboard',
            href: '/dashboard/candidate-services',
            icon: LayoutDashboard,
            module: 'dashboard',
          },
        ],
      },
      {
        label: 'Pipeline',
        items: [
          { label: 'Leads', href: '/leads', icon: UserPlus, module: 'leads' },
          { label: 'Candidates', href: '/candidates', icon: Users, module: 'candidates' },
          { label: 'Documents', href: '/documents', icon: FileText, module: 'documents' },
          {
            label: 'Applications',
            href: '/applications',
            icon: ClipboardList,
            module: 'applications',
          },
        ],
      },
      {
        label: 'Commerce',
        items: [
          { label: 'Engagements', href: '/engagements', icon: Coins, module: 'engagements' },
          { label: 'Payments', href: '/payments', icon: Coins, module: 'payments' },
        ],
      },
    ],
  },
  recruitment: {
    key: 'recruitment',
    label: 'Recruitment',
    icon: Briefcase,
    description: 'Employers, requisitions, matching, placements',
    landingPath: '/dashboard/recruitment',
    sections: [
      {
        label: 'Overview',
        items: [
          {
            label: 'Dashboard',
            href: '/dashboard/recruitment',
            icon: LayoutDashboard,
            module: 'dashboard',
          },
        ],
      },
      {
        label: 'Demand',
        items: [
          { label: 'Employers', href: '/employers', icon: Building2, module: 'employers' },
          {
            label: 'Requisitions',
            href: '/requisitions',
            icon: Briefcase,
            module: 'requisitions',
          },
        ],
      },
      {
        label: 'Match & hire',
        items: [
          { label: 'Matching', href: '/matching', icon: SearchCheck, module: 'matching' },
          { label: 'Interviews', href: '/interviews', icon: CalendarClock, module: 'interviews' },
          { label: 'Placements', href: '/placements', icon: Trophy, module: 'placements' },
        ],
      },
      {
        label: 'Sourcing',
        items: [
          { label: 'Campaigns', href: '/campaigns', icon: Sparkles, module: 'campaigns' },
          { label: 'Prospects', href: '/prospects', icon: UserPlus, module: 'prospects' },
        ],
      },
    ],
  },
  immigration: {
    key: 'immigration',
    label: 'Immigration',
    icon: PlaneTakeoff,
    description: 'Cases and activities',
    landingPath: '/dashboard/immigration',
    sections: [
      {
        label: 'Overview',
        items: [
          {
            label: 'Dashboard',
            href: '/dashboard/immigration',
            icon: LayoutDashboard,
            module: 'dashboard',
          },
        ],
      },
      {
        label: 'Work',
        items: [
          { label: 'Cases', href: '/immigration', icon: PlaneTakeoff, module: 'cases' },
          { label: 'Activities', href: '/tasks', icon: CheckSquare, module: 'activities' },
        ],
      },
    ],
  },
};

/**
 * User-scoped items that appear on every workspace's sidebar footer.
 * They're not permission-gated — every authenticated user gets to log
 * their attendance and change their own password.
 */
export const USER_SCOPED_ITEMS: NavItem[] = [
  { label: 'My attendance', href: '/hr', icon: Clock, module: '_user' },
  { label: 'Security', href: '/account/security', icon: KeyRound, module: '_user' },
];

/**
 * Reverse mapping: URL → owning workspace, derived from the nav-config
 * above so it stays in sync automatically when items move.
 *
 * The workspace switcher (cookie / DB) picks the *default* workspace,
 * but if the user directly navigates to a workspace-scoped URL (bookmark,
 * shared link) the sidebar should follow the URL — that's what
 * `workspaceFromPathname` enables.
 *
 * Routes not in any workspace nav (e.g. `/tasks`, `/reports`) are
 * cross-cutting and belong to `main`. Returns `null` for non-app paths
 * so callers can fall through to the existing cookie/DB precedence.
 *
 * When two workspaces claim the same URL (e.g. `/payments` is under
 * Main → Accounts *and* Candidate Services → Payments), the first
 * workspace declared in `WORKSPACES` wins. `main` is declared first, so
 * shared URLs bias to main — this matches the pre-redesign behaviour.
 */
const HREF_TO_WORKSPACE = new Map<string, Business>();
for (const cfg of Object.values(WORKSPACES)) {
  for (const section of cfg.sections) {
    for (const item of section.items) {
      if (!HREF_TO_WORKSPACE.has(item.href)) HREF_TO_WORKSPACE.set(item.href, cfg.key);
    }
  }
  if (!HREF_TO_WORKSPACE.has(cfg.landingPath)) HREF_TO_WORKSPACE.set(cfg.landingPath, cfg.key);
}

export function workspaceFromPathname(pathname: string): Business | null {
  if (!pathname.startsWith('/')) return null;
  // Longest prefix match — a route like `/candidates/new` should match
  // `/candidates`, and `/admin/users` should match `/admin`.
  let best: { href: string; workspace: Business } | null = null;
  for (const [href, workspace] of HREF_TO_WORKSPACE) {
    if (pathname === href || pathname.startsWith(`${href}/`)) {
      if (!best || href.length > best.href.length) best = { href, workspace };
    }
  }
  if (best) return best.workspace;
  // Everything under /admin, /hr, /tasks, /reports, /notifications,
  // /communications — cross-cutting → main workspace.
  if (
    pathname === '/dashboard' ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/hr') ||
    pathname === '/tasks' ||
    pathname === '/reports' ||
    pathname === '/notifications' ||
    pathname === '/communications' ||
    pathname === '/shortlists' ||
    pathname === '/account/security'
  ) {
    return 'main';
  }
  return null;
}

/**
 * Routes that aren't in the primary sidebar but are still valid URLs.
 * Kept here as a source of truth so search / bookmarks keep working;
 * add them back into a workspace if the product needs them surfaced.
 *
 * Reachable via direct URL:
 *   /shortlists   /notifications   /reports   /hr/team
 *   /admin/persons  /admin/occupations  /admin/skills
 *   /admin/qualifications  /admin/document-types
 *   /admin/document-rules  /admin/services  /admin/currencies
 *   /admin/audit
 *
 * Icons kept as a reference list — no longer imported from this file,
 * but the lookups above (BarChart3, Bell, GitMerge, ...) are here so
 * future re-additions have the icon set to choose from.
 */
void [BarChart3, Bell, GitMerge, GraduationCap, ListChecks, Package, ScrollText, Tags, Globe];
