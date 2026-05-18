import { clerkMiddleware, createRouteMatcher, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isPublicRoute = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)', '/api/stats/public']);
const isNotesRoute = createRouteMatcher(['/notes(.*)', '/api/notes(.*)']);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }

  if (isNotesRoute(request)) {
    const { sessionClaims } = await auth();
    let hasAccess;

    if (sessionClaims?.publicMetadata !== undefined) {
      hasAccess = sessionClaims.publicMetadata?.hasNotesAccess === true;
    } else {
      const user = await currentUser();
      hasAccess = user?.publicMetadata?.hasNotesAccess === true;
    }

    if (!hasAccess) {
      if (request.nextUrl.pathname.startsWith('/api/notes')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.redirect(new URL('/', request.url));
    }
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
