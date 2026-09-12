import type { LucideIcon } from 'lucide-react';
import {
  FileText,
  GitMerge,
  Globe,
  GraduationCap,
  Package,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Tags,
  UserCog,
} from 'lucide-react';
import Link from 'next/link';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireRole } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/**
 * Admin hub — indexes every admin sub-page. Reached from
 * Main Dashboard → Admin. Individual sub-pages still have their own
 * routes for direct navigation / bookmarks.
 */

const SECTIONS: Array<{
  heading: string;
  description: string;
  items: Array<{ label: string; href: string; icon: LucideIcon; description: string }>;
}> = [
  {
    heading: 'Access',
    description: 'People, portal access, and audit trail',
    items: [
      {
        label: 'Users',
        href: '/admin/users',
        icon: UserCog,
        description: 'Internal staff + portal users',
      },
      {
        label: 'Persons & merges',
        href: '/admin/persons',
        icon: GitMerge,
        description: 'Identity records + duplicate resolution',
      },
      {
        label: 'Audit log',
        href: '/admin/audit',
        icon: ShieldCheck,
        description: 'Every mutation across the platform',
      },
    ],
  },
  {
    heading: 'Reference data',
    description: 'Controlled vocabularies driving matching, requirements, and billing',
    items: [
      {
        label: 'Occupations',
        href: '/admin/occupations',
        icon: Tags,
        description: 'The occupation categories a candidate can belong to',
      },
      {
        label: 'Skills',
        href: '/admin/skills',
        icon: Sparkles,
        description: 'Skills a candidate or requisition can carry',
      },
      {
        label: 'Qualifications',
        href: '/admin/qualifications',
        icon: GraduationCap,
        description: 'Formal qualifications',
      },
      {
        label: 'Document types',
        href: '/admin/document-types',
        icon: ScrollText,
        description: 'Types of document (CV, Passport, etc.)',
      },
      {
        label: 'Document rules',
        href: '/admin/document-rules',
        icon: FileText,
        description: 'Which documents each candidate must supply',
      },
    ],
  },
  {
    heading: 'Commerce',
    description: 'Prices, services, and currencies',
    items: [
      {
        label: 'Services & packages',
        href: '/admin/services',
        icon: Package,
        description: 'Catalog of billable services',
      },
      {
        label: 'Currencies',
        href: '/admin/currencies',
        icon: Globe,
        description: 'Supported currencies',
      },
    ],
  },
];

export default async function AdminHubPage() {
  await requireRole(['ADMIN']);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={UserCog}
          title="Admin"
          description="System-wide configuration, reference data, and the audit log. Only admins reach these pages."
        />
      </FadeUp>

      <div className="space-y-6">
        {SECTIONS.map((section, i) => (
          <FadeUp key={section.heading} delay={0.05 + i * 0.03}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{section.heading}</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">{section.description}</p>
              </CardHeader>
              <CardContent>
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {section.items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="group flex h-full flex-col gap-1 rounded-md border bg-card p-3 transition-colors hover:border-foreground/20 hover:bg-muted/40"
                      >
                        <div className="flex items-center gap-2">
                          <item.icon
                            className="size-4 text-muted-foreground group-hover:text-foreground"
                            aria-hidden
                          />
                          <span className="text-sm font-medium">{item.label}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{item.description}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </FadeUp>
        ))}
      </div>
    </div>
  );
}
