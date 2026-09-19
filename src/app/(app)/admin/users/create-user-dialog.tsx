'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
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
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useFormDialog } from '@/lib/hooks/use-form-dialog';
import { createUserAction } from '@/modules/users/actions';
import { type CreateUserInput, CreateUserSchema } from '@/modules/users/schemas';

export function CreateUserDialog() {
  const form = useForm<CreateUserInput>({
    resolver: zodResolver(CreateUserSchema),
    defaultValues: { email: '', fullName: '', role: 'STAFF', password: '' },
  });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;
  const { open, onOpenChange, formError, submit } = useFormDialog(form);

  const onSubmit = handleSubmit(async (data) => {
    // Custom success message references the created email, so we use
    // submit() with a placeholder and then re-toast — cheaper than a
    // bespoke code path.
    await submit(data, createUserAction, {
      successMessage: 'User created',
      onSuccess: (created) => toast.success(`Created ${created.email}`),
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
