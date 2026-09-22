'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type ReactElement, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { CatalogAutosuggest, type Selection } from '@/components/catalog-autosuggest';
import { FormErrorAlert } from '@/components/form-error-alert';
import { FormField } from '@/components/form-field';
import { SubmitButton } from '@/components/submit-button';
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
import { Select } from '@/components/ui/select';
import type { Occupation } from '@/lib/db/schema/occupations';
import type { DocumentType } from '@/lib/db/schema/reference';
import type { ServicePackage } from '@/lib/db/schema/services';
import { useFormDialog } from '@/lib/hooks/use-form-dialog';
import { upsertRequirementRuleAction } from '@/modules/documents/actions';
import {
  type UpsertRequirementRuleInput,
  UpsertRequirementRuleSchema,
} from '@/modules/documents/schemas';
import { createOccupationFromNameAction } from '@/modules/occupations/actions';

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
  const isEdit = Boolean(initial);
  const form = useForm<UpsertRequirementRuleInput>({
    resolver: zodResolver(UpsertRequirementRuleSchema),
    defaultValues: {
      id: initial?.id,
      documentTypeId: initial?.documentTypeId ?? documentTypes[0]?.id ?? '',
      scope: initial?.scope ?? 'GLOBAL',
      scopeRefId: initial?.scopeRefId ?? '',
      notes: initial?.notes ?? '',
    },
  });
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = form;
  const { open, onOpenChange, formError, submit } = useFormDialog(form);

  const scope = watch('scope');
  const scopeRefId = watch('scopeRefId') ?? '';

  const initialOccupation =
    initial?.scope === 'OCCUPATION' && initial?.scopeRefId
      ? occupations.find((o) => o.id === initial.scopeRefId)
      : null;
  const [occupationSelection, setOccupationSelection] = useState<Selection>(
    initialOccupation
      ? { kind: 'catalog', id: initialOccupation.id, label: initialOccupation.name }
      : null,
  );
  const occupationOptions = useMemo(
    () =>
      occupations.map((o) => ({
        id: o.id,
        name: o.name,
        isActive: o.isActive,
      })),
    [occupations],
  );

  const onSubmit = handleSubmit((data) =>
    submit(data, upsertRequirementRuleAction, {
      successMessage: isEdit ? 'Rule updated' : 'Rule created',
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          <FormField id="rr-type" label="Document type" error={errors.documentTypeId?.message}>
            <Select id="rr-type" {...register('documentTypeId')}>
              {documentTypes
                .filter((t) => t.isActive || t.id === initial?.documentTypeId)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code})
                  </option>
                ))}
            </Select>
          </FormField>

          <FormField id="rr-scope" label="Scope">
            <Select id="rr-scope" {...register('scope')}>
              <option value="GLOBAL">Global — every candidate</option>
              <option value="OCCUPATION">Occupation-specific</option>
              <option value="SERVICE_PACKAGE">Package-specific</option>
              <option value="JOB_REQUISITION">Job-specific (per requisition)</option>
            </Select>
          </FormField>

          {scope === 'OCCUPATION' && (
            <FormField id="rr-occ" label="Occupation">
              <input type="hidden" {...register('scopeRefId')} />
              <CatalogAutosuggest
                inputId="rr-occ"
                options={occupationOptions}
                value={occupationSelection}
                onChange={(v) => {
                  setOccupationSelection(v);
                  setValue('scopeRefId', v?.kind === 'catalog' ? v.id : '', {
                    shouldDirty: true,
                  });
                }}
                placeholder="Type to search — or add new"
                createLabel="Add occupation"
                onCreateNew={async (name) => {
                  const r = await createOccupationFromNameAction({ name });
                  if (!r.ok) throw new Error(r.error.message);
                  return { id: r.data.id, label: r.data.name };
                }}
              />
            </FormField>
          )}

          {scope === 'SERVICE_PACKAGE' && (
            <FormField
              id="rr-pkg"
              label="Service package"
              hint={
                <>
                  Add new service packages from the{' '}
                  <a href="/admin/services" className="underline">
                    Services admin
                  </a>{' '}
                  — they need a price + currency to be usable.
                </>
              }
            >
              <Select
                id="rr-pkg"
                value={scopeRefId}
                onChange={(e) => setValue('scopeRefId', e.target.value, { shouldDirty: true })}
              >
                <option value="">— select package —</option>
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </FormField>
          )}

          {scope === 'JOB_REQUISITION' && (
            <p className="text-xs text-muted-foreground">
              Job-specific requirements attach when a candidate is applied to that requisition.
              Attach the requisition id via API — no picker yet.
            </p>
          )}

          <FormErrorAlert error={formError} />

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <SubmitButton loading={isSubmitting}>{isEdit ? 'Save' : 'Create rule'}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
