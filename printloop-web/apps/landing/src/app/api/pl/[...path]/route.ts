import { createProxyRoute } from "@printloop/auth/handlers";

export const dynamic = "force-dynamic";

export const { GET, POST, PUT, PATCH, DELETE } = createProxyRoute();
