import { NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authEdgeConfig } from '@/lib/auth/edge-config';

const { auth } = NextAuth(authEdgeConfig);

const PUBLIC_PREFIXES = [
  '/login',
  '/api/auth',
  '/api/health',
  '/api/cron',
  // Candidate document-upload magic link (no account, token in path).
  '/upload',
  '/api/upload',
];

/**
 * All internal-user roles. Kept as a plain array (not imported from
 * session.ts) because middleware runs in the edge runtime and cannot
 * import Node-only server modules. Must be kept in sync with
 * `INTERNAL_STAFF_ROLES` in `src/lib/auth/session.ts`.
 */
const INTERNAL_ROLES = new Set([
  'ADMIN',
  'STAFF',
  'MANAGER',
  'RECRUITER',
  'DOCUMENT_SPECIALIST',
  'FINANCE',
]);

export default auth((req) => {
  const path = req.nextUrl.pathname;
  const isPublic = PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  const authObj = req.auth as {
    user?: { role?: string };
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
    return NextResponse.redirect(new URL('/dashboard', req.nextUrl));
  }

  if (isAuthed) {
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
  }

  // Pass the pathname through as a request header so server components
  // (the app layout in particular) can derive the current workspace
  // from the URL. Next.js doesn't expose `URL.pathname` to RSCs without
  // this hop — we keep the header name namespaced to avoid clashing
  // with framework internals.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-icg-pathname', path);
  return NextResponse.next({ request: { headers: requestHeaders } });
});

export const config = {
  // Skip auth on Next.js internals and every static file extension we
  // may serve from /public. If we don't exclude them, the image
  // optimizer's server-to-server refetch of /logo.png etc. gets
  // 307'd to /login (no cookies on the internal fetch) and the
  // optimizer then rejects the HTML response as "not a valid image".
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|gif|ico|avif|txt|xml|json|woff2?|ttf|eot)$).*)',
  ],
};
