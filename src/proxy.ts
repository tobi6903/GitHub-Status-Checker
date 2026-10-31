import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Cheap check: redirect if there is no session cookie. The pages verify it properly.
export function proxy(request: NextRequest) {
  const hasSession =
    request.cookies.has("authjs.session-token") ||
    request.cookies.has("__Secure-authjs.session-token");

  if (!hasSession) return NextResponse.redirect(new URL("/", request.url));
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*", "/ai/:path*"] };
