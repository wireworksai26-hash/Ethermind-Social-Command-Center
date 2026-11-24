import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

const PUBLIC_PATHS = ['/login', '/accept-invite'];

/** Optimistic redirect only; every page and API route re-validates the session server-side. */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasCookie = Boolean(getSessionCookie(req));
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!hasCookie && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  if (hasCookie && isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|webp)$).*)'],
};
