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

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export type NavSection = {
  label: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Candidate Services',
    items: [
      { label: 'Dashboard', href: '/dashboard/candidate-services', icon: LayoutDashboard },
      { label: 'Leads', href: '/leads', icon: UserPlus },
      { label: 'Candidates', href: '/candidates', icon: Users },
      { label: 'Documents', href: '/documents', icon: FileText },
      { label: 'Applications', href: '/applications', icon: ClipboardList },
      { label: 'Engagements', href: '/engagements', icon: Coins },
      { label: 'Payments', href: '/payments', icon: Coins },
    ],
  },
  {
    label: 'Recruitment',
    items: [
      { label: 'Dashboard', href: '/dashboard/recruitment', icon: LayoutDashboard },
      { label: 'Employers', href: '/employers', icon: Building2 },
      { label: 'Requisitions', href: '/requisitions', icon: Briefcase },
      { label: 'Matching', href: '/matching', icon: SearchCheck },
      { label: 'Shortlists', href: '/shortlists', icon: ListChecks },
      { label: 'Interviews', href: '/interviews', icon: CalendarClock },
      { label: 'Campaigns', href: '/campaigns', icon: Sparkles },
      { label: 'Prospects', href: '/prospects', icon: UserPlus },
      { label: 'Placements', href: '/placements', icon: Trophy },
    ],
  },
  {
    label: 'Immigration',
    items: [
      { label: 'Dashboard', href: '/dashboard/immigration', icon: LayoutDashboard },
      { label: 'Cases', href: '/immigration', icon: PlaneTakeoff },
    ],
  },
  {
    label: 'Activities',
    items: [
      { label: 'Communications', href: '/communications', icon: MessagesSquare },
      { label: 'Tasks', href: '/tasks', icon: CheckSquare },
      { label: 'Notifications', href: '/notifications', icon: Bell },
      { label: 'Reports', href: '/reports', icon: BarChart3 },
    ],
  },
  {
    label: 'HR',
    items: [
      { label: 'My attendance', href: '/hr', icon: Clock },
      { label: 'My team', href: '/hr/team', icon: Users },
      { label: 'HR admin', href: '/hr/admin', icon: Users2 },
    ],
  },
  {
    label: 'Admin',
    items: [
      { label: 'Users', href: '/admin/users', icon: UserCog },
      { label: 'Persons & merges', href: '/admin/persons', icon: GitMerge },
      { label: 'Occupations', href: '/admin/occupations', icon: Tags },
      { label: 'Skills', href: '/admin/skills', icon: Sparkles },
      { label: 'Qualifications', href: '/admin/qualifications', icon: GraduationCap },
      { label: 'Document Types', href: '/admin/document-types', icon: ScrollText },
      { label: 'Document Rules', href: '/admin/document-rules', icon: FileText },
      { label: 'Services & Packages', href: '/admin/services', icon: Package },
      { label: 'Currencies', href: '/admin/currencies', icon: Globe },
      { label: 'Audit Log', href: '/admin/audit', icon: ShieldCheck },
    ],
  },
  {
    label: 'Account',
    items: [{ label: 'Security', href: '/account/security', icon: KeyRound }],
  },
];
