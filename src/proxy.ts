import { NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authEdgeConfig } from '@/lib/auth/edge-config';

const { auth } = NextAuth(authEdgeConfig);

const PUBLIC_PREFIXES = ['/login', '/api/auth', '/api/health', '/api/cron', '/portal/invite'];

/** Where each role's post-login landing page lives. */
function homeForRole(role: string): string {
  if (role === 'CANDIDATE') return '/portal/candidate';
  if (role === 'EMPLOYER') return '/portal/employer';
  return '/dashboard';
}

export default auth((req) => {
  const path = req.nextUrl.pathname;
  const isPublic = PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  const authObj = req.auth as {
    user?: { role?: string; personId?: string | null; employerId?: string | null };
  } | null;
  const role = authObj?.user?.role;
  const isAuthed = Boolean(role);

  // Unauthenticated: redirect anything private to /login.
  if (!isAuthed && !isPublic) {
    const url = new URL('/login', req.nextUrl);
    if (path !== '/') url.searchParams.set('callbackUrl', path);
    return NextResponse.redirect(url);
  }

  // Authenticated hitting /login: bounce to their home.
  if (isAuthed && path === '/login') {
    return NextResponse.redirect(new URL(homeForRole(role ?? 'STAFF'), req.nextUrl));
  }

  if (isAuthed) {
    const isPortalPath = path.startsWith('/portal');
    const isStaffPath = !isPortalPath && !isPublic;

    // Portal users cannot access internal CRM.
    if ((role === 'CANDIDATE' || role === 'EMPLOYER') && isStaffPath) {
      return NextResponse.redirect(new URL(homeForRole(role), req.nextUrl));
    }
    // Staff users hitting a portal route: bounce to internal dashboard (they'd see nothing there).
    if ((role === 'ADMIN' || role === 'STAFF') && isPortalPath) {
      return NextResponse.redirect(new URL('/dashboard', req.nextUrl));
    }
    // STAFF hitting an admin-only route: bounce to dashboard. Every /admin page
    // also enforces `requireRole(['ADMIN'])` server-side (which the error
    // boundary catches as a 403), but the middleware short-circuit fails-closed
    // earlier and avoids rendering an admin surface at all.
    // /account/security is user-scoped (any role can change their own password)
    // so it lives under the app group but is NOT gated here.
    if (role === 'STAFF' && (path === '/admin' || path.startsWith('/admin/'))) {
      return NextResponse.redirect(new URL('/dashboard', req.nextUrl));
    }
    // Same defence-in-depth for the HR admin surface — STAFF bounces
    // here; every page also enforces requireRole(['ADMIN']) server-side.
    if (role === 'STAFF' && path.startsWith('/hr/admin')) {
      return NextResponse.redirect(new URL('/hr', req.nextUrl));
    }
    // Candidate accessing employer portal or vice versa.
    if (role === 'CANDIDATE' && path.startsWith('/portal/employer')) {
      return NextResponse.redirect(new URL('/portal/candidate', req.nextUrl));
    }
    if (role === 'EMPLOYER' && path.startsWith('/portal/candidate')) {
      return NextResponse.redirect(new URL('/portal/employer', req.nextUrl));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)'],
};
