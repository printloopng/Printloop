import { NextResponse, type NextRequest } from "next/server";
import {
  PATHNAME_HEADER,
  SESSION_COOKIE,
  SHOP_COOKIE,
  TENANT_DOMAIN_HEADER,
  TENANT_SLUG_HEADER,
  TENANT_SOURCE_HEADER,
  safeNextPath,
} from "./config";
import { isValidSlug, tenantFromHost } from "./tenant";

export interface EdgeOptions {
  tenantAware?: boolean;
  publicPaths?: Array<string | RegExp>;
  loginPath?: string;
}

function matches(pathname: string, patterns: Array<string | RegExp>): boolean {
  return patterns.some((p) =>
    typeof p === "string" ? pathname === p || pathname.startsWith(`${p}/`) : p.test(pathname),
  );
}

export function runEdge(request: NextRequest, options: EdgeOptions = {}): NextResponse {
  const { pathname, searchParams } = request.nextUrl;
  const headers = new Headers(request.headers);
  headers.delete(TENANT_SLUG_HEADER);
  headers.delete(TENANT_DOMAIN_HEADER);
  headers.delete(TENANT_SOURCE_HEADER);
  headers.set(PATHNAME_HEADER, `${pathname}${request.nextUrl.search}`);

  let setShop: string | null | undefined;
  if (options.tenantAware) {
    const hint = tenantFromHost(request.headers.get("host"));
    const requested = searchParams.get("shop")?.toLowerCase();
    if (requested === "none") setShop = null;
    else if (isValidSlug(requested)) setShop = requested;
    const cookieSlug = request.cookies.get(SHOP_COOKIE)?.value;
    const slug = hint.slug ?? (setShop === undefined ? cookieSlug : setShop ?? undefined);
    if (hint.domain) {
      headers.set(TENANT_DOMAIN_HEADER, hint.domain);
      headers.set(TENANT_SOURCE_HEADER, "host");
    } else if (slug && isValidSlug(slug)) {
      headers.set(TENANT_SLUG_HEADER, slug);
      headers.set(TENANT_SOURCE_HEADER, hint.slug ? "host" : "choice");
    }
  }

  const needsLogin =
    options.publicPaths &&
    !pathname.startsWith("/api/") &&
    !matches(pathname, options.publicPaths) &&
    !request.cookies.get(SESSION_COOKIE);
  if (needsLogin) {
    const login = request.nextUrl.clone();
    login.pathname = options.loginPath ?? "/login";
    login.search = "";
    login.searchParams.set("next", safeNextPath(`${pathname}${request.nextUrl.search}`));
    return NextResponse.redirect(login);
  }

  if (setShop !== undefined && request.method === "GET" && !pathname.startsWith("/api/")) {
    const clean = request.nextUrl.clone();
    clean.searchParams.delete("shop");
    const res = NextResponse.redirect(clean);
    if (setShop) res.cookies.set(SHOP_COOKIE, setShop, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 90 });
    else res.cookies.delete(SHOP_COOKIE);
    return res;
  }

  return NextResponse.next({ request: { headers } });
}
