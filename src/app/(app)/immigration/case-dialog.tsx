'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { type ReactElement, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { FormErrorAlert } from '@/components/form-error-alert';
import { FormField } from '@/components/form-field';
import { PersonPicker } from '@/components/person-picker';
import { PersonPreviewCard } from '@/components/person-preview-card';
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
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { ImmigrationApplicationType, ImmigrationCase } from '@/lib/db/schema/immigration';
import type { Person } from '@/lib/db/schema/persons';
import type { Employer } from '@/lib/db/schema/recruitment';
import { useFormDialog } from '@/lib/hooks/use-form-dialog';
import { upsertCaseAction } from '@/modules/immigration/actions';
import { type UpsertCaseInput, UpsertCaseSchema } from '@/modules/immigration/schemas';

type Props = {
  trigger: ReactElement;
  persons: Person[];
  employers: Employer[];
  applicationTypes: ImmigrationApplicationType[];
  initial?: ImmigrationCase;
};

export function CaseDialog({ trigger, persons, employers, applicationTypes, initial }: Props) {
  const isEdit = Boolean(initial);
  const form = useForm<UpsertCaseInput>({
    resolver: zodResolver(UpsertCaseSchema),
    defaultValues: {
      id: initial?.id,
      caseType: initial?.caseType ?? 'EMPLOYMENT_PERMIT',
      applicationTypeId: initial?.applicationTypeId ?? '',
      beneficiaryPersonId: initial?.beneficiaryPersonId ?? '',
      sponsorEmployerId: initial?.sponsorEmployerId ?? '',
      relatedPlacementId: initial?.relatedPlacementId ?? '',
      relatedJobRequisitionId: initial?.relatedJobRequisitionId ?? '',
      serviceEngagementId: initial?.serviceEngagementId ?? '',
      status: initial?.status ?? 'OPEN',
      authorityReference: initial?.authorityReference ?? '',
      submittedAt: initial?.submittedAt ?? '',
      decisionAt: initial?.decisionAt ?? '',
      expiresOn: initial?.expiresOn ?? '',
      reminderOn: initial?.reminderOn ?? '',
      notes: initial?.notes ?? '',
    },
  });
  // Category (caseType) filters the application-type dropdown — when the user
  // switches from Employment Permit to Visa, the visible list must switch too.
  const watchedCategory = useWatch({ control: form.control, name: 'caseType' });
  const filteredTypes = useMemo(
    () => applicationTypes.filter((t) => t.isActive && t.category === watchedCategory),
    [applicationTypes, watchedCategory],
  );
  // Preview the selected beneficiary inline so the operator can confirm at a
  // glance that they picked the right person without leaving the dialog.
  const watchedBeneficiaryId = useWatch({ control: form.control, name: 'beneficiaryPersonId' });
  const selectedPerson = useMemo(
    () => persons.find((p) => p.id === watchedBeneficiaryId) ?? null,
    [persons, watchedBeneficiaryId],
  );
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;
  const { open, onOpenChange, formError, submit } = useFormDialog(form);

  const onSubmit = handleSubmit((data) =>
    submit(data, upsertCaseAction, {
      successMessage: isEdit ? 'Case updated' : 'Case opened',
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit immigration case' : 'Open immigration case'}</DialogTitle>
          <DialogDescription>
            Permit, Visa, and Visa Extension cases share this form. A case does not need to link to
            an internal placement — independent employer-driven cases are supported.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="ic-type" label="Case type">
              <Select id="ic-type" {...register('caseType')}>
                <option value="EMPLOYMENT_PERMIT">Employment permit</option>
                <option value="VISA">Visa</option>
                <option value="VISA_EXTENSION">Visa extension</option>
              </Select>
            </FormField>
            <FormField id="ic-status" label="Status">
              <Select id="ic-status" {...register('status')}>
                <option value="OPEN">Open</option>
                <option value="DOCUMENTS_PENDING">Documents pending</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="UNDER_AUTHORITY_REVIEW">Under authority review</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="CLOSED">Closed</option>
              </Select>
            </FormField>
          </div>

          <FormField
            id="ic-apptype"
            label="Application type"
            hint={
              filteredTypes.length === 0 ? (
                <span className="text-amber-600 dark:text-amber-500">
                  No active application types for the{' '}
                  {watchedCategory.toLowerCase().replace('_', ' ')} category.{' '}
                  <Link
                    href="/admin/immigration-types"
                    className="underline hover:text-foreground"
                    target="_blank"
                  >
                    Add one
                  </Link>{' '}
                  (e.g. Critical Skills Work Permit, General Employment Permit), then reopen this
                  dialog.
                </span>
              ) : (
                <>
                  Specific type under the {watchedCategory.toLowerCase().replace('_', ' ')}{' '}
                  category.{' '}
                  <Link
                    href="/admin/immigration-types"
                    className="underline hover:text-foreground"
                    target="_blank"
                  >
                    Manage types
                  </Link>
                  .
                </>
              )
            }
          >
            <Select id="ic-apptype" {...register('applicationTypeId')}>
              <option value="">
                {filteredTypes.length === 0 ? '— none yet — add via Manage types →' : '— select —'}
              </option>
              {filteredTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField
            id="ic-beneficiary"
            label="Beneficiary"
            error={errors.beneficiaryPersonId?.message}
            hint="Search an existing candidate, or add a new one on the fly."
          >
            <div className="space-y-2">
              <PersonPicker
                id="ic-beneficiary"
                persons={persons}
                value={form.watch('beneficiaryPersonId')}
                onChange={(id) =>
                  form.setValue('beneficiaryPersonId', id, {
                    shouldValidate: true,
                    shouldDirty: true,
                  })
                }
                invalid={Boolean(errors.beneficiaryPersonId)}
                placeholder="Select or add candidate"
              />
              {selectedPerson && <PersonPreviewCard person={selectedPerson} />}
            </div>
          </FormField>

          <FormField id="ic-sponsor" label="Sponsor employer (optional)">
            <Select id="ic-sponsor" {...register('sponsorEmployerId')}>
              <option value="">— none —</option>
              {employers.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.legalName}
                </option>
              ))}
            </Select>
          </FormField>

          <div className="grid grid-cols-3 gap-3">
            <FormField id="ic-submitted" label="Submitted">
              <Input id="ic-submitted" type="date" {...register('submittedAt')} />
            </FormField>
            <FormField id="ic-decision" label="Decision">
              <Input id="ic-decision" type="date" {...register('decisionAt')} />
            </FormField>
            <FormField id="ic-expires" label="Expires">
              <Input id="ic-expires" type="date" {...register('expiresOn')} />
            </FormField>
          </div>

          <FormField
            id="ic-reminder"
            label="Reminder date"
            hint="A follow-up task fires on this date. Clear the field to remove the reminder."
          >
            <Input id="ic-reminder" type="date" {...register('reminderOn')} />
          </FormField>

          <FormField id="ic-ref" label="Authority reference">
            <Input id="ic-ref" placeholder="Govt case number" {...register('authorityReference')} />
          </FormField>

          <FormField id="ic-notes" label="Notes">
            <Textarea id="ic-notes" rows={3} {...register('notes')} />
          </FormField>

          <FormErrorAlert error={formError} />

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <SubmitButton loading={isSubmitting}>{isEdit ? 'Save' : 'Open case'}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
