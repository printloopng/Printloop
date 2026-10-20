const production = process.env.NODE_ENV === "production";

function origin(value) {
  return (value || "").replace(/\/+$/, "");
}

export function contentSecurityPolicy({ apiOrigin, connect = [], allowEval = false, frameAncestors = "'none'" }) {
  const api = origin(apiOrigin);
  const ws = api.replace(/^http/, "ws");
  const evalSource = allowEval || !production ? " 'unsafe-eval'" : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${evalSource}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    ["connect-src 'self'", api, ws, ...connect].filter(Boolean).join(" "),
    "worker-src 'self' blob:",
    "frame-src 'self' blob:",
    `frame-ancestors ${frameAncestors}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.paystack.com",
    production ? "upgrade-insecure-requests" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function securityHeaders(options) {
  return [
    {
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: contentSecurityPolicy(options) },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self), payment=()" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ...(production
          ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
          : []),
      ],
    },
  ];
}

export function createNextConfig({ allowEval = false, connect = [], extra = {} } = {}) {
  const apiOrigin = origin(process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000");
  return {
    reactStrictMode: true,
    poweredByHeader: false,
    transpilePackages: ["@printloop/ui", "@printloop/api-client", "@printloop/auth"],
    images: {
      remotePatterns: [
        { protocol: "https", hostname: "res.cloudinary.com" },
        { protocol: "https", hostname: "**.amazonaws.com" },
      ],
    },
    async headers() {
      return securityHeaders({ apiOrigin, connect, allowEval });
    },
    ...extra,
  };
}
