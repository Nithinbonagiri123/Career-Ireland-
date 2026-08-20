'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { ColumnDef } from '@tanstack/react-table';
import { motion } from 'framer-motion';
import { AlertCircle, Loader2, Pencil, Plus } from 'lucide-react';
import { type ReactElement, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { DataTable } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ActionResult } from '@/lib/result';

/**
 * Reusable admin table + upsert dialog for simple "name + isActive" reference tables
 * (skills, qualifications, other future simple lookups).
 *
 * Use for any resource that fits `{ id, name, isActive }`. If a resource has extra
 * fields (e.g. document_types.code, .hasExpiry), build a bespoke table for it —
 * don't stretch this component with optional props until three real cases justify it.
 */

const RowSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(200),
  isActive: z.boolean(),
});

export type SimpleRefRow = { id: string; name: string; isActive: boolean };

type Props<T extends SimpleRefRow> = {
  data: T[];
  entityLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  upsertAction: (input: z.infer<typeof RowSchema>) => Promise<ActionResult<T>>;
  setActiveAction: (input: { id: string; isActive: boolean }) => Promise<ActionResult<T>>;
};

function RowDialog<T extends SimpleRefRow>({
  trigger,
  initial,
  entityLabel,
  upsertAction,
}: {
  trigger: ReactElement;
  initial?: T;
  entityLabel: string;
  upsertAction: Props<T>['upsertAction'];
}) {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const isEdit = Boolean(initial);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof RowSchema>>({
    resolver: zodResolver(RowSchema),
    defaultValues: {
      id: initial?.id,
      name: initial?.name ?? '',
      isActive: initial?.isActive ?? true,
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    const result = await upsertAction(data);
    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }
    toast.success(isEdit ? `${entityLabel} updated` : `${entityLabel} added`);
    reset(data);
    setOpen(false);
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          reset();
          setFormError(null);
        }
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `Edit ${entityLabel.toLowerCase()}` : `Add ${entityLabel.toLowerCase()}`}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="sr-name">Name</Label>
            <Input id="sr-name" aria-invalid={Boolean(errors.name)} {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register('isActive')} className="size-4 accent-accent" />
            Active
          </label>
          {formError && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
              role="alert"
            >
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span>{formError}</span>
            </motion.div>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              {isEdit ? 'Save' : `Add ${entityLabel.toLowerCase()}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SimpleRefTable<T extends SimpleRefRow>({
  data,
  entityLabel,
  emptyTitle,
  emptyDescription,
  upsertAction,
  setActiveAction,
}: Props<T>) {
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const toggle = (row: T) => {
    setBusy(row.id);
    startTransition(async () => {
      const result = await setActiveAction({ id: row.id, isActive: !row.isActive });
      setBusy(null);
      if (result.ok) toast.success(`${row.name} ${row.isActive ? 'deactivated' : 'activated'}`);
      else toast.error(result.error.message);
    });
  };

  const columns: ColumnDef<T>[] = [
    {
      header: entityLabel,
      accessorKey: 'name',
      cell: ({ row }) => <span className="text-sm font-medium">{row.original.name}</span>,
    },
    {
      header: 'Status',
      accessorKey: 'isActive',
      size: 110,
      cell: ({ row }) =>
        row.original.isActive ? (
          <span className="inline-flex items-center gap-1.5 text-xs">
            <span className="size-1.5 rounded-full bg-emerald-500" /> Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-muted-foreground/50" /> Inactive
          </span>
        ),
    },
    {
      header: '',
      id: 'actions',
      size: 200,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy === row.original.id}
            onClick={() => toggle(row.original)}
          >
            {row.original.isActive ? 'Deactivate' : 'Activate'}
          </Button>
          <RowDialog
            initial={row.original}
            entityLabel={entityLabel}
            upsertAction={upsertAction}
            trigger={
              <Button variant="ghost" size="icon" aria-label={`Edit ${row.original.name}`}>
                <Pencil className="size-3.5" />
              </Button>
            }
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <RowDialog
          entityLabel={entityLabel}
          upsertAction={upsertAction}
          trigger={
            <Button size="sm">
              <Plus className="mr-1.5 size-4" /> New {entityLabel.toLowerCase()}
            </Button>
          }
        />
      </div>
      <DataTable
        columns={columns}
        data={data}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
      />
    </div>
  );
}
