import { createAuthRoutes } from "@printloop/auth/handlers";
import { backofficeAccessError } from "@/lib/access";

export const dynamic = "force-dynamic";

export const { GET, POST } = createAuthRoutes({ allow: backofficeAccessError });
