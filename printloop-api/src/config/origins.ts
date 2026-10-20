import { Config } from "@/config";

export function isAllowedOrigin(origin: string): boolean {
  return Config.allowedOrigins.some((pattern) => {
    if (pattern.startsWith("*.")) {
      const domain = pattern.slice(2);
      try {
        const host = new URL(origin).hostname.toLowerCase();
        return host === domain || host.endsWith(`.${domain}`);
      } catch {
        return false;
      }
    }
    return origin === pattern;
  });
}
