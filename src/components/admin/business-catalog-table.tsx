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
import type { BusinessCaseType } from '@/lib/db/schema/reference';
import {
  setBusinessCaseTypeActiveAction,
  upsertBusinessCaseTypeAction,
} from '@/modules/catalog/actions';
import type { BusinessCaseTypeModule } from '@/modules/catalog/business-case-types';

/**
 * Reusable admin CRUD table for any module of the business_case_types
 * catalog. Same shape as skills / qualifications admin (name + description +
 * active toggle), parameterized by module + display copy.
 *
 * Usage:
 *   <BusinessCatalogTable
 *     module="ADVERTISEMENT_CHANNEL"
 *     entities={channels}
 *     entityLabelSingular="channel"
 *     placeholderExample="e.g. LinkedIn Jobs, IrishJobs, WhatJobs"
 *   />
 */

const FormSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(160),
  description: z.string().max(2000).optional().or(z.literal('')),
  isActive: z.boolean(),
});
type FormValues = z.infer<typeof FormSchema>;

function CatalogDialog({
  module,
  entityLabelSingular,
  placeholderExample,
  trigger,
  initial,
}: {
  module: BusinessCaseTypeModule;
  entityLabelSingular: string;
  placeholderExample?: string;
  trigger: ReactElement;
  initial?: BusinessCaseType;
}) {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const isEdit = Boolean(initial);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      id: initial?.id,
      name: initial?.name ?? '',
      description: initial?.description ?? '',
      isActive: initial?.isActive ?? true,
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    const r = await upsertBusinessCaseTypeAction({ ...data, module });
    if (!r.ok) {
      setFormError(r.error.message);
      return;
    }
    toast.success(isEdit ? `${entityLabelSingular} updated` : `${entityLabelSingular} added`);
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
            {isEdit ? `Edit ${entityLabelSingular}` : `Add ${entityLabelSingular}`}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Name</Label>
            <Input
              id="cat-name"
              placeholder={placeholderExample}
              aria-invalid={Boolean(errors.name)}
              {...register('name')}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-desc">Description (optional)</Label>
            <textarea
              id="cat-desc"
              rows={3}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              {...register('description')}
            />
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
              {isEdit ? 'Save' : `Add ${entityLabelSingular}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BusinessCatalogTable({
  module,
  entities,
  entityLabelSingular,
  entityLabelPlural,
  emptyDescription,
  placeholderExample,
}: {
  module: BusinessCaseTypeModule;
  entities: BusinessCaseType[];
  entityLabelSingular: string;
  entityLabelPlural: string;
  emptyDescription: string;
  placeholderExample?: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const toggle = (row: BusinessCaseType) => {
    setBusy(row.id);
    startTransition(async () => {
      const r = await setBusinessCaseTypeActiveAction({ id: row.id, isActive: !row.isActive });
      setBusy(null);
      if (r.ok) toast.success(`${row.name} ${row.isActive ? 'deactivated' : 'activated'}`);
      else toast.error(r.error.message);
    });
  };

  const columns: ColumnDef<BusinessCaseType>[] = [
    {
      header: 'Name',
      accessorKey: 'name',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-sm font-medium">{row.original.name}</span>
          {row.original.description && (
            <span className="line-clamp-1 text-xs text-muted-foreground">
              {row.original.description}
            </span>
          )}
        </div>
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
          <CatalogDialog
            module={module}
            entityLabelSingular={entityLabelSingular}
            placeholderExample={placeholderExample}
            initial={row.original}
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
        <CatalogDialog
          module={module}
          entityLabelSingular={entityLabelSingular}
          placeholderExample={placeholderExample}
          trigger={
            <Button size="sm">
              <Plus className="mr-1.5 size-4" /> New {entityLabelSingular}
            </Button>
          }
        />
      </div>
      <DataTable
        columns={columns}
        data={entities}
        emptyTitle={`No ${entityLabelPlural} yet`}
        emptyDescription={emptyDescription}
      />
    </div>
  );
}
