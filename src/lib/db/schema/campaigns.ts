import {
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './_shared';
import { persons } from './persons';
import { jobRequisitions } from './recruitment';
import { users } from './users';

export const recruitmentCampaigns = pgTable(
  'recruitment_campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobRequisitionId: uuid('job_requisition_id').references(() => jobRequisitions.id),
    name: varchar('name', { length: 200 }).notNull(),
    status: text('status', { enum: ['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED'] })
      .notNull()
      .default('DRAFT'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    notes: text('notes'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archivedByUserId: uuid('archived_by_user_id').references(() => users.id),
    createdAt,
    updatedAt,
  },
  (t) => [index('recruitment_campaigns_requisition_idx').on(t.jobRequisitionId)],
);

export const advertisements = pgTable(
  'advertisements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => recruitmentCampaigns.id),
    country: varchar('country', { length: 80 }).notNull(),
    platform: varchar('platform', { length: 120 }),
    targetApplicants: integer('target_applicants').notNull().default(0),
    startDate: date('start_date').notNull(),
    expiryDate: date('expiry_date').notNull(),
    status: text('status', {
      enum: ['DRAFT', 'ACTIVE', 'EXPIRED', 'CLOSED'],
    })
      .notNull()
      .default('DRAFT'),
    notes: text('notes'),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('advertisements_campaign_idx').on(t.campaignId),
    index('advertisements_expiry_idx').on(t.expiryDate),
  ],
);

export const recruitmentProspects = pgTable(
  'recruitment_prospects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    personId: uuid('person_id')
      .notNull()
      .references(() => persons.id),
    advertisementId: uuid('advertisement_id')
      .notNull()
      .references(() => advertisements.id),
    status: text('status', {
      enum: ['NEW', 'SCREENED', 'CONVERTED_TO_CANDIDATE', 'RETAINED_IN_POOL', 'NOT_SUITABLE'],
    })
      .notNull()
      .default('NEW'),
    screenedByUserId: uuid('screened_by_user_id').references(() => users.id),
    notes: text('notes'),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique('recruitment_prospects_person_ad_unique').on(t.personId, t.advertisementId),
    index('recruitment_prospects_ad_idx').on(t.advertisementId),
  ],
);

export type RecruitmentCampaign = typeof recruitmentCampaigns.$inferSelect;
export type NewRecruitmentCampaign = typeof recruitmentCampaigns.$inferInsert;
export type Advertisement = typeof advertisements.$inferSelect;
export type NewAdvertisement = typeof advertisements.$inferInsert;
export type RecruitmentProspect = typeof recruitmentProspects.$inferSelect;
export type NewRecruitmentProspect = typeof recruitmentProspects.$inferInsert;
