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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import type { Occupation } from '@/lib/db/schema/occupations';
import type { DocumentType } from '@/lib/db/schema/reference';
import type { ServicePackage } from '@/lib/db/schema/services';
import { upsertRequirementRuleAction } from '@/modules/documents/actions';
import {
  type UpsertRequirementRuleInput,
  UpsertRequirementRuleSchema,
} from '@/modules/documents/schemas';

type Initial = {
  id: string;
  documentTypeId: string;
  scope: 'OCCUPATION' | 'JOB_REQUISITION' | 'SERVICE_PACKAGE' | 'GLOBAL';
  scopeRefId: string | null;
  notes: string | null;
};

type Props = {
  trigger: ReactElement;
  documentTypes: DocumentType[];
  occupations: Occupation[];
  packages: ServicePackage[];
  initial?: Initial;
};

export function RuleDialog({ trigger, documentTypes, occupations, packages, initial }: Props) {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const isEdit = Boolean(initial);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpsertRequirementRuleInput>({
    resolver: zodResolver(UpsertRequirementRuleSchema),
    defaultValues: {
      id: initial?.id,
      documentTypeId: initial?.documentTypeId ?? documentTypes[0]?.id ?? '',
      scope: initial?.scope ?? 'GLOBAL',
      scopeRefId: initial?.scopeRefId ?? '',
      notes: initial?.notes ?? '',
    },
  });

  const scope = watch('scope');

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    const r = await upsertRequirementRuleAction(data);
    if (!r.ok) {
      setFormError(r.error.message);
      return;
    }
    toast.success(isEdit ? 'Rule updated' : 'Rule created');
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
          <DialogTitle>{isEdit ? 'Edit requirement rule' : 'New requirement rule'}</DialogTitle>
          <DialogDescription>
            Rules materialise into per-candidate document requirements when staff runs "Refresh
            required documents" on a profile.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="rr-type">Document type</Label>
            <select
              id="rr-type"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              {...register('documentTypeId')}
            >
              {documentTypes
                .filter((t) => t.isActive || t.id === initial?.documentTypeId)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code})
                  </option>
                ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rr-scope">Scope</Label>
            <select
              id="rr-scope"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              {...register('scope')}
            >
              <option value="GLOBAL">Global — every candidate</option>
              <option value="OCCUPATION">Occupation-specific</option>
              <option value="SERVICE_PACKAGE">Package-specific</option>
              <option value="JOB_REQUISITION">Job-specific (per requisition)</option>
            </select>
          </div>

          {scope === 'OCCUPATION' && (
            <div className="space-y-1.5">
              <Label htmlFor="rr-occ">Occupation</Label>
              <select
                id="rr-occ"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                {...register('scopeRefId')}
              >
                <option value="">— select occupation —</option>
                {occupations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {scope === 'SERVICE_PACKAGE' && (
            <div className="space-y-1.5">
              <Label htmlFor="rr-pkg">Service package</Label>
              <select
                id="rr-pkg"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                {...register('scopeRefId')}
              >
                <option value="">— select package —</option>
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {scope === 'JOB_REQUISITION' && (
            <p className="text-xs text-muted-foreground">
              Job-specific requirements attach when a candidate is applied to that requisition.
              Attach the requisition id via API — no picker yet.
            </p>
          )}

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
          {errors.documentTypeId && (
            <p className="text-xs text-destructive">{errors.documentTypeId.message}</p>
          )}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              {isEdit ? 'Save' : 'Create rule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
