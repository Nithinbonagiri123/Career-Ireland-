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
import { PermissionsEditor } from './permissions-editor';

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
    <div className="mx-auto w-full max-w-5xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={KeyRound}
          badge="Admin"
          title={`${snapshot.fullName} — Permissions`}
          description={
            snapshot.isOwner
              ? 'This user is the business owner. Owner bypasses every permission check — the matrix below is read-only.'
              : `Preset applied at user creation was ${snapshot.role}. Adjust the checkboxes; a Manage grant covers Delete → Edit → Create → View, so you only need to check the highest verb you want to allow.`
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
        <PermissionsEditor snapshot={snapshot} />
      </FadeUp>
    </div>
  );
}
