import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import type { RootState } from "@/store";

export function SaasProtectedRoute() {
  const accessToken = useSelector((s: RootState) => s.auth.accessToken);
  const location = useLocation();
  if (!accessToken) {
    return <Navigate to={`/saas/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }
  return <Outlet />;
}
