'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Save } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { easeStandard } from '@/components/motion/motion-primitives';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AppSettings } from '@/lib/db/schema/app_settings';
import { updateAppSettingsAction } from '@/modules/settings/actions';

/**
 * Admin form for the company letterhead + footer copy. Grouped into
 * four cards (Identity / Contact / Bank / Printable copy) so the owner
 * doesn't scroll past unrelated fields.
 *
 * Change detection uses a JSON-string diff between the initial payload
 * and the current form state — cheap, and correctly detects reorders
 * of the addressLines array.
 */
export function SettingsForm({ initial }: { initial: AppSettings }) {
  const [legalName, setLegalName] = useState(initial.legalName);
  const [fullLegalName, setFullLegalName] = useState(initial.fullLegalName);
  const [addressLinesText, setAddressLinesText] = useState(initial.addressLines.join('\n'));
  const [contactEmail, setContactEmail] = useState(initial.contactEmail);
  const [contactPhone, setContactPhone] = useState(initial.contactPhone ?? '');
  const [registrationNumber, setRegistrationNumber] = useState(initial.registrationNumber ?? '');
  const [vatNumber, setVatNumber] = useState(initial.vatNumber ?? '');
  const [bankName, setBankName] = useState(initial.bankName ?? '');
  const [bankAccountName, setBankAccountName] = useState(initial.bankAccountName ?? '');
  const [bankIban, setBankIban] = useState(initial.bankIban ?? '');
  const [bankBic, setBankBic] = useState(initial.bankBic ?? '');
  const [vatRatePercent, setVatRatePercent] = useState(initial.vatRatePercent);
  const [invoiceFooter, setInvoiceFooter] = useState(initial.invoiceFooter);
  const [receiptFooter, setReceiptFooter] = useState(initial.receiptFooter);
  const [pending, startTransition] = useTransition();

  const currentPayload = useMemo(
    () => ({
      legalName,
      fullLegalName,
      addressLines: addressLinesText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      contactEmail,
      contactPhone: contactPhone.trim() || null,
      registrationNumber: registrationNumber.trim() || null,
      vatNumber: vatNumber.trim() || null,
      bankName: bankName.trim() || null,
      bankAccountName: bankAccountName.trim() || null,
      bankIban: bankIban.trim() || null,
      bankBic: bankBic.trim() || null,
      vatRatePercent: vatRatePercent.trim() || '0.00',
      invoiceFooter,
      receiptFooter,
    }),
    [
      legalName,
      fullLegalName,
      addressLinesText,
      contactEmail,
      contactPhone,
      registrationNumber,
      vatNumber,
      bankName,
      bankAccountName,
      bankIban,
      bankBic,
      vatRatePercent,
      invoiceFooter,
      receiptFooter,
    ],
  );

  const initialPayload = useMemo(
    () => ({
      legalName: initial.legalName,
      fullLegalName: initial.fullLegalName,
      addressLines: initial.addressLines,
      contactEmail: initial.contactEmail,
      contactPhone: initial.contactPhone,
      registrationNumber: initial.registrationNumber,
      vatNumber: initial.vatNumber,
      bankName: initial.bankName,
      bankAccountName: initial.bankAccountName,
      bankIban: initial.bankIban,
      bankBic: initial.bankBic,
      vatRatePercent: initial.vatRatePercent,
      invoiceFooter: initial.invoiceFooter,
      receiptFooter: initial.receiptFooter,
    }),
    [initial],
  );

  const dirty = JSON.stringify(currentPayload) !== JSON.stringify(initialPayload);

  const onSave = () => {
    if (!currentPayload.legalName.trim() || !currentPayload.fullLegalName.trim()) {
      toast.error('Legal name and full legal name are required');
      return;
    }
    if (currentPayload.addressLines.length === 0) {
      toast.error('At least one address line is required');
      return;
    }
    startTransition(async () => {
      const r = await updateAppSettingsAction(currentPayload);
      if (r.ok) toast.success('Settings saved — the change is live on the next print');
      else toast.error(r.error.message);
    });
  };

  return (
    <div className="space-y-4 pb-24">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identity</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FieldWrap label="Legal name (brand)" htmlFor="legalName">
            <Input
              id="legalName"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="Ireland Career Gateway"
            />
          </FieldWrap>
          <FieldWrap label="Full legal name" htmlFor="fullLegalName">
            <Input
              id="fullLegalName"
              value={fullLegalName}
              onChange={(e) => setFullLegalName(e.target.value)}
              placeholder="Leon De Wit t/a Ireland Career Gateway"
            />
          </FieldWrap>
          <FieldWrap
            label="Registration number"
            htmlFor="registrationNumber"
            hint="RBN for a registered business name, or CRO for a company."
          >
            <Input
              id="registrationNumber"
              value={registrationNumber}
              onChange={(e) => setRegistrationNumber(e.target.value)}
              placeholder="Leave blank if none"
            />
          </FieldWrap>
          <FieldWrap label="VAT number" htmlFor="vatNumber" hint="Only if VAT-registered.">
            <Input
              id="vatNumber"
              value={vatNumber}
              onChange={(e) => setVatNumber(e.target.value)}
              placeholder="Leave blank if not registered"
            />
          </FieldWrap>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contact</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FieldWrap
            label="Address lines"
            htmlFor="addressLines"
            hint="One line per row — order preserved as rendered."
            span="sm:col-span-2"
          >
            <textarea
              id="addressLines"
              value={addressLinesText}
              onChange={(e) => setAddressLinesText(e.target.value)}
              rows={4}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              placeholder={'Rosslare Harbour\nWexford, Y35 YH22\nIreland'}
            />
          </FieldWrap>
          <FieldWrap label="Billing email" htmlFor="contactEmail">
            <Input
              id="contactEmail"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="billing@…"
            />
          </FieldWrap>
          <FieldWrap label="Phone (optional)" htmlFor="contactPhone">
            <Input
              id="contactPhone"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="+353 …"
            />
          </FieldWrap>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bank details (invoice footer)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FieldWrap label="Bank name" htmlFor="bankName">
            <Input id="bankName" value={bankName} onChange={(e) => setBankName(e.target.value)} />
          </FieldWrap>
          <FieldWrap label="Account holder" htmlFor="bankAccountName">
            <Input
              id="bankAccountName"
              value={bankAccountName}
              onChange={(e) => setBankAccountName(e.target.value)}
            />
          </FieldWrap>
          <FieldWrap label="IBAN" htmlFor="bankIban">
            <Input id="bankIban" value={bankIban} onChange={(e) => setBankIban(e.target.value)} />
          </FieldWrap>
          <FieldWrap label="BIC / SWIFT" htmlFor="bankBic">
            <Input id="bankBic" value={bankBic} onChange={(e) => setBankBic(e.target.value)} />
          </FieldWrap>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tax</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FieldWrap
            label="VAT rate (%)"
            htmlFor="vatRatePercent"
            hint="Ireland standard is 23. Set to 0 if not VAT-registered — the invoice will show 'VAT €0.00'."
          >
            <Input
              id="vatRatePercent"
              inputMode="decimal"
              value={vatRatePercent}
              onChange={(e) => setVatRatePercent(e.target.value)}
              placeholder="23.00"
            />
          </FieldWrap>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Printable copy</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <FieldWrap
            label="Invoice footer"
            htmlFor="invoiceFooter"
            hint="Shown at the bottom of every issued invoice."
          >
            <textarea
              id="invoiceFooter"
              value={invoiceFooter}
              onChange={(e) => setInvoiceFooter(e.target.value)}
              rows={2}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </FieldWrap>
          <FieldWrap
            label="Receipt footer"
            htmlFor="receiptFooter"
            hint="Shown at the bottom of every receipt."
          >
            <textarea
              id="receiptFooter"
              value={receiptFooter}
              onChange={(e) => setReceiptFooter(e.target.value)}
              rows={2}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </FieldWrap>
        </CardContent>
      </Card>

      {/* Save bar — mirrors the permissions editor pattern. Only
          renders when there are unsaved changes; hidden otherwise so
          the page has zero permanent visual weight. */}
      <AnimatePresence>
        {dirty && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.2, ease: easeStandard }}
            className="sticky bottom-4 z-20 mx-auto mt-6 flex w-fit items-center gap-2 rounded-full border bg-popover px-4 py-2 shadow-xl ring-1 ring-foreground/10"
          >
            <span className="text-xs text-muted-foreground">Unsaved changes</span>
            <Button size="sm" onClick={onSave} disabled={pending} className="h-8">
              <Save className="mr-1.5 size-3.5" />
              Save settings
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FieldWrap({
  label,
  htmlFor,
  hint,
  span,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  span?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${span ?? ''}`}>
      <Label htmlFor={htmlFor} className="text-xs font-medium">
        {label}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
