import { describe, expect, it } from "vitest";
import { ApiError, createApiClient, errorMessage, isApiError, unwrap, unwrapEnvelope } from "./index";

function clientReplying(status: number, body: unknown, contentType = "application/json") {
  return createApiClient({
    baseUrl: "http://api.test",
    fetch: async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": contentType } }),
  });
}

describe("unwrapEnvelope", () => {
  it("returns the data of a success envelope", () => {
    expect(unwrapEnvelope({ success: true, data: { id: 1 } })).toEqual({ id: 1 });
  });

  it("returns undefined for an envelope with no data", () => {
    expect(unwrapEnvelope({ success: true, message: "ok" })).toBeUndefined();
  });

  it("passes through bodies that are not envelopes", () => {
    expect(unwrapEnvelope("a,b\n1,2")).toBe("a,b\n1,2");
  });
});

describe("errorMessage", () => {
  it("prefers the API's own message", () => {
    expect(errorMessage(new ApiError(400, "Choose a print shop first."))).toBe("Choose a print shop first.");
  });

  it("hides network noise behind the fallback", () => {
    expect(errorMessage(new TypeError("fetch failed"))).toBe("Something went wrong. Please try again.");
    expect(errorMessage("boom", "Custom")).toBe("Custom");
  });
});

describe("createApiClient", () => {
  it("throws an ApiError carrying the message and code of a flat error body", async () => {
    const client = clientReplying(409, { success: false, message: "Already exists", code: "DUPLICATE" });
    const err = await client.GET("/pricing" as never).catch((e: unknown) => e);
    expect(isApiError(err)).toBe(true);
    expect(err).toMatchObject({ status: 409, message: "Already exists", code: "DUPLICATE" });
  });

  it("reads the nested error shape used by AppError responses", async () => {
    const client = clientReplying(400, { success: false, error: { message: "Choose a print shop first.", code: "TENANT_REQUIRED" } });
    const err = await client.GET("/pricing" as never).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 400, message: "Choose a print shop first.", code: "TENANT_REQUIRED" });
  });

  it("falls back to a friendly message when the body is not JSON", async () => {
    const client = clientReplying(503, "<html>down</html>", "text/html");
    const err = await client.GET("/pricing" as never).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 503, message: "PrintLoop is having trouble right now. Please try again." });
  });

  it("unwraps successful responses", async () => {
    const client = clientReplying(200, { success: true, data: { ok: true } });
    expect(await unwrap(client.GET("/pricing" as never) as never)).toEqual({ ok: true });
  });
});
