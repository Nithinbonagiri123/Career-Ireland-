import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authEdgeConfig } from '@/lib/auth/edge-config';

const { auth } = NextAuth(authEdgeConfig);

const PUBLIC_PREFIXES = ['/login', '/api/auth'];

export default auth((req) => {
  const path = req.nextUrl.pathname;
  const isPublic = PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  const isAuthed = Boolean(req.auth);

  if (!isAuthed && !isPublic) {
    const url = new URL('/login', req.nextUrl);
    if (path !== '/') url.searchParams.set('callbackUrl', path);
    return NextResponse.redirect(url);
  }

  if (isAuthed && path === '/login') {
    return NextResponse.redirect(new URL('/dashboard', req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)'],
};
