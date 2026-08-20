'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { AlertCircle, Loader2, Plus } from 'lucide-react';
import { useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Person } from '@/lib/db/schema/persons';
import type { Employer } from '@/lib/db/schema/recruitment';
import { createCommunicationAction } from '@/modules/activities/actions';
import {
  type CreateCommunicationInput,
  CreateCommunicationSchema,
} from '@/modules/activities/schemas';

type Props = { persons: Person[]; employers: Employer[] };

export function LogCommDialog({ persons, employers }: Props) {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateCommunicationInput>({
    resolver: zodResolver(CreateCommunicationSchema),
    defaultValues: {
      type: 'EMAIL',
      direction: 'OUTBOUND',
      occurredAt: '',
      subject: '',
      body: '',
      personId: '',
      employerId: '',
      employerContactId: '',
      jobRequisitionId: '',
      serviceEngagementId: '',
      immigrationCaseId: '',
      followUpRequired: false,
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    const r = await createCommunicationAction(data);
    if (!r.ok) {
      setFormError(r.error.message);
      return;
    }
    toast.success('Communication logged');
    reset();
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
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus className="mr-1.5 size-4" /> Log communication
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Log a communication</DialogTitle>
          <DialogDescription>
            Attach to at least one subject (person, employer, requisition, engagement, or case).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cl-type">Type</Label>
              <select
                id="cl-type"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                {...register('type')}
              >
                <option value="EMAIL">Email</option>
                <option value="PHONE">Phone</option>
                <option value="MEETING">Meeting</option>
                <option value="INTERNAL_NOTE">Internal note</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cl-dir">Direction</Label>
              <select
                id="cl-dir"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                {...register('direction')}
              >
                <option value="OUTBOUND">Outbound</option>
                <option value="INBOUND">Inbound</option>
                <option value="INTERNAL">Internal</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cl-subject">Subject</Label>
            <Input id="cl-subject" {...register('subject')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cl-body">Body / notes</Label>
            <textarea
              id="cl-body"
              rows={4}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              {...register('body')}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cl-person">Person</Label>
              <select
                id="cl-person"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                {...register('personId')}
              >
                <option value="">— none —</option>
                {persons.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.firstName} {p.lastName}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cl-employer">Employer</Label>
              <select
                id="cl-employer"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                {...register('employerId')}
              >
                <option value="">— none —</option>
                {employers.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.legalName}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {errors.personId && <p className="text-xs text-destructive">{errors.personId.message}</p>}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              {...register('followUpRequired')}
              className="size-4 accent-accent"
            />
            Follow-up required (auto-creates a task assigned to me)
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
              Log
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
