'use client';

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
import { createOccupationFromNameAction } from '@/modules/occupations/actions';

export type OccupationOption = {
  id: string;
  name: string;
  isActive: boolean;
};

/**
 * Occupation dropdown with an inline "+ New occupation…" affordance at the
 * bottom. Same shape as DocumentTypePicker so any operator who's used one
 * knows how to use the other. The list shows every active occupation in
 * the catalog; the last row is "+ New occupation…" which opens a small
 * dialog for the name. On save the row is inserted into `occupations`
 * (under an 'Uncategorised' bucket) via createOccupationFromNameAction —
 * appears in every OTHER occupation dropdown across the app from that
 * moment on. Admins can recategorise inline-created rows later from
 * /admin/occupations without breaking existing bindings.
 *
 * Never mutates `options` in place — the parent should either refetch
 * after `onOptionsChanged` or hold its own local list state.
 */
export function OccupationPicker({
  options,
  value,
  onChange,
  onOptionsChanged,
  disabled = false,
  inputId,
  placeholder = 'Select occupation…',
}: {
  options: OccupationOption[];
  value: string;
  onChange: (id: string) => void;
  /** Called with the freshly created row so the parent can prepend to its list. */
  onOptionsChanged?: (created: OccupationOption) => void;
  disabled?: boolean;
  inputId?: string;
  placeholder?: string;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [pending, startTransition] = useTransition();

  // Include the currently-selected occupation even if it's inactive, so
  // an existing profile that was tied to a since-deactivated occupation
  // still renders correctly. Everything else is active + sorted.
  const sorted = useMemo(() => {
    const filtered = options.filter((o) => o.isActive || o.id === value);
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [options, value]);

  const OTHER = '__OTHER__';

  const create = () => {
    if (newName.trim().length < 2) {
      toast.error('Name must be at least 2 characters');
      return;
    }
    startTransition(async () => {
      const r = await createOccupationFromNameAction({ name: newName.trim() });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      const created: OccupationOption = {
        id: r.data.id,
        name: r.data.name,
        isActive: r.data.isActive,
      };
      onOptionsChanged?.(created);
      onChange(created.id);
      toast.success(`Added "${created.name}" — now available everywhere`);
      setDialogOpen(false);
      setNewName('');
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
        {sorted.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
        <option value={OTHER}>+ New occupation…</option>
      </Select>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add an occupation</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="occ-name">Name</Label>
              <Input
                id="occ-name"
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Marine engineer"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') create();
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                Appears in every occupation dropdown across the CRM from now on. An admin can
                recategorise it later from <span className="font-mono">/admin/occupations</span>.
              </p>
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={create} disabled={pending || newName.trim().length < 2}>
              Add occupation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
