import type { Metadata } from "next";
import { TenantsView } from "./TenantsView";

export const metadata: Metadata = { title: "Shops" };

export default function TenantsPage() {
  return <TenantsView />;
}
