import { describe, expect, it } from "vitest";
import { isValidSlug, tenantFromHost } from "./tenant";
import { safeNextPath } from "./config";

const apexes = ["printloop.app", "printloop.test"];

describe("tenantFromHost", () => {
  it("reads shop subdomains and ignores product hosts", () => {
    expect(tenantFromHost("unilag-copy.printloop.app", apexes)).toEqual({ slug: "unilag-copy" });
    expect(tenantFromHost("UNILAG-COPY.printloop.app:443", apexes)).toEqual({ slug: "unilag-copy" });
    expect(tenantFromHost("app.printloop.app", apexes)).toEqual({});
    expect(tenantFromHost("shop.printloop.app", apexes)).toEqual({});
    expect(tenantFromHost("printloop.app", apexes)).toEqual({});
  });

  it("treats foreign hosts as custom domains and local hosts as none", () => {
    expect(tenantFromHost("print.unilag.edu.ng", apexes)).toEqual({ domain: "print.unilag.edu.ng" });
    expect(tenantFromHost("localhost:3001", apexes)).toEqual({});
    expect(tenantFromHost("127.0.0.1:3001", apexes)).toEqual({});
    expect(tenantFromHost("legacy.localhost:3001", apexes)).toEqual({ slug: "legacy" });
    expect(tenantFromHost("printloop-web-git-main.vercel.app", apexes)).toEqual({});
  });

  it("rejects malformed slugs", () => {
    expect(isValidSlug("a")).toBe(false);
    expect(isValidSlug("ok-shop")).toBe(true);
    expect(isValidSlug("Bad_Slug")).toBe(false);
    expect(isValidSlug("www")).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("only allows same-site relative paths", () => {
    expect(safeNextPath("/jobs?tab=active")).toBe("/jobs?tab=active");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath("/api/pl/customer/auth/me")).toBe("/");
    expect(safeNextPath(null, "/dashboard")).toBe("/dashboard");
  });
});
