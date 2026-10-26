import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Optimistic check only: redirects when there's no session cookie.
// The real session check still has to happen server-side, per request,
// wherever the data is actually read.
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has("session");

  // if (!hasSession) {
  //   return NextResponse.redirect(new URL("/login", request.url));
  // }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico).*)"],
};
