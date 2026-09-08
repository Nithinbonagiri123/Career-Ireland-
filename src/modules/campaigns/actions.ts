'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type {
  ArchiveCampaignInput,
  ConvertProspectInput,
  CreateProspectInput,
  UnarchiveCampaignInput,
  UpdateProspectStatusInput,
  UpsertAdInput,
  UpsertCampaignInput,
} from './schemas';
import {
  archiveCampaign,
  convertProspectToCandidate,
  createProspect,
  unarchiveCampaign,
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
  if (r.ok) {
    rev();
    revalidatePath('/prospects');
  }
  return r;
}
export async function convertProspectToCandidateAction(input: ConvertProspectInput) {
  const r = await toActionResult(() => convertProspectToCandidate(input));
  if (r.ok) {
    rev();
    revalidatePath('/prospects');
    revalidatePath('/candidates');
  }
  return r;
}
export async function archiveCampaignAction(input: ArchiveCampaignInput) {
  const r = await toActionResult(() => archiveCampaign(input));
  if (r.ok) {
    rev();
    revalidatePath(`/campaigns/${input.campaignId}`);
  }
  return r;
}
export async function unarchiveCampaignAction(input: UnarchiveCampaignInput) {
  const r = await toActionResult(() => unarchiveCampaign(input));
  if (r.ok) {
    rev();
    revalidatePath(`/campaigns/${input.campaignId}`);
  }
  return r;
}
