import { createAuthRoutes } from "@printloop/auth/handlers";
import { shopAccessError } from "@/lib/access";

export const dynamic = "force-dynamic";

export const { GET, POST } = createAuthRoutes({ allow: shopAccessError });
