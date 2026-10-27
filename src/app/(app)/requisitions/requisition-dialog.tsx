'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type ReactElement, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { FormErrorAlert } from '@/components/form-error-alert';
import { FormField } from '@/components/form-field';
import { FormSection } from '@/components/form-section';
import { type OccupationOption, OccupationPicker } from '@/components/occupation-picker';
import { SubmitButton } from '@/components/submit-button';
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
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Currency } from '@/lib/db/schema/currencies';
import type { Occupation } from '@/lib/db/schema/occupations';
import type { Employer, JobRequisition } from '@/lib/db/schema/recruitment';
import { useFormDialog } from '@/lib/hooks/use-form-dialog';
import { upsertRequisitionAction } from '@/modules/requisitions/actions';
import {
  type UpsertRequisitionInput,
  UpsertRequisitionSchema,
} from '@/modules/requisitions/schemas';

type Props = {
  trigger: ReactElement;
  employers: Employer[];
  occupations: Occupation[];
  currencies: Currency[];
  initial?: JobRequisition;
  defaultEmployerId?: string;
  /** R0 — lets next-action deep links (?edit=1 / ?newRequisition=1)
   *  land with the dialog already open. */
  defaultOpen?: boolean;
};

export function RequisitionDialog({
  trigger,
  employers,
  occupations,
  currencies,
  initial,
  defaultEmployerId,
  defaultOpen,
}: Props) {
  const isEdit = Boolean(initial);
  const form = useForm<UpsertRequisitionInput>({
    resolver: zodResolver(UpsertRequisitionSchema),
    defaultValues: {
      id: initial?.id,
      employerId: initial?.employerId ?? defaultEmployerId ?? employers[0]?.id ?? '',
      primaryContactId: initial?.primaryContactId ?? '',
      title: initial?.title ?? '',
      occupationId: initial?.occupationId ?? '',
      positionsRequired: initial?.positionsRequired ?? 1,
      location: initial?.location ?? '',
      employmentType: initial?.employmentType ?? 'FULL_TIME',
      salaryMin: initial?.salaryMin ?? '',
      salaryMax: initial?.salaryMax ?? '',
      salaryCurrencyCode: initial?.salaryCurrencyCode ?? '',
      description: initial?.description ?? '',
      candidateRequirements: initial?.candidateRequirements ?? '',
      status: initial?.status ?? 'DRAFT',
      assignedUserId: initial?.assignedUserId ?? '',
      targetFillDate: initial?.targetFillDate ?? '',
    },
  });
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = form;
  const { open, onOpenChange, formError, submit } = useFormDialog(form, { defaultOpen });

  const [locallyCreatedOccupations, setLocallyCreatedOccupations] = useState<OccupationOption[]>(
    [],
  );
  // Dedupe by id: once a server refresh pulls in a locally-created
  // occupation, it exists in both arrays. React throws a duplicate-key
  // warning on the picker's <option> map without this.
  const occupationOptions = useMemo(() => {
    const byId = new Map<string, OccupationOption>();
    for (const o of locallyCreatedOccupations) byId.set(o.id, o);
    for (const o of occupations) {
      if (!byId.has(o.id)) byId.set(o.id, { id: o.id, name: o.name, isActive: o.isActive });
    }
    return [...byId.values()];
  }, [occupations, locallyCreatedOccupations]);

  const onSubmit = handleSubmit((data) =>
    submit(data, upsertRequisitionAction, {
      successMessage: isEdit ? 'Requisition updated' : 'Requisition created',
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit requisition' : 'New job requisition'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-6" noValidate>
          <FormSection title="Role">
            <FormField id="jr-employer" label="Employer">
              <Select id="jr-employer" {...register('employerId')}>
                {employers.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.legalName}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField id="jr-title" label="Job title" error={errors.title?.message}>
              <Input id="jr-title" aria-invalid={Boolean(errors.title)} {...register('title')} />
            </FormField>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <FormField id="jr-occupation" label="Occupation">
                <input type="hidden" {...register('occupationId')} />
                <OccupationPicker
                  inputId="jr-occupation"
                  options={occupationOptions}
                  value={form.watch('occupationId') ?? ''}
                  onChange={(id) => setValue('occupationId', id, { shouldDirty: true })}
                  onOptionsChanged={(created) =>
                    setLocallyCreatedOccupations((prev) => [created, ...prev])
                  }
                  placeholder="Select occupation…"
                />
              </FormField>
              <FormField id="jr-positions" label="Positions">
                <Input
                  id="jr-positions"
                  type="number"
                  min={1}
                  max={999}
                  aria-invalid={Boolean(errors.positionsRequired)}
                  {...register('positionsRequired', { valueAsNumber: true })}
                />
              </FormField>
              <FormField id="jr-type" label="Type">
                <Select id="jr-type" {...register('employmentType')}>
                  <option value="FULL_TIME">Full-time</option>
                  <option value="PART_TIME">Part-time</option>
                  <option value="CONTRACT">Contract</option>
                  <option value="TEMP">Temp</option>
                </Select>
              </FormField>
            </div>
            <FormField id="jr-location" label="Location">
              <Input id="jr-location" {...register('location')} />
            </FormField>
            <FormField id="jr-desc" label="Description">
              <Textarea id="jr-desc" rows={3} {...register('description')} />
            </FormField>
          </FormSection>

          <FormSection
            title="Compensation"
            description="Salary band shown to candidates during matching."
            collapsible
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <FormField id="jr-smin" label="Salary min">
                <Input id="jr-smin" inputMode="decimal" {...register('salaryMin')} />
              </FormField>
              <FormField id="jr-smax" label="Salary max">
                <Input id="jr-smax" inputMode="decimal" {...register('salaryMax')} />
              </FormField>
              <FormField id="jr-cur" label="Currency">
                <Select id="jr-cur" {...register('salaryCurrencyCode')}>
                  <option value="">— none —</option>
                  {currencies
                    .filter((c) => c.isActive || c.code === initial?.salaryCurrencyCode)
                    .map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code}
                      </option>
                    ))}
                </Select>
              </FormField>
            </div>
          </FormSection>

          <FormSection
            title="Admin"
            description="Lifecycle status and a target fill date for forecasting."
            collapsible
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField id="jr-status" label="Status">
                <Select id="jr-status" {...register('status')}>
                  <option value="DRAFT">Draft</option>
                  <option value="OPEN">Open</option>
                  <option value="IN_PROGRESS">In progress</option>
                  <option value="PARTIALLY_FILLED">Partially filled</option>
                  <option value="FILLED">Filled</option>
                  <option value="CLOSED">Closed</option>
                  <option value="CANCELLED">Cancelled</option>
                </Select>
              </FormField>
              <FormField id="jr-target" label="Target fill date">
                <Input id="jr-target" type="date" {...register('targetFillDate')} />
              </FormField>
            </div>
          </FormSection>
          <FormErrorAlert error={formError} />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <SubmitButton loading={isSubmitting}>
              {isEdit ? 'Save' : 'Create requisition'}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
