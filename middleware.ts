import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const protectedRoutes = ["/dashboard", "/coach", "/trends", "/query", "/plan", "/alerts", "/profile", "/onboarding"];

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Some OAuth providers/Supabase fall back to SITE_URL and append `?code=...` on `/`.
  // Ensure the auth code is always exchanged by routing through `/auth/callback`.
  if (searchParams.has("code") && pathname !== "/auth/callback") {
    const callbackUrl = request.nextUrl.clone();
    callbackUrl.pathname = "/auth/callback";
    if (!callbackUrl.searchParams.has("next")) {
      callbackUrl.searchParams.set("next", pathname === "/" ? "/dashboard" : pathname);
    }
    return NextResponse.redirect(callbackUrl);
  }

  const { response, user } = await updateSession(request);
  const isProtected = protectedRoutes.some((route) => pathname.startsWith(route));

  if (!user && isProtected) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/login") {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
