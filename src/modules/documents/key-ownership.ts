import { BusinessRuleError } from '@/lib/errors';

/**
 * Stage B Wave 1 (client remediation #7) — a registered storage key must
 * live under the owner's own prefix ({yyyy}/{mm}/{person|employer}/{ownerId}/…,
 * see buildObjectKey). Without this, any logged-in user could attach
 * someone else's stored object to a document they own and then download
 * it through the ownership check.
 *
 * Pure module (no session import) so the vitest suite can load it.
 */
export function assertKeyBelongsToOwner(
  ownerType: 'PERSON' | 'EMPLOYER',
  ownerId: string,
  s3ObjectKey: string,
): void {
  const prefix = ownerType === 'PERSON' ? 'person' : 'employer';
  const pattern = new RegExp(`^\\d{4}/\\d{2}/${prefix}/${ownerId}/`);
  if (!pattern.test(s3ObjectKey)) {
    throw new BusinessRuleError(
      'KEY_OWNER_MISMATCH',
      'The uploaded file does not belong to this record. Re-upload the file and try again.',
    );
  }
}
