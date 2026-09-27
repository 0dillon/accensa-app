import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { parseRole, type Role } from '@/lib/rbac';

/**
 * No fallback secret, deliberately.
 *
 * This previously read `process.env.JWT_SECRET_KEY || 'default_secret_key_for_development'`.
 * That string is published in this repository, so any deployment missing the variable
 * would have verified session cookies against a value the whole world can read — anyone
 * could mint a valid `accensa_session` and the dashboard would look authenticated while
 * being open. A missing secret must deny, never fall back.
 */
const secretKey = process.env.JWT_SECRET_KEY;
const key = secretKey ? new TextEncoder().encode(secretKey) : null;

export default async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  const requestHeaders = new Headers(request.headers);

  const next = () => NextResponse.next({ request: { headers: requestHeaders } });
  /**
   * The lockdown headers that used to live in `middleware.ts`.
   *
   * Next.js 16 deprecated `middleware` in favour of `proxy` and refuses to build when
   * both files exist, so the two were folded into this one file. The strict *nonce* CSP
   * that was part of that middleware was deliberately not carried over: a nonce only
   * exists on dynamically rendered pages, and this app prerenders its public routes, so
   * stamping `strict-dynamic` onto a static response would block every script on
   * `/login`, `/dashboard` and friends. Reintroducing it means opting those routes into
   * dynamic rendering first.
   */
  const secure = (response: NextResponse) => {
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    return response;
  };

  // Define public and private paths.
  //
  // `/api/hook/settle` is deliberately NOT session-authenticated. It is called by a
  // seller's server through `@accensa/sdk`, which cannot hold a browser cookie, and it
  // carries its own stronger auth: an Ed25519 signature verified over the raw request
  // bytes plus a five-minute timestamp bound. Gating it here would 401 every legitimate
  // settlement report before its own verification ever ran.
  const isPublicApi =
    path.startsWith('/api/verify') ||
    path.startsWith('/api/auth') ||
    path.startsWith('/api/hook/') ||
    path.startsWith('/api/receipts/');
  const isCronSync =
    (path === '/api/sync' || path === '/api/webhooks/deliver') && request.method === 'GET';
  const isPrivateApi = path.startsWith('/api/') && !isPublicApi && !isCronSync;
  const isDashboard = path.startsWith('/dashboard');

  if (isPrivateApi || isDashboard) {
    if (!key) {
      // Fail closed. A deployment without JWT_SECRET_KEY serves nothing private.
      return secure(
        NextResponse.json(
          { error: 'Server misconfigured: JWT_SECRET_KEY is not set' },
          { status: 500 },
        ),
      );
    }

    const sessionCookie = request.cookies.get('accensa_session')?.value;
    if (!sessionCookie) {
      if (isPrivateApi)
        return secure(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
      return secure(NextResponse.redirect(new URL('/login', request.url)));
    }

    try {
      const { payload } = await jwtVerify(sessionCookie, key, { algorithms: ['HS256'] });
      const merchantAddress = typeof payload.publicKey === 'string' ? payload.publicKey : null;
      if (isPrivateApi && !merchantAddress) {
        // A session with no identifiable merchant cannot be scoped to any
        // tenant's data — treat it the same as no session at all.
        return secure(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
      }

      // RBAC (#156): the role rides in the signed session. Legacy sessions
      // without a role claim default to admin, so an existing cookie is never
      // locked out of the dashboard mid-deployment.
      const role: Role = parseRole(payload.role) ?? 'admin';

      // Route handlers trust this header for merchant scoping instead of each
      // re-verifying and re-decoding the session cookie themselves. It is only
      // ever set here, after jwtVerify has succeeded, so a request cannot
      // forge it — the proxy runs before the request reaches a route
      // handler and this header is set on the *outgoing* request, overwriting
      // any value a caller tried to smuggle in.
      requestHeaders.set('x-accensa-merchant', merchantAddress ?? '');
      requestHeaders.set('x-accensa-role', role);
      return secure(next());
    } catch {
      if (isPrivateApi)
        return secure(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
      return secure(NextResponse.redirect(new URL('/login', request.url)));
    }
  }

  // Enforce CRON_SECRET for GET /api/sync and GET /api/webhooks/deliver
  if (isCronSync) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return secure(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    }
  }

  return secure(next());
}

export const config = {
  // Everything except Next's own build artefacts, so the session gate covers
  // `/dashboard` and `/api` and the security headers cover every document.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
