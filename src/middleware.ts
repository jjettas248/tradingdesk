import { NextRequest, NextResponse } from "next/server";

/**
 * HTTP Basic Auth gate on the dashboard pages. API routes (/api/*) are excluded —
 * the Telegram webhook and cron endpoints carry their own secrets. If the
 * DASHBOARD_BASIC_AUTH_* vars are unset, the gate is open (pure local dev).
 */
export function middleware(req: NextRequest) {
  const user = process.env.DASHBOARD_BASIC_AUTH_USER;
  const pass = process.env.DASHBOARD_BASIC_AUTH_PASS;
  if (!user || !pass) return NextResponse.next();

  const auth = req.headers.get("authorization");
  if (auth) {
    const [scheme, encoded] = auth.split(" ");
    if (scheme === "Basic" && encoded) {
      const decoded = atob(encoded);
      const idx = decoded.indexOf(":");
      const u = decoded.slice(0, idx);
      const p = decoded.slice(idx + 1);
      if (u === user && p === pass) return NextResponse.next();
    }
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Apex Desk"' },
  });
}

export const config = {
  // Everything except API routes and Next internals.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
