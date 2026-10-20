import { describe, expect, it } from "vitest";
import { formatBytes, formatNaira, initials, timeAgo } from "./format";

describe("format", () => {
  it("formats naira and tolerates bad input", () => {
    expect(formatNaira(1500)).toMatch(/1,500/);
    expect(formatNaira("250.5")).toMatch(/250\.5/);
    expect(formatNaira(null)).toBe("—");
    expect(formatNaira("abc")).toBe("—");
  });

  it("describes relative time", () => {
    const now = Date.parse("2026-01-10T12:00:00Z");
    expect(timeAgo("2026-01-10T11:59:50Z", now)).toBe("just now");
    expect(timeAgo("2026-01-10T11:30:00Z", now)).toBe("30m ago");
    expect(timeAgo("2026-01-10T07:00:00Z", now)).toBe("5h ago");
    expect(timeAgo("2026-01-07T12:00:00Z", now)).toBe("3d ago");
    expect(timeAgo(undefined, now)).toBe("—");
  });

  it("formats sizes and initials", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(initials("ada", "obi")).toBe("AO");
    expect(initials(null, null)).toBe("PL");
  });
});
