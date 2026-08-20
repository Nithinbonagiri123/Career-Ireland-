import type { LucideIcon } from 'lucide-react';
import {
  Bell,
  Briefcase,
  Building2,
  CheckSquare,
  ClipboardList,
  Coins,
  FileText,
  Globe,
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
      { label: 'Leads', href: '/leads', icon: UserPlus },
      { label: 'Candidates', href: '/candidates', icon: Users },
      { label: 'Documents', href: '/documents', icon: FileText },
      { label: 'Applications', href: '/applications', icon: ClipboardList },
      { label: 'Payments', href: '/payments', icon: Coins },
    ],
  },
  {
    label: 'Recruitment',
    items: [
      { label: 'Employers', href: '/employers', icon: Building2 },
      { label: 'Requisitions', href: '/requisitions', icon: Briefcase },
      { label: 'Matching', href: '/matching', icon: SearchCheck },
      { label: 'Shortlists', href: '/shortlists', icon: ListChecks },
      { label: 'Campaigns', href: '/campaigns', icon: Sparkles },
      { label: 'Placements', href: '/placements', icon: Trophy },
    ],
  },
  {
    label: 'Immigration',
    items: [{ label: 'Cases', href: '/immigration', icon: PlaneTakeoff }],
  },
  {
    label: 'Activities',
    items: [
      { label: 'Communications', href: '/communications', icon: MessagesSquare },
      { label: 'Tasks', href: '/tasks', icon: CheckSquare },
      { label: 'Notifications', href: '/notifications', icon: Bell },
    ],
  },
  {
    label: 'Admin',
    items: [
      { label: 'Users', href: '/admin/users', icon: UserCog },
      { label: 'Occupations', href: '/admin/occupations', icon: Tags },
      { label: 'Currencies', href: '/admin/currencies', icon: Globe },
      { label: 'Packages', href: '/admin/packages', icon: Package },
      { label: 'Document Types', href: '/admin/document-types', icon: ScrollText },
      { label: 'Audit Log', href: '/admin/audit', icon: ShieldCheck },
    ],
  },
];
