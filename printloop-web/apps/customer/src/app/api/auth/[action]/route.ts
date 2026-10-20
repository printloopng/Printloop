import { createAuthRoutes } from "@printloop/auth/handlers";

export const dynamic = "force-dynamic";

export const { GET, POST } = createAuthRoutes({ allowRegister: true });
