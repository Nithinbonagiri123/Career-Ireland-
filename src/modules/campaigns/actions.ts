'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type {
  CreateProspectInput,
  UpdateProspectStatusInput,
  UpsertAdInput,
  UpsertCampaignInput,
} from './schemas';
import {
  createProspect,
  updateProspectStatus,
  upsertAdvertisement,
  upsertCampaign,
} from './service';

const rev = () => revalidatePath('/campaigns');

export async function upsertCampaignAction(input: UpsertCampaignInput) {
  const r = await toActionResult(() => upsertCampaign(input));
  if (r.ok) rev();
  return r;
}
export async function upsertAdvertisementAction(input: UpsertAdInput) {
  const r = await toActionResult(() => upsertAdvertisement(input));
  if (r.ok) {
    rev();
    revalidatePath(`/campaigns/${input.campaignId}`);
  }
  return r;
}
export async function createProspectAction(input: CreateProspectInput) {
  const r = await toActionResult(() => createProspect(input));
  if (r.ok) rev();
  return r;
}
export async function updateProspectStatusAction(input: UpdateProspectStatusInput) {
  const r = await toActionResult(() => updateProspectStatus(input));
  if (r.ok) rev();
  return r;
}
