'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileText,
  Loader2,
  Trash2,
  User,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { DocumentUploader } from '@/components/document-uploader';
import { FadeUp } from '@/components/motion/motion-primitives';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  discardDraftAction,
  finaliseDraftAction,
  updateDraftPersonAction,
} from '@/modules/candidates/onboarding-actions';

type Draft = {
  personId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  nationality: string;
  currentCity: string;
  currentCountry: string;
  notes: string;
};

type Currency = { code: string; symbol: string };

type DocType = { id: string; name: string; code: string };
type UploadedDoc = { id: string; filename: string; documentTypeId: string };

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Debounces `fn` by `ms` milliseconds. Re-issuing during the wait cancels
 * the pending call and restarts the timer.
 */
function useDebounced<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  const ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback(
    ((...args: Parameters<T>) => {
      if (ref.current) clearTimeout(ref.current);
      ref.current = setTimeout(() => fn(...args), ms);
    }) as T,
    [fn, ms],
  );
}

export function OnboardingForm({
  draft,
  currencies,
  docTypes,
  existingDocuments,
}: {
  draft: Draft;
  currencies: Currency[];
  docTypes: DocType[];
  existingDocuments: UploadedDoc[];
}) {
  const router = useRouter();

  // Personal / contact section state.
  const [personal, setPersonal] = useState({
    firstName: draft.firstName,
    lastName: draft.lastName,
    email: draft.email,
    phone: draft.phone,
    dateOfBirth: draft.dateOfBirth,
    nationality: draft.nationality,
    currentCity: draft.currentCity,
    currentCountry: draft.currentCountry,
    notes: draft.notes,
  });

  const [saveState, setSaveState] = useState<SaveState>('idle');

  const savePersonal = useCallback(
    async (patch: typeof personal) => {
      setSaveState('saving');
      // Zod transforms empty strings → undefined via `.optional()`; pass the
      // raw values through and let the schema handle normalisation.
      const result = await updateDraftPersonAction({
        personId: draft.personId,
        firstName: patch.firstName,
        lastName: patch.lastName,
        email: patch.email,
        phone: patch.phone,
        dateOfBirth: patch.dateOfBirth,
        nationality: patch.nationality,
        currentCity: patch.currentCity,
        currentCountry: patch.currentCountry,
        notes: patch.notes,
      });
      if (result.ok) {
        setSaveState('saved');
        setTimeout(() => setSaveState('idle'), 1200);
      } else {
        setSaveState('error');
      }
    },
    [draft.personId],
  );
  const debouncedSavePersonal = useDebounced(savePersonal, 800);

  useEffect(() => {
    debouncedSavePersonal(personal);
  }, [personal, debouncedSavePersonal]);

  // Payment section state.
  const [payment, setPayment] = useState({
    amount: '',
    currencyCode: currencies.find((c) => c.code === 'EUR')?.code ?? currencies[0]?.code ?? 'EUR',
    method: 'BANK_TRANSFER' as 'BANK_TRANSFER' | 'CASH' | 'OTHER',
    proofReference: '',
    receivedAt: new Date().toISOString().slice(0, 10),
    notes: '',
  });

  const [coverLetter, setCoverLetter] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  // Documents attached to this draft — seeded from what's already on the
  // person row (browser refresh survives them) and appended to on each
  // successful upload. The rows exist in the DB before finalise; once
  // finaliseDraft flips the person's is_draft flag they become visible on
  // the candidate detail page's Documents section automatically.
  const [uploads, setUploads] = useState<UploadedDoc[]>(existingDocuments);
  const [selectedDocTypeId, setSelectedDocTypeId] = useState<string>(docTypes[0]?.id ?? '');

  const canFinalise =
    personal.firstName.trim().length > 0 &&
    personal.lastName.trim().length > 0 &&
    payment.amount.trim().length > 0 &&
    payment.currencyCode.trim().length > 0 &&
    payment.receivedAt.trim().length > 0;

  async function handleCreate() {
    setFormError(null);
    setFieldErrors({});
    setSubmitting(true);
    // Flush any in-flight debounced save.
    await savePersonal(personal);
    const result = await finaliseDraftAction({
      personId: draft.personId,
      payment,
      coverLetter,
    });
    setSubmitting(false);
    if (!result.ok) {
      if (result.error.fields) setFieldErrors(result.error.fields);
      setFormError(result.error.message);
      toast.error(result.error.message);
      return;
    }
    toast.success(`Candidate created — ${result.data.invoiceNumber}`);
    router.replace(`/candidates/${result.data.personId}?just_created=1`);
    router.refresh();
  }

  async function handleDiscard() {
    setDiscarding(true);
    const result = await discardDraftAction(draft.personId);
    setDiscarding(false);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Draft discarded');
    router.replace('/candidates');
    router.refresh();
  }

  return (
    <div className="space-y-6 pb-32">
      <FadeUp delay={0.05}>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="size-4 text-muted-foreground" />
              <CardTitle className="text-base">Personal & contact</CardTitle>
            </div>
            <SaveIndicator state={saveState} />
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <FieldPair
              id="firstName"
              label="First name *"
              value={personal.firstName}
              onChange={(v) => setPersonal((p) => ({ ...p, firstName: v }))}
              error={fieldErrors.firstName}
            />
            <FieldPair
              id="lastName"
              label="Last name *"
              value={personal.lastName}
              onChange={(v) => setPersonal((p) => ({ ...p, lastName: v }))}
              error={fieldErrors.lastName}
            />
            <FieldPair
              id="email"
              label="Email"
              type="email"
              value={personal.email}
              onChange={(v) => setPersonal((p) => ({ ...p, email: v }))}
            />
            <FieldPair
              id="phone"
              label="Phone"
              value={personal.phone}
              onChange={(v) => setPersonal((p) => ({ ...p, phone: v }))}
            />
            <FieldPair
              id="dateOfBirth"
              label="Date of birth"
              type="date"
              value={personal.dateOfBirth}
              onChange={(v) => setPersonal((p) => ({ ...p, dateOfBirth: v }))}
            />
            <FieldPair
              id="nationality"
              label="Nationality"
              value={personal.nationality}
              onChange={(v) => setPersonal((p) => ({ ...p, nationality: v }))}
            />
            <FieldPair
              id="currentCity"
              label="Current city"
              value={personal.currentCity}
              onChange={(v) => setPersonal((p) => ({ ...p, currentCity: v }))}
            />
            <FieldPair
              id="currentCountry"
              label="Current country"
              value={personal.currentCountry}
              onChange={(v) => setPersonal((p) => ({ ...p, currentCountry: v }))}
            />
            <div className="md:col-span-2 space-y-1.5">
              <Label htmlFor="notes">Notes / profile summary</Label>
              <textarea
                id="notes"
                className="w-full min-h-24 rounded-md border border-input bg-background p-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                value={personal.notes}
                onChange={(e) => setPersonal((p) => ({ ...p, notes: e.currentTarget.value }))}
                placeholder="Short bio, key achievements, anything worth surfacing to recruiters…"
                maxLength={2000}
              />
            </div>
          </CardContent>
        </Card>
      </FadeUp>

      <FadeUp delay={0.1}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cover letter</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Optional. Free-form text — paste the full cover letter or leave blank.
            </p>
          </CardHeader>
          <CardContent>
            <textarea
              className="w-full min-h-40 rounded-md border border-input bg-background p-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              value={coverLetter}
              onChange={(e) => setCoverLetter(e.currentTarget.value)}
              maxLength={10000}
              placeholder="Dear hiring manager,…"
            />
          </CardContent>
        </Card>
      </FadeUp>

      <FadeUp delay={0.15}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Documents</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              CV, cover letter PDF, passport, degree certificates — anything you want on file.
              Uploads attach to the draft candidate and stay with it after Create.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {docTypes.length === 0 ? (
              <p className="rounded-md border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
                No person-applicable document types are configured. Add some under Admin → Document
                types and come back.
              </p>
            ) : (
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-52 flex-1 space-y-1.5">
                  <Label htmlFor="docType">Document type</Label>
                  <select
                    id="docType"
                    className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                    value={selectedDocTypeId}
                    onChange={(e) => setSelectedDocTypeId(e.currentTarget.value)}
                  >
                    {docTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                {/* `key` forces a fresh uploader after every successful upload
                    so the button label resets from "Uploaded" back to "Upload
                    file" and staff can add another doc without an extra click. */}
                <DocumentUploader
                  key={`${selectedDocTypeId}:${uploads.length}`}
                  ownerType="PERSON"
                  ownerId={draft.personId}
                  documentTypeId={selectedDocTypeId}
                  onUploaded={(doc) =>
                    setUploads((prev) => [
                      ...prev,
                      {
                        id: doc.id,
                        filename: doc.originalFilename,
                        documentTypeId: doc.documentTypeId,
                      },
                    ])
                  }
                />
              </div>
            )}

            {uploads.length > 0 && (
              <ul className="divide-y rounded-md border">
                {uploads.map((u) => {
                  const typeName =
                    docTypes.find((t) => t.id === u.documentTypeId)?.name ?? 'Document';
                  return (
                    <li
                      key={u.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{u.filename}</p>
                          <p className="text-[11px] text-muted-foreground">{typeName}</p>
                        </div>
                      </div>
                      <span className="text-[10px] uppercase tracking-wider text-emerald-600">
                        Attached
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </FadeUp>

      <FadeUp delay={0.2}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment *</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Required. Enter the amount received before creating the profile. An invoice and
              receipt are generated automatically on Create.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <FieldPair
              id="amount"
              label="Amount *"
              type="text"
              inputMode="decimal"
              value={payment.amount}
              onChange={(v) => setPayment((p) => ({ ...p, amount: v }))}
              error={fieldErrors['payment.amount']}
              placeholder="e.g. 750.00"
            />
            <div className="space-y-1.5">
              <Label htmlFor="currencyCode">Currency *</Label>
              <select
                id="currencyCode"
                className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                value={payment.currencyCode}
                onChange={(e) => setPayment((p) => ({ ...p, currencyCode: e.currentTarget.value }))}
              >
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} ({c.symbol})
                  </option>
                ))}
              </select>
              {fieldErrors['payment.currencyCode'] && (
                <p className="text-xs text-destructive">{fieldErrors['payment.currencyCode']}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="method">Method *</Label>
              <select
                id="method"
                className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                value={payment.method}
                onChange={(e) =>
                  setPayment((p) => ({
                    ...p,
                    method: e.currentTarget.value as typeof payment.method,
                  }))
                }
              >
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="CASH">Cash</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <FieldPair
              id="receivedAt"
              label="Received on *"
              type="date"
              value={payment.receivedAt}
              onChange={(v) => setPayment((p) => ({ ...p, receivedAt: v }))}
              error={fieldErrors['payment.receivedAt']}
            />
            <FieldPair
              id="proofReference"
              label="Proof reference"
              value={payment.proofReference}
              onChange={(v) => setPayment((p) => ({ ...p, proofReference: v }))}
              placeholder="Bank statement ID, transaction ref…"
            />
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="paymentNotes">Notes</Label>
              <textarea
                id="paymentNotes"
                className="w-full min-h-20 rounded-md border border-input bg-background p-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                value={payment.notes}
                onChange={(e) => setPayment((p) => ({ ...p, notes: e.currentTarget.value }))}
                maxLength={2000}
              />
            </div>
          </CardContent>
        </Card>
      </FadeUp>

      <AnimatePresence>
        {formError && (
          <motion.div
            key="form-err"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{formError}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sticky bottom action bar — Discard on the left, Create on the right. */}
      <div className="pointer-events-none fixed bottom-6 right-6 z-40 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setDiscardOpen(true)}
          disabled={submitting || discarding}
          className="pointer-events-auto inline-flex h-11 items-center justify-center rounded-lg border border-input bg-background/95 px-4 text-sm font-medium text-muted-foreground shadow-lg shadow-foreground/5 backdrop-blur transition-all hover:text-destructive hover:border-destructive/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Trash2 className="mr-1.5 size-4" />
          Discard draft
        </button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={!canFinalise || submitting || discarding}
          className="pointer-events-auto inline-flex h-11 items-center justify-center rounded-lg bg-accent px-5 text-sm font-semibold text-accent-foreground shadow-lg shadow-foreground/10 transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Creating…
            </>
          ) : (
            <>
              Create candidate
              <ArrowRight className="ml-2 size-4" />
            </>
          )}
        </button>
      </div>

      <Dialog
        open={discardOpen}
        onOpenChange={(next) => {
          if (!discarding) setDiscardOpen(next);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard this draft?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The draft candidate row is deleted — nothing is saved. The invoice and receipt have not
            been generated yet, so this leaves no financial trail. Cancel if you'd rather leave the
            draft in place and come back to it later.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDiscardOpen(false)} disabled={discarding}>
              Keep draft
            </Button>
            <Button variant="destructive" onClick={handleDiscard} disabled={discarding}>
              {discarding && <Loader2 className="mr-2 size-4 animate-spin" />}
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FieldPair({
  id,
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  inputMode,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        aria-invalid={Boolean(error)}
      />
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {state === 'saving' && (
        <>
          <Loader2 className="size-3 animate-spin" /> Saving…
        </>
      )}
      {state === 'saved' && (
        <>
          <CheckCircle2 className="size-3 text-accent" /> Saved
        </>
      )}
      {state === 'error' && (
        <>
          <AlertCircle className="size-3 text-destructive" />{' '}
          <span className="text-destructive">Save failed</span>
        </>
      )}
    </div>
  );
}
