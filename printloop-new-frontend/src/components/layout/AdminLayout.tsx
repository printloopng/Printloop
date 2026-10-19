import { Outlet } from "react-router-dom";

export function AdminLayout() {
  return (
    <div className="min-h-screen bg-ink">
      <Outlet />
    </div>
  );
}
