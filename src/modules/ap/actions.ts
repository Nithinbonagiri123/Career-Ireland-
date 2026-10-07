'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import {
  type CreateBillInput,
  type CreateSupplierInput,
  createSupplier,
  createSupplierBill,
  type RecordBillPaymentInput,
  recordBillPayment,
  type UpdateSupplierInput,
  updateSupplier,
  voidSupplierBill,
} from './service';

/**
 * Thin server-action wrappers around the AP service layer.
 * `toActionResult` turns thrown AppError/ValidationError/BusinessRuleError
 * into typed `{ ok: false, error }` payloads the client can surface in
 * a toast; everything else bubbles to logger + Sentry.
 */

export async function createSupplierAction(input: CreateSupplierInput) {
  const r = await toActionResult(() => createSupplier(input));
  if (r.ok) revalidatePath('/admin/accounting/ap/suppliers');
  return r;
}

export async function updateSupplierAction(input: UpdateSupplierInput) {
  const r = await toActionResult(() => updateSupplier(input));
  if (r.ok) revalidatePath('/admin/accounting/ap/suppliers');
  return r;
}

export async function createSupplierBillAction(input: CreateBillInput) {
  const r = await toActionResult(() => createSupplierBill(input));
  if (r.ok) {
    revalidatePath('/admin/accounting/ap/bills');
    revalidatePath('/admin/accounting');
  }
  return r;
}

export async function voidSupplierBillAction(input: { billId: string; reason: string }) {
  const r = await toActionResult(() => voidSupplierBill(input));
  if (r.ok) {
    revalidatePath('/admin/accounting/ap/bills');
    revalidatePath(`/admin/accounting/ap/bills/${input.billId}`);
  }
  return r;
}

export async function recordBillPaymentAction(input: RecordBillPaymentInput) {
  const r = await toActionResult(() => recordBillPayment(input));
  if (r.ok) {
    revalidatePath('/admin/accounting/ap/bills');
    revalidatePath(`/admin/accounting/ap/bills/${input.billId}`);
  }
  return r;
}
