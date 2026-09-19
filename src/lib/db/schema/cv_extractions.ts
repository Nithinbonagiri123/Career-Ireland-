import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { documentInstances } from './documents';

/**
 * Extracted text from a candidate's uploaded CV (PDF / DOCX). Populated on
 * demand — on the first "Scan CV" click or "Add skill" dropdown open — and
 * cached so subsequent lookups don't re-parse the file.
 *
 * One row per `document_instance_id` (UNIQUE), keyed on the specific version
 * of the CV so staff can re-scan after a new upload without stale text.
 *
 * We deliberately keep this in a side table (not a column on
 * `document_instances`) because:
 *   - CV texts run 3-8KB; adding to a hot row multiplies its size on
 *     every fetch even when text isn't needed.
 *   - Cascade delete matches the S3 object's lifetime — if the CV row
 *     gets soft-voided/deleted, the extracted text disappears with it.
 */
export const cvExtractions = pgTable(
  'cv_extractions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentInstanceId: uuid('document_instance_id')
      .notNull()
      .unique()
      .references(() => documentInstances.id, { onDelete: 'cascade' }),
    /** Raw text after PDF / DOCX extraction, trimmed. */
    textContent: text('text_content').notNull(),
    parsedAt: timestamp('parsed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('cv_extractions_document_idx').on(t.documentInstanceId)],
);

export type CvExtraction = typeof cvExtractions.$inferSelect;
export type NewCvExtraction = typeof cvExtractions.$inferInsert;
