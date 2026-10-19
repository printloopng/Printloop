import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import type { RootState } from "@/store";
import { ROUTES } from "@/constants/routes";

export function ProtectedRoute() {
  const token = useSelector((s: RootState) => s.auth.accessToken);
  const location = useLocation();
  if (!token) {
    return <Navigate to={ROUTES.AUTH.LOGIN} state={{ from: location }} replace />;
  }
  return <Outlet />;
}

export function AdminProtectedRoute() {
  const token = useSelector((s: RootState) => s.auth.accessToken);
  const user = useSelector((s: RootState) => s.auth.user) as any;
  const location = useLocation();

  if (!token) {
    return <Navigate to={ROUTES.ADMIN.LOGIN} state={{ from: location }} replace />;
  }

  const role = user?.role;
  if (role !== "admin" && role !== "super_admin") {
    return <Navigate to={ROUTES.ADMIN.LOGIN} state={{ from: location }} replace />;
  }

  return <Outlet />;
}

export function PublicOnlyRoute() {
  const token = useSelector((s: RootState) => s.auth.accessToken);
  if (token) return <Navigate to={ROUTES.APP.DASHBOARD} replace />;
  return <Outlet />;
}

export function AdminPublicOnlyRoute() {
  const token = useSelector((s: RootState) => s.auth.accessToken);
  const user = useSelector((s: RootState) => s.auth.user) as any;
  const role = user?.role;
  if (token && (role === "admin" || role === "super_admin")) {
    return <Navigate to={ROUTES.ADMIN.HOME} replace />;
  }
  return <Outlet />;
}
