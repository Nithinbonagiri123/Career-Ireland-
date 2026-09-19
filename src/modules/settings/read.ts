import { eq } from 'drizzle-orm';
import { cache } from 'react';
import { db } from '@/lib/db/client';
import { APP_SETTINGS_ID, type AppSettings, appSettings } from '@/lib/db/schema/app_settings';
import { BusinessRuleError } from '@/lib/errors';

/**
 * Auth-free read helper for the `app_settings` singleton.
 *
 * Split from `./service` so pre-login callers (password-reset email,
 * document-upload-request email, root layout metadata) can pull the
 * brand name without dragging the NextAuth import chain into their
 * module — otherwise vitest can't resolve `next/server` transitively.
 *
 * Everything under `./service` (the admin write path, requireAppSettingsReader,
 * etc.) still lives there with proper auth gates. This file must NEVER
 * import from `@/lib/auth/session` or anything that transitively pulls
 * next-auth in.
 */
export const fetchAppSettings = cache(async (): Promise<AppSettings> => {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.id, APP_SETTINGS_ID))
    .limit(1);
  if (!row) {
    throw new BusinessRuleError(
      'APP_SETTINGS_MISSING',
      'app_settings singleton row is missing — re-run pnpm db:migrate',
    );
  }
  return row;
});
