'use client';

import { Plus } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { createDocumentTypeFromNameAction } from '@/modules/document-types/actions';

export type DocumentTypeOption = {
  id: string;
  code: string;
  name: string;
  hasExpiry: boolean;
};

/**
 * Doc-type dropdown with an inline "+ New type…" affordance at the bottom.
 * Clicking that opens a small dialog for the display name (+ optional
 * "has expiry" flag). On save, the type is inserted into `document_types`
 * (via createDocumentTypeFromNameAction) so it immediately shows up in
 * every OTHER dropdown in the app — matches Tracey's ask: "if I use a new
 * type of document then that name has to pop up in all the new cases."
 *
 * The picker never mutates `options` in place — the parent should
 * refetch after `onOptionsChanged` fires so React state stays coherent.
 */
export function DocumentTypePicker({
  options,
  value,
  onChange,
  onOptionsChanged,
  disabled = false,
  inputId,
  placeholder = 'Select type…',
}: {
  options: DocumentTypeOption[];
  value: string;
  onChange: (id: string) => void;
  /** Called with the freshly created type so the parent can add it to its list. */
  onOptionsChanged?: (created: DocumentTypeOption) => void;
  disabled?: boolean;
  inputId?: string;
  placeholder?: string;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newHasExpiry, setNewHasExpiry] = useState(false);
  const [pending, startTransition] = useTransition();

  const sorted = useMemo(
    () => [...options].sort((a, b) => a.name.localeCompare(b.name)),
    [options],
  );

  const OTHER = '__OTHER__';

  const create = () => {
    if (newName.trim().length < 2) {
      toast.error('Name must be at least 2 characters');
      return;
    }
    startTransition(async () => {
      const r = await createDocumentTypeFromNameAction({
        name: newName.trim(),
        hasExpiry: newHasExpiry,
      });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      const created: DocumentTypeOption = {
        id: r.data.id,
        code: r.data.code,
        name: r.data.name,
        hasExpiry: r.data.hasExpiry,
      };
      onOptionsChanged?.(created);
      onChange(created.id);
      toast.success(`Added "${created.name}" — now available everywhere`);
      setDialogOpen(false);
      setNewName('');
      setNewHasExpiry(false);
    });
  };

  return (
    <>
      <Select
        id={inputId}
        value={value}
        onChange={(e) => {
          if (e.target.value === OTHER) {
            setDialogOpen(true);
            // Keep the previous value so if they cancel, the dropdown stays sane.
            return;
          }
          onChange(e.target.value);
        }}
        disabled={disabled}
      >
        <option value="">{placeholder}</option>
        {sorted.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
        <option value={OTHER}>+ New type…</option>
      </Select>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add a document type</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="dt-name">Name</Label>
              <Input
                id="dt-name"
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Character reference"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') create();
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                Appears in every document dropdown across the CRM from now on.
              </p>
            </div>
            <label className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={newHasExpiry}
                onChange={(e) => setNewHasExpiry(e.target.checked)}
                className="mt-0.5 size-4 accent-primary"
              />
              <span className="flex-1">
                <span className="font-medium">Has expiry</span>
                <span className="block text-xs text-muted-foreground">
                  Tick if the document expires (e.g. Police Clearance, Bank Statement).
                  Uploads will surface an expiry-date field.
                </span>
              </span>
            </label>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={create} disabled={pending || newName.trim().length < 2}>
              Add type
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
