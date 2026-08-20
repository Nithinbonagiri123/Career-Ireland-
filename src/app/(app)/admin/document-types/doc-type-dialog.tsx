'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { AlertCircle, Loader2 } from 'lucide-react';
import { type ReactElement, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
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
import type { DocumentType } from '@/lib/db/schema/reference';
import { upsertDocumentTypeAction } from '@/modules/document-types/actions';
import {
  type UpsertDocumentTypeInput,
  UpsertDocumentTypeSchema,
} from '@/modules/document-types/schemas';

type Props = { trigger: ReactElement; initial?: DocumentType };

export function DocTypeDialog({ trigger, initial }: Props) {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const isEdit = Boolean(initial);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpsertDocumentTypeInput>({
    resolver: zodResolver(UpsertDocumentTypeSchema),
    defaultValues: {
      id: initial?.id,
      code: initial?.code ?? '',
      name: initial?.name ?? '',
      hasExpiry: initial?.hasExpiry ?? false,
      appliesTo: initial?.appliesTo ?? 'PERSON',
      isActive: initial?.isActive ?? true,
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    const result = await upsertDocumentTypeAction(data);
    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }
    toast.success(isEdit ? 'Document type updated' : 'Document type added');
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
          <DialogTitle>{isEdit ? `Edit ${initial?.code}` : 'Add document type'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dt-code">Code</Label>
              <Input
                id="dt-code"
                readOnly={isEdit}
                className={isEdit ? 'cursor-not-allowed opacity-60' : undefined}
                aria-invalid={Boolean(errors.code)}
                {...register('code')}
              />
              {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="dt-name">Name</Label>
              <Input id="dt-name" aria-invalid={Boolean(errors.name)} {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dt-applies">Applies to</Label>
            <select
              id="dt-applies"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              {...register('appliesTo')}
            >
              <option value="PERSON">Person only (candidate documents)</option>
              <option value="EMPLOYER">Employer only (company documents)</option>
              <option value="BOTH">Both</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register('hasExpiry')} className="size-4 accent-accent" />
            Has expiry date (staff will be prompted for one on upload)
          </label>
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
              {isEdit ? 'Save' : 'Add document type'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
