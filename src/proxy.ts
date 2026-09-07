import { NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authEdgeConfig } from '@/lib/auth/edge-config';

const { auth } = NextAuth(authEdgeConfig);

const PUBLIC_PREFIXES = ['/login', '/api/auth', '/api/health', '/api/cron', '/portal/invite'];

/**
 * All internal-user roles. Kept as a plain array (not imported from
 * session.ts) because middleware runs in the edge runtime and cannot
 * import Node-only server modules. Must be kept in sync with
 * `INTERNAL_STAFF_ROLES` in `src/lib/auth/session.ts`.
 *
 * Any not-admin-not-portal role is "generic staff" from the middleware's
 * point of view; per-mutation tightening (e.g. FINANCE-only payment
 * ops) happens at the service layer.
 */
const INTERNAL_ROLES = new Set([
  'ADMIN',
  'STAFF',
  'MANAGER',
  'RECRUITER',
  'DOCUMENT_SPECIALIST',
  'FINANCE',
]);

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
    if (role && INTERNAL_ROLES.has(role) && isPortalPath) {
      return NextResponse.redirect(new URL('/dashboard', req.nextUrl));
    }
    // Any non-ADMIN internal user hitting an admin-only route: bounce
    // to the internal dashboard. Every /admin page also enforces
    // `requireRole(['ADMIN'])` server-side (defence-in-depth).
    // /account/security is user-scoped so it's NOT gated here.
    if (
      role &&
      INTERNAL_ROLES.has(role) &&
      role !== 'ADMIN' &&
      (path === '/admin' || path.startsWith('/admin/'))
    ) {
      return NextResponse.redirect(new URL('/dashboard', req.nextUrl));
    }
    // Same defence-in-depth for /hr/admin.
    if (role && INTERNAL_ROLES.has(role) && role !== 'ADMIN' && path.startsWith('/hr/admin')) {
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
