import { UserCog } from 'lucide-react';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requireRole } from '@/lib/auth/session';
import { fetchUsers } from '@/modules/users/service';
import { CreateUserDialog } from './create-user-dialog';
import { UsersTable } from './users-table';

export const dynamic = 'force-dynamic';

export default async function UsersAdminPage() {
  const session = await requireRole(['ADMIN']);
  const users = await fetchUsers();

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={UserCog}
          badge="Admin"
          title="Users"
          description="Ireland Career Gateway staff accounts. Role changes and deactivations immediately invalidate the affected user's session."
          action={<CreateUserDialog />}
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <UsersTable users={users} currentUserId={session.user.id} />
      </FadeUp>
    </div>
  );
}
