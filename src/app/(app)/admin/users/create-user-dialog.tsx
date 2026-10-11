'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FormErrorAlert } from '@/components/form-error-alert';
import { FormField } from '@/components/form-field';
import { FormSection } from '@/components/form-section';
import { SubmitButton } from '@/components/submit-button';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useFormDialog } from '@/lib/hooks/use-form-dialog';
import { upsertStaffProfileAction } from '@/modules/hr/actions';
import { createUserAction } from '@/modules/users/actions';
import { type CreateUserInput, CreateUserSchema } from '@/modules/users/schemas';

/**
 * Phase 2 blueprint §9.1 — single-stop onboarding.
 *
 * Previously adding a new staff member was a two-stop journey: an
 * admin created the user here, then went to `/hr/admin` and edited
 * the Staff Directory to add their department / position / manager.
 * Nothing told the admin step 2 was required — so employees landed
 * in the system with no HR profile and reporting silently broke.
 *
 * This dialog now has an optional "Employment details" section. If
 * the admin fills any field, a second server round-trip upserts the
 * staff profile straight after the user is created. If they leave
 * them blank (because they don't know yet), the user still gets
 * created and HR can fill the profile in later via /hr/admin — same
 * surface as before.
 */
export function CreateUserDialog({
  canGrantOwner = false,
}: {
  /**
   * Session 33 — show the "Business owner" checkbox only to current
   * owners. The parent server page passes this from
   * `session.user.isOwner`. The server action also gates on
   * requireOwner for the isOwner=true path, so this is UX, not
   * security.
   */
  canGrantOwner?: boolean;
}) {
  const form = useForm<CreateUserInput>({
    resolver: zodResolver(CreateUserSchema),
    defaultValues: {
      email: '',
      fullName: '',
      role: 'STAFF',
      password: '',
      isOwner: false,
    },
  });
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = form;
  const { open, onOpenChange, formError, submit } = useFormDialog(form);
  const [department, setDepartment] = useState('');
  const [position, setPosition] = useState('');
  const [joiningDate, setJoiningDate] = useState('');
  const isOwnerChecked = watch('isOwner') === true;

  const hasHrFields =
    department.trim().length > 0 || position.trim().length > 0 || joiningDate.length > 0;

  const onSubmit = handleSubmit(async (data) => {
    await submit(data, createUserAction, {
      successMessage: 'User created',
      onSuccess: async (created) => {
        toast.success(`Created ${created.email}`);
        // Chain the staff profile upsert if the admin filled any
        // employment field. A failure here doesn't roll back the user
        // (already committed) — surface it as a warning so the admin
        // knows to finish setup in /hr/admin.
        if (hasHrFields) {
          const hrResult = await upsertStaffProfileAction({
            userId: created.id,
            department: department.trim() || undefined,
            position: position.trim() || undefined,
            joiningDate: joiningDate || undefined,
            status: 'ACTIVE',
          });
          if (hrResult.ok) {
            toast.success('Employment details saved');
            setDepartment('');
            setPosition('');
            setJoiningDate('');
          } else {
            toast.warning(
              `User created, but HR profile needs saving manually: ${hrResult.error.message}`,
            );
          }
        }
      },
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="mr-1.5 size-4" />
        New user
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a new user</DialogTitle>
          <DialogDescription>
            They'll be able to sign in immediately with the password you set. Share it via a secure
            channel — they can change it after first login (feature arrives in a later milestone).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField id="cu-email" label="Email" error={errors.email?.message}>
            <Input
              id="cu-email"
              type="email"
              autoComplete="off"
              aria-invalid={Boolean(errors.email)}
              {...register('email')}
            />
          </FormField>

          <FormField id="cu-name" label="Full name" error={errors.fullName?.message}>
            <Input
              id="cu-name"
              type="text"
              autoComplete="off"
              aria-invalid={Boolean(errors.fullName)}
              {...register('fullName')}
            />
          </FormField>

          <FormField id="cu-role" label="Role">
            <Select id="cu-role" {...register('role')}>
              <option value="STAFF">STAFF — generic internal user</option>
              <option value="MANAGER">MANAGER — team lead (sees direct reports)</option>
              <option value="RECRUITER">RECRUITER — recruitment focus</option>
              <option value="DOCUMENT_SPECIALIST">
                DOCUMENT SPECIALIST — candidate document review
              </option>
              <option value="FINANCE">FINANCE — payments + invoices</option>
              <option value="ADMIN">ADMIN — full access + user management</option>
            </Select>
          </FormField>

          <FormField id="cu-password" label="Initial password" error={errors.password?.message}>
            <Input
              id="cu-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.password)}
              {...register('password')}
            />
          </FormField>

          {canGrantOwner && (
            <div className="flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
              <Checkbox
                id="cu-is-owner"
                checked={isOwnerChecked}
                onCheckedChange={(v) =>
                  setValue('isOwner', v === true, { shouldDirty: true, shouldTouch: true })
                }
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label htmlFor="cu-is-owner" className="text-sm font-medium">
                  Business owner
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Grants permission bypass and the ability to reassign any record. Use for
                  co-founders / partners. The owner flag can be revoked later from the user's detail
                  page.
                </p>
              </div>
            </div>
          )}

          <FormSection
            title="Employment details"
            description="Optional. If known at creation, we save them in the same step so this person's HR profile isn't a to-do item. Skip and HR can fill them in later from the Staff Directory."
            collapsible
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField id="cu-department" label="Department">
                <Input
                  id="cu-department"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. Recruitment"
                />
              </FormField>
              <FormField id="cu-position" label="Position">
                <Input
                  id="cu-position"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder="e.g. Senior Recruiter"
                />
              </FormField>
            </div>
            <FormField id="cu-joining" label="Joining date">
              <Input
                id="cu-joining"
                type="date"
                value={joiningDate}
                onChange={(e) => setJoiningDate(e.target.value)}
              />
            </FormField>
          </FormSection>

          <FormErrorAlert error={formError} />

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <SubmitButton loading={isSubmitting}>Create user</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
