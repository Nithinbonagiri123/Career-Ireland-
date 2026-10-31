import { createFormControl } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { openingValues } from './use-form-dialog';

/**
 * useFormDialog resets the form to `openingValues(...)` every time the dialog
 * opens. These tests run that rule against the installed react-hook-form
 * (no DOM needed): create dialogs open blank after a create or a Cancel, and
 * edit dialogs open on the record from the latest render.
 */

type Contact = { id?: string; fullName: string; isPrimary: boolean };
const BLANK: Contact = { fullName: '', isPrimary: false };

function makeForm(defaultValues: Contact) {
  const { formControl, control } = createFormControl<Contact>({ defaultValues });
  return { ...formControl, control };
}

/** What useForm does on every render: copy the latest props into control._options. */
function rerender(form: ReturnType<typeof makeForm>, defaultValues: Contact) {
  (form.control as unknown as { _options: { defaultValues: Contact } })._options = {
    defaultValues,
  };
}

/** What useFormDialog does when the dialog opens. */
function open(form: ReturnType<typeof makeForm>, first: Contact, values?: () => Contact) {
  form.reset(openingValues(form, first, values));
}

describe('useFormDialog opening values', () => {
  it('reproduces the old bug: reset(submitted) made the last entry the new default', () => {
    const form = makeForm(BLANK);
    form.reset({ fullName: 'Alice Primary', isPrimary: true }); // old success path
    form.reset(); // old Cancel / close path
    expect(form.getValues()).toEqual({ fullName: 'Alice Primary', isPrimary: true });
  });

  it('create dialog: opens blank again after a successful add', () => {
    const form = makeForm(BLANK);
    const first = structuredClone(form.getValues());
    form.setValue('fullName', 'Alice Primary');
    form.setValue('isPrimary', true);
    // success: no reset; the next open starts the session
    open(form, first);
    expect(form.getValues()).toEqual(BLANK);
  });

  it('create dialog: opens blank after Cancel, even if something called reset(data)', () => {
    const form = makeForm(BLANK);
    const first = structuredClone(form.getValues());
    form.reset({ fullName: 'Leftover', isPrimary: true });
    rerender(form, BLANK); // the parent re-renders with blank defaults
    open(form, first);
    expect(form.getValues()).toEqual(BLANK);
    expect(form.control._defaultValues).toEqual(BLANK); // Cancel-reset target is blank too
  });

  it('edit dialog: opens on the current record after router.refresh() changed it', () => {
    const bobAtMount: Contact = { id: 'b', fullName: 'Bob Second', isPrimary: true };
    const form = makeForm(bobAtMount);
    const first = structuredClone(form.getValues());
    // Alice was made primary elsewhere; the page refreshed and re-rendered Bob's row.
    rerender(form, { id: 'b', fullName: 'Bob Second', isPrimary: false });
    open(form, first);
    expect(form.getValues().isPrimary).toBe(false);
  });

  it('edit dialog: opens on the saved values after its own save + refresh', () => {
    const form = makeForm({ id: 'c', fullName: 'Old Name', isPrimary: false });
    const first = structuredClone(form.getValues());
    form.setValue('fullName', 'New Name');
    rerender(form, { id: 'c', fullName: 'New Name', isPrimary: false });
    form.setValue('fullName', 'Typed then cancelled');
    open(form, first);
    expect(form.getValues().fullName).toBe('New Name');
  });

  it('falls back to the first-render defaults when no latest defaults are known', () => {
    const form = makeForm(BLANK);
    const first = structuredClone(form.getValues());
    (form.control as unknown as { _options: { defaultValues?: unknown } })._options = {
      defaultValues: undefined,
    };
    form.setValue('fullName', 'Zed');
    open(form, first);
    expect(form.getValues()).toEqual(BLANK);
  });

  it('an explicit `values` getter wins and is read at open time', () => {
    const form = makeForm(BLANK);
    const first = structuredClone(form.getValues());
    let picked = 'Acme';
    const values = () => ({ fullName: picked, isPrimary: false });
    picked = 'Beta';
    open(form, first, values);
    expect(form.getValues().fullName).toBe('Beta');
  });
});
