import { KeyRound } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { buttonVariants } from '@/components/ui/button';
import { requirePermission } from '@/lib/auth/session';
import {
  fetchUserPermissionSnapshot,
  type UserPermissionSnapshot,
} from '@/modules/permissions/service';
import { RoleFirstPermissions } from './role-first-permissions';

export const dynamic = 'force-dynamic';

export default async function UserPermissionsPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('main', 'admin', 'manage');
  const { id } = await params;

  let snapshot: UserPermissionSnapshot;
  try {
    snapshot = await fetchUserPermissionSnapshot(id);
  } catch {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={KeyRound}
          badge="Admin"
          title={`${snapshot.fullName} — Permissions`}
          description={
            snapshot.isOwner
              ? 'This user is the business owner. Owner bypasses every permission check — the controls below are read-only.'
              : 'Pick a role to set a preset for this user. Open the Advanced section only if you need to grant or revoke a specific verb on top of the preset.'
          }
          breadcrumbs={[{ label: 'Users', href: '/admin/users' }, { label: snapshot.fullName }]}
          action={
            <Link
              href="/admin/users"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Back to users
            </Link>
          }
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <RoleFirstPermissions snapshot={snapshot} />
      </FadeUp>
    </div>
  );
}
