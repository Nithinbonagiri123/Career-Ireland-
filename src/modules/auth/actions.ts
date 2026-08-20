'use server';

import { AuthError } from 'next-auth';
import { signIn, signOut } from '@/lib/auth/config';
import { fail, ok } from '@/lib/result';
import { type LoginInput, LoginSchema } from './schemas';

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
