'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import {
  addProspectNote,
  convertProspectToCandidate,
  createProspect,
  setProspectFollowUp,
  updateProspectStatus,
} from './prospects';
import type {
  AddProspectNoteInput,
  ArchiveCampaignInput,
  ConvertProspectInput,
  CreateProspectInput,
  SaveCampaignInput,
  SetProspectFollowUpInput,
  TransitionCampaignInput,
  UnarchiveCampaignInput,
  UpdateProspectStatusInput,
  UpsertAdInput,
} from './schemas';
import {
  archiveCampaign,
  fetchJobsForCampaignPicker,
  saveCampaign,
  transitionCampaign,
  unarchiveCampaign,
  upsertAdvertisement,
} from './service';

// Layout-level revalidation keeps the campaign workspace, the prospect
// pages and the employer / job "Advertising" panels in step.
const rev = () => {
  revalidatePath('/campaigns', 'layout');
  revalidatePath('/prospects', 'layout');
  revalidatePath('/requisitions', 'layout');
  revalidatePath('/employers', 'layout');
};

export async function saveCampaignAction(input: SaveCampaignInput) {
  const r = await toActionResult(() => saveCampaign(input));
  if (r.ok) rev();
  return r;
}

export async function transitionCampaignAction(input: TransitionCampaignInput) {
  const r = await toActionResult(() => transitionCampaign(input));
  if (r.ok) rev();
  return r;
}

export async function archiveCampaignAction(input: ArchiveCampaignInput) {
  const r = await toActionResult(() => archiveCampaign(input));
  if (r.ok) rev();
  return r;
}

export async function unarchiveCampaignAction(input: UnarchiveCampaignInput) {
  const r = await toActionResult(() => unarchiveCampaign(input));
  if (r.ok) rev();
  return r;
}

export async function upsertAdvertisementAction(input: UpsertAdInput) {
  const r = await toActionResult(() => upsertAdvertisement(input));
  if (r.ok) rev();
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

export async function addProspectNoteAction(input: AddProspectNoteInput) {
  const r = await toActionResult(() => addProspectNote(input));
  if (r.ok) rev();
  return r;
}

export async function setProspectFollowUpAction(input: SetProspectFollowUpInput) {
  const r = await toActionResult(() => setProspectFollowUp(input));
  if (r.ok) rev();
  return r;
}

export async function convertProspectToCandidateAction(input: ConvertProspectInput) {
  const r = await toActionResult(() => convertProspectToCandidate(input));
  if (r.ok) {
    rev();
    revalidatePath('/candidates', 'layout');
  }
  return r;
}

/** Open jobs for the campaign dialog's job picker (optionally one employer's). */
export async function fetchJobsForCampaignPickerAction(employerId?: string) {
  return toActionResult(() => fetchJobsForCampaignPicker(employerId));
}
