import Link from "next/link";
import { MapPin } from "lucide-react";
import { EmptyState, buttonClass } from "@printloop/ui";

export function ShopRequired({ action = "print" }: { action?: string }) {
  return (
    <EmptyState
      icon={<MapPin size={32} />}
      title="Choose a print shop first"
      description={`Prices, printers and pickup depend on the shop. Pick one near you to ${action}.`}
      action={
        <Link href="/shops" className={buttonClass("primary")}>
          Find a shop <span className="pl-arrow">→</span>
        </Link>
      }
    />
  );
}
