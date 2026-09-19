import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireInternalStaff } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import {
  documentUploadRequests,
  type DocumentUploadRequest,
} from '@/lib/db/schema/document_upload_requests';
import {
  candidateDocumentRequirements as personDocumentRequirements,
  documentInstances,
  documentRequirementFulfillments,
} from '@/lib/db/schema/documents';
import { documentTypes } from '@/lib/db/schema/reference';
import { persons } from '@/lib/db/schema/persons';
import { env } from '@/lib/env';
import { BusinessRuleError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getMailer } from '@/lib/mail';
import { DOCUMENTS_BUCKET } from '@/lib/s3/client';
import { ALLOWED_UPLOAD_MIME, buildObjectKey, MAX_UPLOAD_BYTES, presignUpload } from '@/lib/s3/presign';
import { fetchAppSettings } from '@/modules/settings/read';
import { renderDocumentRequestEmail } from './email';

/**
 * Magic-link document request pipeline. A single call from staff:
 *   1. snapshots the person's currently-MISSING requirement IDs
 *   2. mints an opaque 32-byte URL-safe token
 *   3. stores its SHA-256 hash in `document_upload_requests`
 *   4. sends the plaintext token to the candidate over email
 *
 * The candidate opens `/upload/<token>`, uploads files, and — when
 * every requirement in the snapshot has at least one document —
 * `markCompletedIfDone` seals the request.
 *
 * Never store the plaintext token. Timing-safe compare on validate.
 */

const TOKEN_BYTES = 32;
const TOKEN_TTL_DAYS = 7;
const TOKEN_TTL_MS = TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function safeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

export function buildUploadUrl(token: string): string {
  const base = env.AUTH_URL.replace(/\/+$/, '');
  return `${base}/upload/${encodeURIComponent(token)}`;
}

// ─── Staff-side: issue / revoke / list ─────────────────────────────

export type IssueUploadRequestResult = {
  /** Public URL to send to the candidate. */
  uploadUrl: string;
  /** The row we just inserted, without the plaintext token. */
  request: DocumentUploadRequest;
  /** How many requirements this link is asking for. */
  requestedCount: number;
  /** Whether the email was delivered successfully. */
  emailSent: boolean;
};

/**
 * Issue a new upload request against a person. Snapshots MISSING
 * requirements and mails the candidate. Refuses if there is already an
 * active (not-completed, not-revoked, not-expired) request for this
 * person — staff should revoke or wait for it to expire, so we don't
 * spam the candidate's inbox.
 */
export async function issueUploadRequest(input: { personId: string }): Promise<
  IssueUploadRequestResult
> {
  const session = await requireInternalStaff();
  const now = new Date();

  // 1) Load person + MISSING requirements in one round-trip.
  const [person] = await db
    .select({
      id: persons.id,
      firstName: persons.firstName,
      lastName: persons.lastName,
      email: persons.email,
    })
    .from(persons)
    .where(eq(persons.id, input.personId))
    .limit(1);
  if (!person) throw new BusinessRuleError('NOT_FOUND', 'Person not found');
  if (!person.email) {
    throw new BusinessRuleError(
      'MISSING_EMAIL',
      'This person has no email on file — add one before requesting documents.',
    );
  }

  const missingReqs = await db
    .select({
      id: personDocumentRequirements.id,
      documentTypeCode: documentTypes.code,
      documentTypeName: documentTypes.name,
    })
    .from(personDocumentRequirements)
    .innerJoin(
      documentTypes,
      eq(documentTypes.id, personDocumentRequirements.documentTypeId),
    )
    .where(
      and(
        eq(personDocumentRequirements.personId, input.personId),
        eq(personDocumentRequirements.status, 'MISSING'),
      ),
    );

  if (missingReqs.length === 0) {
    throw new BusinessRuleError(
      'NOTHING_MISSING',
      'Every required document is already provided — nothing to request.',
    );
  }

  // 2) Refuse if there's already an active request (not consumed, not
  // revoked, not expired). Staff must revoke the old one first — this
  // stops us re-mailing the same candidate every accidental click.
  const [existingActive] = await db
    .select({ id: documentUploadRequests.id, expiresAt: documentUploadRequests.expiresAt })
    .from(documentUploadRequests)
    .where(
      and(
        eq(documentUploadRequests.personId, input.personId),
        isNull(documentUploadRequests.completedAt),
        isNull(documentUploadRequests.revokedAt),
      ),
    )
    .orderBy(desc(documentUploadRequests.createdAt))
    .limit(1);

  if (existingActive && existingActive.expiresAt > now) {
    throw new BusinessRuleError(
      'ALREADY_ACTIVE',
      'An active upload link already exists for this candidate. Revoke it before issuing a new one.',
    );
  }

  // 3) Mint the token + insert the row.
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS);
  const requestedRequirementIds = missingReqs.map((r) => r.id);

  const inserted = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(documentUploadRequests)
      .values({
        tokenHash,
        personId: input.personId,
        requestedRequirementIds,
        createdByUserId: session.user.id,
        expiresAt,
      })
      .returning();
    if (!row) throw new Error('document_upload_requests insert returned no row');

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'document_upload_request',
      entityId: row.id,
      action: 'CREATED',
      after: {
        personId: input.personId,
        expiresAt: row.expiresAt.toISOString(),
        requestedCount: requestedRequirementIds.length,
      },
    });

    return row;
  });

  // 4) Send the email. On failure we still keep the row (the staff
  // member can copy the URL manually) — the delivery status is
  // returned so the UI can flag it.
  //
  // Brand name for the copy comes from app_settings.legalName — never
  // hardcoded so a customer can rebrand the whole platform from
  // /admin/settings without a redeploy.
  const uploadUrl = buildUploadUrl(token);
  const candidateName = `${person.firstName} ${person.lastName}`.trim();
  const brandSettings = await fetchAppSettings();
  const message = renderDocumentRequestEmail({
    brand: brandSettings.legalName,
    candidateName,
    uploadUrl,
    requestedItems: missingReqs.map((r) => r.documentTypeName),
    expiresAt,
  });

  let emailSent = false;
  try {
    await getMailer().send({
      to: person.email,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    emailSent = true;
  } catch (err) {
    logger.error({ err, personId: input.personId }, 'document upload request email failed');
  }

  return {
    uploadUrl,
    request: inserted,
    requestedCount: requestedRequirementIds.length,
    emailSent,
  };
}

export async function revokeUploadRequest(input: { requestId: string; reason?: string }) {
  const session = await requireInternalStaff();
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(documentUploadRequests)
      .where(eq(documentUploadRequests.id, input.requestId))
      .limit(1);
    if (!before) throw new BusinessRuleError('NOT_FOUND', 'Upload request not found');
    if (before.revokedAt) {
      throw new BusinessRuleError('ALREADY_REVOKED', 'Already revoked');
    }
    if (before.completedAt) {
      throw new BusinessRuleError(
        'ALREADY_COMPLETED',
        'Already used — nothing to revoke',
      );
    }
    const [after] = await tx
      .update(documentUploadRequests)
      .set({ revokedAt: new Date(), revokedByUserId: session.user.id, updatedAt: new Date() })
      .where(eq(documentUploadRequests.id, input.requestId))
      .returning();

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'document_upload_request',
      entityId: input.requestId,
      action: 'REVOKED',
      context: input.reason ? { reason: input.reason } : undefined,
    });
    return after;
  });
}

export type UploadRequestListRow = {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  completedAt: Date | null;
  revokedAt: Date | null;
  requestedCount: number;
};

export async function listUploadRequestsForPerson(
  personId: string,
): Promise<UploadRequestListRow[]> {
  await requireInternalStaff();
  const rows = await db
    .select({
      id: documentUploadRequests.id,
      createdAt: documentUploadRequests.createdAt,
      expiresAt: documentUploadRequests.expiresAt,
      completedAt: documentUploadRequests.completedAt,
      revokedAt: documentUploadRequests.revokedAt,
      requestedRequirementIds: documentUploadRequests.requestedRequirementIds,
    })
    .from(documentUploadRequests)
    .where(eq(documentUploadRequests.personId, personId))
    .orderBy(desc(documentUploadRequests.createdAt));

  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    completedAt: r.completedAt,
    revokedAt: r.revokedAt,
    requestedCount: Array.isArray(r.requestedRequirementIds)
      ? (r.requestedRequirementIds as unknown[]).length
      : 0,
  }));
}

// ─── Candidate-side: validate + complete ───────────────────────────

export type ValidatedUploadRequest = {
  request: DocumentUploadRequest;
  personId: string;
  candidateName: string;
  requirements: Array<{
    id: string;
    documentTypeId: string;
    documentTypeCode: string;
    documentTypeName: string;
    fulfilled: boolean;
  }>;
};

/**
 * Validate a plaintext token from the URL and return everything the
 * public upload page needs to render — the person, the requested
 * requirements, and whether each one is already fulfilled in this
 * session (so we can show progress). Returns null for any bad state
 * (unknown, expired, revoked, already completed) so the page can
 * render one generic "link is no longer valid" screen and avoid
 * leaking which failure mode it was (defence against enumeration).
 */
export async function validateUploadRequest(
  token: string,
): Promise<ValidatedUploadRequest | null> {
  if (!token || typeof token !== 'string' || token.length < 20) return null;
  const inputHash = hashToken(token);

  const [row] = await db
    .select()
    .from(documentUploadRequests)
    .where(eq(documentUploadRequests.tokenHash, inputHash))
    .limit(1);
  if (!row) return null;

  // Timing-safe re-check even though the eq() already matched — cheap
  // insurance so future refactors don't accidentally leak.
  if (!safeHexEqual(row.tokenHash, inputHash)) return null;

  if (row.revokedAt) return null;
  if (row.completedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;

  const [person] = await db
    .select({
      id: persons.id,
      firstName: persons.firstName,
      lastName: persons.lastName,
    })
    .from(persons)
    .where(eq(persons.id, row.personId))
    .limit(1);
  if (!person) return null;

  const requirementIds = Array.isArray(row.requestedRequirementIds)
    ? (row.requestedRequirementIds as string[])
    : [];
  if (requirementIds.length === 0) return null;

  // Pull each requirement + a boolean for "has any doc fulfilled it".
  const reqRows = await db
    .select({
      id: personDocumentRequirements.id,
      documentTypeId: personDocumentRequirements.documentTypeId,
      documentTypeCode: documentTypes.code,
      documentTypeName: documentTypes.name,
      fulfilmentCount: sql<number>`COUNT(${documentRequirementFulfillments.documentInstanceId})::int`,
    })
    .from(personDocumentRequirements)
    .innerJoin(documentTypes, eq(documentTypes.id, personDocumentRequirements.documentTypeId))
    .leftJoin(
      documentRequirementFulfillments,
      eq(documentRequirementFulfillments.requirementId, personDocumentRequirements.id),
    )
    .where(inArray(personDocumentRequirements.id, requirementIds))
    .groupBy(
      personDocumentRequirements.id,
      personDocumentRequirements.documentTypeId,
      documentTypes.code,
      documentTypes.name,
    );

  return {
    request: row,
    personId: row.personId,
    candidateName: `${person.firstName} ${person.lastName}`.trim(),
    requirements: reqRows.map((r) => ({
      id: r.id,
      documentTypeId: r.documentTypeId,
      documentTypeCode: r.documentTypeCode,
      documentTypeName: r.documentTypeName,
      fulfilled: r.fulfilmentCount > 0,
    })),
  };
}

// ─── Candidate-side: token-authed upload path ──────────────────────

/**
 * Presign an S3 upload for a specific token + requirement. Runs
 * WITHOUT a session — the token is the credential. Returns the same
 * `{uploadUrl, key}` shape as the internal presign endpoint so the
 * public client can PUT to S3 unchanged.
 */
export async function presignUploadForToken(input: {
  token: string;
  requirementId: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
}) {
  const validated = await validateUploadRequest(input.token);
  if (!validated) {
    throw new BusinessRuleError('LINK_INVALID', 'This upload link is no longer valid.');
  }
  const req = validated.requirements.find((r) => r.id === input.requirementId);
  if (!req) {
    throw new BusinessRuleError(
      'REQUIREMENT_NOT_IN_SCOPE',
      'That document is not part of this upload request.',
    );
  }
  if (!ALLOWED_UPLOAD_MIME.has(input.mimeType)) {
    throw new BusinessRuleError(
      'MIME_NOT_ALLOWED',
      `File type ${input.mimeType} is not allowed. PDF, images, or Word documents only.`,
    );
  }
  if (input.fileSizeBytes > MAX_UPLOAD_BYTES) {
    throw new BusinessRuleError(
      'FILE_TOO_LARGE',
      `File exceeds ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit`,
    );
  }

  const key = buildObjectKey({
    ownerType: 'person',
    ownerId: validated.personId,
    documentTypeId: req.documentTypeId,
    originalFilename: input.originalFilename,
  });
  const { url, expiresInSeconds } = await presignUpload({
    key,
    mimeType: input.mimeType,
    fileSizeBytes: input.fileSizeBytes,
  });
  return { uploadUrl: url, bucket: DOCUMENTS_BUCKET, key, expiresInSeconds };
}

/**
 * After the candidate PUTs the file to S3, they call this to register
 * the row + fulfil the requirement. Attributes the upload to the
 * staff member who issued the link (candidates have no user account
 * in the removed-portal world). Marks the request completed if this
 * was the last outstanding requirement.
 */
export async function registerUploadForToken(input: {
  token: string;
  requirementId: string;
  s3ObjectKey: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
}) {
  const validated = await validateUploadRequest(input.token);
  if (!validated) {
    throw new BusinessRuleError('LINK_INVALID', 'This upload link is no longer valid.');
  }
  const req = validated.requirements.find((r) => r.id === input.requirementId);
  if (!req) {
    throw new BusinessRuleError(
      'REQUIREMENT_NOT_IN_SCOPE',
      'That document is not part of this upload request.',
    );
  }
  if (!ALLOWED_UPLOAD_MIME.has(input.mimeType)) {
    throw new BusinessRuleError('MIME_NOT_ALLOWED', 'File type not allowed');
  }
  if (input.fileSizeBytes > MAX_UPLOAD_BYTES) {
    throw new BusinessRuleError('FILE_TOO_LARGE', 'File too large');
  }

  const uploaderUserId = validated.request.createdByUserId;

  const instance = await db.transaction(async (tx) => {
    const [latest] = await tx
      .select({ version: documentInstances.version })
      .from(documentInstances)
      .where(
        and(
          eq(documentInstances.ownerPersonId, validated.personId),
          eq(documentInstances.documentTypeId, req.documentTypeId),
        ),
      )
      .orderBy(desc(documentInstances.version))
      .limit(1);
    const nextVersion = (latest?.version ?? 0) + 1;

    const [inserted] = await tx
      .insert(documentInstances)
      .values({
        ownerPersonId: validated.personId,
        ownerEmployerId: null,
        documentTypeId: req.documentTypeId,
        version: nextVersion,
        status: 'UPLOADED',
        originalFilename: input.originalFilename,
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSizeBytes,
        s3Bucket: DOCUMENTS_BUCKET,
        s3ObjectKey: input.s3ObjectKey,
        uploadedByUserId: uploaderUserId,
      })
      .returning();
    if (!inserted) throw new Error('document_instances insert returned no row');

    await recordAudit(tx, {
      actorUserId: uploaderUserId,
      entityType: 'document_instance',
      entityId: inserted.id,
      action: 'UPLOADED',
      after: {
        documentTypeId: inserted.documentTypeId,
        version: inserted.version,
        originalFilename: inserted.originalFilename,
        fileSizeBytes: inserted.fileSizeBytes,
      },
      context: {
        ownerType: 'PERSON',
        ownerId: validated.personId,
        via: 'candidate_upload_link',
        uploadRequestId: validated.request.id,
      },
    });

    await tx
      .insert(documentRequirementFulfillments)
      .values({
        requirementId: req.id,
        documentInstanceId: inserted.id,
        fulfilledByUserId: uploaderUserId,
      })
      .onConflictDoNothing();

    await tx
      .update(personDocumentRequirements)
      .set({ status: 'PROVIDED', updatedAt: new Date() })
      .where(eq(personDocumentRequirements.id, req.id));

    return inserted;
  });

  const completion = await markCompletedIfDone(validated.request.id);

  return {
    documentInstanceId: instance.id,
    justCompleted: completion.justCompleted,
  };
}

/**
 * After each successful upload against a token, call this to see
 * whether every requested requirement is now fulfilled. If so, seal
 * the request (completed_at set) and drop an activity so the assigned
 * staff sees a fresh entry on the Activity tab.
 *
 * Idempotent: safe to call every upload; only the transition to
 * completed writes the audit row.
 */
export async function markCompletedIfDone(
  requestId: string,
): Promise<{ justCompleted: boolean }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(documentUploadRequests)
      .where(eq(documentUploadRequests.id, requestId))
      .limit(1);
    if (!row || row.completedAt || row.revokedAt) return { justCompleted: false };

    const requirementIds = Array.isArray(row.requestedRequirementIds)
      ? (row.requestedRequirementIds as string[])
      : [];
    if (requirementIds.length === 0) return { justCompleted: false };

    // Which of the requested requirements have at least one non-voided
    // document uploaded against them?
    const fulfilled = await tx
      .select({
        requirementId: documentRequirementFulfillments.requirementId,
      })
      .from(documentRequirementFulfillments)
      .innerJoin(
        documentInstances,
        eq(documentInstances.id, documentRequirementFulfillments.documentInstanceId),
      )
      .where(
        and(
          inArray(documentRequirementFulfillments.requirementId, requirementIds),
          isNull(documentInstances.voidedAt),
        ),
      );

    const fulfilledSet = new Set(fulfilled.map((r) => r.requirementId));
    const allFulfilled = requirementIds.every((id) => fulfilledSet.has(id));
    if (!allFulfilled) return { justCompleted: false };

    await tx
      .update(documentUploadRequests)
      .set({ completedAt: new Date(), updatedAt: new Date() })
      .where(eq(documentUploadRequests.id, requestId));

    await recordAudit(tx, {
      actorUserId: row.createdByUserId,
      entityType: 'document_upload_request',
      entityId: requestId,
      action: 'COMPLETED',
      after: { personId: row.personId, requirementCount: requirementIds.length },
      context: { via: 'candidate_upload' },
    });

    return { justCompleted: true };
  });
}
