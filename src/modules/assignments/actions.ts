'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import { type AssignableEntity, assignEntity } from './service';

const REVALIDATE_PATHS: Record<AssignableEntity, (id: string) => string[]> = {
  candidate: (id) => ['/candidates', `/candidates/${id}`],
  lead: () => ['/leads', '/candidates'],
  requisition: (id) => ['/requisitions', `/requisitions/${id}`],
  employer: (id) => ['/employers', `/employers/${id}`],
  immigration_case: (id) => ['/immigration', `/immigration/${id}`],
};

export async function assignEntityAction(input: {
  entity: AssignableEntity;
  id: string;
  userId: string | null;
}) {
  const r = await toActionResult(() => assignEntity(input));
  if (r.ok) {
    for (const p of REVALIDATE_PATHS[input.entity](input.id)) {
      revalidatePath(p);
    }
  }
  return r;
}
