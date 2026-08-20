import { PortalShell } from '@/components/shell/portal-shell';
import { requirePortalCandidate } from '@/lib/auth/session';

const CANDIDATE_LINKS = [
  { label: 'Overview', href: '/portal/candidate' },
  { label: 'Profile', href: '/portal/candidate/profile' },
  { label: 'Documents', href: '/portal/candidate/documents' },
  { label: 'Applications', href: '/portal/candidate/applications' },
  { label: 'Placements', href: '/portal/candidate/placements' },
  { label: 'Payments', href: '/portal/candidate/payments' },
];

export default async function CandidatePortalLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePortalCandidate();
  return (
    <PortalShell
      user={{ name: session.user.name, email: session.user.email, role: 'CANDIDATE' }}
      links={CANDIDATE_LINKS}
      workspaceLabel="Candidate portal"
    >
      {children}
    </PortalShell>
  );
}
