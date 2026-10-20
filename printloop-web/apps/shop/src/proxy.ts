import type { NextRequest } from "next/server";
import { runEdge } from "@printloop/auth/edge";

const PUBLIC_PATHS = ["/login", "/signup", "/verify-email", "/forgot-password", "/reset-password", "/impersonate"];

export function proxy(request: NextRequest) {
  return runEdge(request, { publicPaths: PUBLIC_PATHS, loginPath: "/login" });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
