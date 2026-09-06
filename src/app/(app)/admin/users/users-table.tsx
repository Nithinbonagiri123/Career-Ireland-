'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { MoreHorizontal, UserCog, UserX } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** Only staff roles are settable from this admin UI. Portal roles are set via invitations. */
type StaffRole = 'ADMIN' | 'STAFF';

import { changeUserRoleAction, setUserActiveAction } from '@/modules/users/actions';
import type { UserListRow } from '@/modules/users/repository';

type Props = {
  users: UserListRow[];
  currentUserId: string;
};

export function UsersTable({ users, currentUserId }: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const handleChangeRole = (user: UserListRow, role: StaffRole) => {
    if (user.role === role) return;
    setPendingId(user.id);
    startTransition(async () => {
      const result = await changeUserRoleAction({ userId: user.id, role });
      setPendingId(null);
      if (result.ok) {
        toast.success(`${user.fullName} is now ${role}. Their existing sessions were invalidated.`);
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const handleSetActive = (user: UserListRow, isActive: boolean) => {
    setPendingId(user.id);
    startTransition(async () => {
      const result = await setUserActiveAction({ userId: user.id, isActive });
      setPendingId(null);
      if (result.ok) {
        toast.success(
          isActive
            ? `${user.fullName} reactivated.`
            : `${user.fullName} deactivated and signed out.`,
        );
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const columns: ColumnDef<UserListRow>[] = [
    {
      header: 'Name',
      accessorKey: 'fullName',
      cell: ({ row }) => {
        const isSelf = row.original.id === currentUserId;
        return (
          <div className="flex flex-col">
            <span className="text-sm font-medium">
              {row.original.fullName}
              {isSelf && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
            </span>
            <span className="text-xs text-muted-foreground">{row.original.email}</span>
          </div>
        );
      },
    },
    {
      header: 'Role',
      accessorKey: 'role',
      size: 100,
      cell: ({ row }) => (
        <Badge
          variant={row.original.role === 'ADMIN' ? 'default' : 'secondary'}
          className="rounded-full"
        >
          {row.original.role}
        </Badge>
      ),
    },
    {
      header: 'Status',
      accessorKey: 'isActive',
      size: 110,
      cell: ({ row }) =>
        row.original.isActive ? (
          <span className="inline-flex items-center gap-1.5 text-xs">
            <span className="size-1.5 rounded-full bg-status-success" /> Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-muted-foreground/50" /> Deactivated
          </span>
        ),
    },
    {
      header: 'Last login',
      accessorKey: 'lastLoginAt',
      size: 140,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.lastLoginAt
            ? formatDistanceToNow(row.original.lastLoginAt, { addSuffix: true })
            : 'Never'}
        </span>
      ),
    },
    {
      header: '',
      id: 'actions',
      size: 50,
      cell: ({ row }) => {
        const user = row.original;
        const isSelf = user.id === currentUserId;
        const isBusy = pendingId === user.id;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" aria-label="Actions" disabled={isBusy} />}
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Change role</DropdownMenuLabel>
              <DropdownMenuItem
                disabled={isSelf || user.role === 'ADMIN'}
                onClick={() => handleChangeRole(user, 'ADMIN')}
              >
                <UserCog className="mr-2 size-4" /> Make ADMIN
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={isSelf || user.role === 'STAFF'}
                onClick={() => handleChangeRole(user, 'STAFF')}
              >
                <UserCog className="mr-2 size-4" /> Make STAFF
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {user.isActive ? (
                <DropdownMenuItem disabled={isSelf} onClick={() => handleSetActive(user, false)}>
                  <UserX className="mr-2 size-4" /> Deactivate
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => handleSetActive(user, true)}>
                  <UserCog className="mr-2 size-4" /> Reactivate
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={users}
      emptyTitle="No users yet"
      emptyDescription="Create the first user with the button above."
    />
  );
}
