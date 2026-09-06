import * as Sentry from '@sentry/nextjs';
import { AppError, ValidationError } from './errors';
import { logger } from './logger';

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; fields?: Record<string, string> } };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(
  code: string,
  message: string,
  fields?: Record<string, string>,
): ActionResult<never> {
  return { ok: false, error: { code, message, fields } };
}

export function toActionResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  return fn()
    .then(ok)
    .catch((e: unknown) => {
      if (e instanceof ValidationError) return fail(e.code, e.message, e.fields);
      if (e instanceof AppError) return fail(e.code, e.message);
      // Unhandled error path: pino for local + prod logs, Sentry.captureException
      // for the exception tracker. Both are no-ops when their config is absent
      // (Sentry init only runs when SENTRY_DSN is set), so this stays safe in
      // dev and CI without any env setup.
      logger.error({ err: e }, 'Unhandled server action error');
      Sentry.captureException(e);
      return fail('INTERNAL_ERROR', 'Something went wrong');
    });
}
