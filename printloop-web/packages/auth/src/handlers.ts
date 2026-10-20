import { NextResponse, type NextRequest } from "next/server";
import {
  IMPERSONATION_COOKIE,
  SESSION_COOKIE,
  apiOrigin,
  sessionCookieOptions,
  type SessionUser,
} from "./config";
import { upstreamHeaders } from "./server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const FORWARD_REQUEST = [
  "accept",
  "content-type",
  "accept-language",
  "x-request-id",
  "idempotency-key",
  "x-upload-token",
  "if-none-match",
];
const FORWARD_RESPONSE = [
  "content-type",
  "content-disposition",
  "cache-control",
  "etag",
  "last-modified",
  "x-request-id",
  "retry-after",
  "ratelimit-limit",
  "ratelimit-remaining",
  "ratelimit-reset",
];
const BLOCKED: RegExp[] = [/^customer\/auth\/(login|register)$/];

export type AllowUser = (user: SessionUser) => string | null;

function json(status: number, body: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(body, { status, ...init });
}

export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  const site = req.headers.get("sec-fetch-site");
  return site === "same-origin" || site === "none";
}

async function upstream(req: NextRequest, path: string, init: RequestInit & { duplex?: "half" }) {
  return fetch(`${apiOrigin()}/api/${path}`, { ...init, redirect: "manual", cache: "no-store" });
}

export function createProxyRoute(options: { blocked?: RegExp[] } = {}) {
  const blocked = [...BLOCKED, ...(options.blocked ?? [])];
  const handler = async (req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) => {
    const segments = (await ctx.params).path ?? [];
    if (segments.some((s) => s === ".." || s === "." || s.includes("\\"))) {
      return json(400, { success: false, message: "Bad path" });
    }
    const path = segments.map(encodeURIComponent).join("/");
    if (blocked.some((re) => re.test(path))) {
      return json(404, { success: false, message: "Not found" });
    }
    if (!SAFE_METHODS.has(req.method) && !isSameOrigin(req)) {
      return json(403, { success: false, message: "Cross-site request blocked", code: "CSRF" });
    }
    const token = req.cookies.get(SESSION_COOKIE)?.value ?? null;
    const headers = new Headers(upstreamHeaders(req.headers, token));
    for (const name of FORWARD_REQUEST) {
      const value = req.headers.get(name);
      if (value) headers.set(name, value);
    }
    const hasBody = !SAFE_METHODS.has(req.method);
    let res: Response;
    try {
      res = await upstream(req, `${path}${req.nextUrl.search}`, {
        method: req.method,
        headers,
        body: hasBody ? req.body : undefined,
        duplex: hasBody ? "half" : undefined,
      });
    } catch {
      return json(502, { success: false, message: "PrintLoop is unreachable right now. Please try again." });
    }
    const out = new Headers();
    for (const name of FORWARD_RESPONSE) {
      const value = res.headers.get(name);
      if (value) out.set(name, value);
    }
    if (!out.has("cache-control")) out.set("cache-control", "no-store");
    return new NextResponse(res.status === 204 || res.status === 304 ? null : res.body, {
      status: res.status,
      headers: out,
    });
  };
  return { GET: handler, POST: handler, PUT: handler, PATCH: handler, DELETE: handler };
}

function decodeClaims(token: string): Record<string, unknown> {
  try {
    const part = token.split(".")[1] ?? "";
    return JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    return {};
  }
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function fetchMe(req: NextRequest, token: string): Promise<SessionUser | null> {
  const res = await upstream(req, "customer/auth/me", { headers: upstreamHeaders(req.headers, token) });
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  return (body?.data as SessionUser) ?? null;
}

function issueSession(res: NextResponse, token: string) {
  const claims = decodeClaims(token);
  const exp = typeof claims.exp === "number" ? claims.exp : 0;
  const maxAge = exp ? Math.max(60, exp - Math.floor(Date.now() / 1000)) : undefined;
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(maxAge));
  const impersonating = claims.impersonating as { tenantId?: string } | undefined;
  if (impersonating?.tenantId) {
    res.cookies.set(IMPERSONATION_COOKIE, impersonating.tenantId, {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge,
    });
  } else {
    res.cookies.delete(IMPERSONATION_COOKIE);
  }
}

export function createAuthRoutes(options: { allow?: AllowUser; allowRegister?: boolean } = {}) {
  const deny = (user: SessionUser) => options.allow?.(user) ?? null;

  const exchange = async (req: NextRequest, path: string, body: Record<string, unknown>, status = 200) => {
    let res: Response;
    try {
      res = await upstream(req, path, {
        method: "POST",
        headers: { ...upstreamHeaders(req.headers), "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      return json(502, { success: false, message: "PrintLoop is unreachable right now. Please try again." });
    }
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload?.data?.tokens?.accessToken) {
      return json(res.ok ? 502 : res.status, payload ?? { success: false, message: "Sign-in failed" });
    }
    const user = payload.data.user as SessionUser;
    const reason = deny(user);
    if (reason) return json(403, { success: false, message: reason, code: "WRONG_APP" });
    const out = json(status, { success: true, data: { user } });
    issueSession(out, payload.data.tokens.accessToken);
    return out;
  };

  const POST = async (req: NextRequest, ctx: { params: Promise<{ action: string }> }) => {
    const { action } = await ctx.params;
    if (!isSameOrigin(req)) {
      return json(403, { success: false, message: "Cross-site request blocked", code: "CSRF" });
    }
    const body = await readJson(req);
    if (action === "login") {
      return exchange(req, "customer/auth/login", {
        email: body.email,
        password: body.password,
        ...(body.totpCode ? { totpCode: body.totpCode } : {}),
      });
    }
    if (action === "register" && options.allowRegister) {
      return exchange(
        req,
        "customer/auth/register",
        {
          email: body.email,
          password: body.password,
          firstName: body.firstName,
          lastName: body.lastName,
          phoneNumber: body.phoneNumber,
        },
        201,
      );
    }
    if (action === "adopt") {
      const token = typeof body.token === "string" ? body.token : "";
      const user = token ? await fetchMe(req, token) : null;
      if (!user) return json(401, { success: false, message: "That sign-in link has expired." });
      const reason = deny(user);
      if (reason) return json(403, { success: false, message: reason, code: "WRONG_APP" });
      const out = json(200, { success: true, data: { user } });
      issueSession(out, token);
      return out;
    }
    if (action === "logout") {
      const out = json(200, { success: true });
      out.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(0) });
      out.cookies.delete(IMPERSONATION_COOKIE);
      return out;
    }
    return json(404, { success: false, message: "Not found" });
  };

  const GET = async (req: NextRequest, ctx: { params: Promise<{ action: string }> }) => {
    const { action } = await ctx.params;
    if (action !== "session") return json(404, { success: false, message: "Not found" });
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    const user = token ? await fetchMe(req, token) : null;
    return json(200, { success: true, data: { user: user && !deny(user) ? user : null } }, {
      headers: { "cache-control": "no-store" },
    });
  };

  return { GET, POST };
}
