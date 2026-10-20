import type { NextRequest } from "next/server";
import { runEdge } from "@printloop/auth/edge";

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  "/join",
  "/shops",
  "/offline",
];

export function proxy(request: NextRequest) {
  return runEdge(request, { tenantAware: true, publicPaths: PUBLIC_PATHS, loginPath: "/login" });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|manifest.webmanifest|pdf.worker.min.mjs).*)"],
};
