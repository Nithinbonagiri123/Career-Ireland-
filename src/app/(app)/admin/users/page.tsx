import { UserCog } from 'lucide-react';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requirePermission } from '@/lib/auth/session';
import { fetchAppSettings } from '@/modules/settings/service';
import { fetchUsers } from '@/modules/users/service';
import { CreateUserDialog } from './create-user-dialog';
import { UsersTable } from './users-table';

export const dynamic = 'force-dynamic';

export default async function UsersAdminPage() {
  const session = await requirePermission('main', 'admin', 'view');
  const [users, settings] = await Promise.all([fetchUsers(), fetchAppSettings()]);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={UserCog}
          badge="Admin"
          title="Users"
          description={`${settings.legalName} staff accounts. Role changes and deactivations immediately invalidate the affected user's session.`}
          action={<CreateUserDialog />}
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <UsersTable users={users} currentUserId={session.user.id} />
      </FadeUp>
    </div>
  );
}
