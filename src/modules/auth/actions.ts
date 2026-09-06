'use server';

import { headers } from 'next/headers';
import { AuthError } from 'next-auth';
import { signIn, signOut } from '@/lib/auth/config';
import { requireSession } from '@/lib/auth/session';
import { fail, ok, toActionResult } from '@/lib/result';
import { isLoginBlocked } from './login-throttle';
import {
  type ChangePasswordInput,
  ChangePasswordSchema,
  type LoginInput,
  LoginSchema,
} from './schemas';
import { changeOwnPassword } from './service';

/**
 * The rate-limit check in `authorize` (src/lib/auth/config.ts) is our last-
 * resort defence that fires regardless of who calls signIn. This action-level
 * pre-check exists purely for UX: when the caller is over the budget we want
 * to say so plainly instead of surfacing the same "Invalid email or password"
 * that a genuine typo produces. Internal CRM, bounded user set — the
 * enumeration signal is negligible.
 */
async function readClientIpFromHeaders(): Promise<string | null> {
  try {
    const h = await headers();
    const xff = h.get('x-forwarded-for');
    if (xff) return xff.split(',')[0]?.trim() ?? null;
    return h.get('x-real-ip');
  } catch {
    return null;
  }
}

export async function loginAction(input: LoginInput) {
  const parsed = LoginSchema.safeParse(input);
  if (!parsed.success) {
    return fail('VALIDATION_ERROR', 'Please check your input', {
      email: parsed.error.flatten().fieldErrors.email?.[0] ?? '',
      password: parsed.error.flatten().fieldErrors.password?.[0] ?? '',
    });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const ip = await readClientIpFromHeaders();
  if (await isLoginBlocked(email, ip)) {
    return fail(
      'RATE_LIMITED',
      'Too many failed attempts. Wait ~15 minutes and try again, or reset your password.',
    );
  }

  try {
    await signIn('credentials', {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });
    return ok(null);
  } catch (error) {
    if (error instanceof AuthError) {
      return fail('INVALID_CREDENTIALS', 'Invalid email or password');
    }
    throw error;
  }
}

export async function signOutAction() {
  await signOut({ redirectTo: '/login' });
}

export async function changePasswordAction(input: ChangePasswordInput) {
  const parsed = ChangePasswordSchema.safeParse(input);
  if (!parsed.success) {
    const f = parsed.error.flatten().fieldErrors;
    return fail('VALIDATION_ERROR', 'Please check your input', {
      currentPassword: f.currentPassword?.[0] ?? '',
      newPassword: f.newPassword?.[0] ?? '',
      confirmPassword: f.confirmPassword?.[0] ?? '',
    });
  }

  const session = await requireSession();
  return toActionResult(async () => {
    await changeOwnPassword(session.user.id, parsed.data.currentPassword, parsed.data.newPassword);
    return null;
  });
}
