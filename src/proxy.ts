import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Optimistic check only: bounce visitors without a session cookie. The real
// verification happens in the dashboard page when it decodes the cookie.
export function proxy(request: NextRequest) {
  const hasSession =
    request.cookies.has("authjs.session-token") ||
    request.cookies.has("__Secure-authjs.session-token");

  if (!hasSession) return NextResponse.redirect(new URL("/", request.url));
  return NextResponse.next();
}

export const config = { matcher: "/dashboard/:path*" };
