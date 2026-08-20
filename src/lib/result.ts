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
      logger.error({ err: e }, 'Unhandled server action error');
      return fail('INTERNAL_ERROR', 'Something went wrong');
    });
}
