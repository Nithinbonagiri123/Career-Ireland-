'use server';

import { AuthError } from 'next-auth';
import { signIn, signOut } from '@/lib/auth/config';
import { requireSession } from '@/lib/auth/session';
import { fail, ok, toActionResult } from '@/lib/result';
import {
  type ChangePasswordInput,
  ChangePasswordSchema,
  type LoginInput,
  LoginSchema,
} from './schemas';
import { changeOwnPassword } from './service';

export async function loginAction(input: LoginInput) {
  const parsed = LoginSchema.safeParse(input);
  if (!parsed.success) {
    return fail('VALIDATION_ERROR', 'Please check your input', {
      email: parsed.error.flatten().fieldErrors.email?.[0] ?? '',
      password: parsed.error.flatten().fieldErrors.password?.[0] ?? '',
    });
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
