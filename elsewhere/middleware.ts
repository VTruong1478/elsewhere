import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = [
  '/auth',
  '/login',
  '/signup',
  '/auth/callback',
  '/',
  '/feed',
  '/api',
  '/terms',
  '/privacy',
];

function isPublicPath(pathname: string): boolean {
  // Place detail is public so logged-out users can open a spot from the feed.
  // Submitting a new place or rating stays protected.
  if (
    pathname.startsWith("/places/") &&
    !pathname.startsWith("/places/new") &&
    !pathname.includes("/rate")
  ) {
    return true;
  }

  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export async function middleware(request: NextRequest) {
  if (isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next({
      request: { headers: request.headers },
    });
  }

  // Local/dev-only credential bypass.
  if (
    process.env.NODE_ENV === "development" &&
    request.cookies.get("dev_auth")?.value === "1"
  ) {
    return NextResponse.next({
      request: { headers: request.headers },
    });
  }

  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options as Parameters<NextResponse['cookies']['set']>[2]);
          });
        },
      },
    }
  );

  // Refresh session (getUser validates the token with the auth server)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL('/login', request.url);
    const returnTo =
      request.nextUrl.pathname +
      (request.nextUrl.search ?? '');
    loginUrl.searchParams.set('next', returnTo);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, other static assets
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
