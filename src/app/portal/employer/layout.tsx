import { PortalShell } from '@/components/shell/portal-shell';
import { requirePortalEmployer } from '@/lib/auth/session';

const EMPLOYER_LINKS = [
  { label: 'Overview', href: '/portal/employer' },
  { label: 'Company', href: '/portal/employer/profile' },
  { label: 'Requisitions', href: '/portal/employer/requisitions' },
  { label: 'Placements', href: '/portal/employer/placements' },
];

export default async function EmployerPortalLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePortalEmployer();
  return (
    <PortalShell
      user={{ name: session.user.name, email: session.user.email, role: 'EMPLOYER' }}
      links={EMPLOYER_LINKS}
      workspaceLabel="Employer portal"
    >
      {children}
    </PortalShell>
  );
}
