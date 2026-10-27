"use client";

import { useState } from "react";
import { ExternalLink, MapPin } from "lucide-react";
import { Button, Card, Checkbox, Input, KeyValue, Notice, Section, toast } from "@printloop/ui";
import { isApiError, unwrap } from "@printloop/api-client";
import { useApiClient } from "@printloop/api-client/react";
import { appUrls } from "@printloop/auth/config";
import { useAction } from "@/lib/actions";
import { useCanManage, useShopProfile } from "@/lib/shop-context";

export function LocationTab() {
  const shop = useShopProfile();
  const client = useApiClient();
  const manage = useCanManage();
  const { run, isPending } = useAction();
  const [address, setAddress] = useState(shop.address ?? "");
  const [gateError, setGateError] = useState<string | null>(null);
  const shopLink = `${appUrls.customer}/print/new?shop=${shop.slug}`;
  const pinned = shop.lat != null && shop.lng != null;

  const saveAddress = () =>
    run("address", () => unwrap(client.PATCH("/saas/me/location", { body: { address: address.trim() || null } })), { invalidate: ["/saas/me"] }).then((r) => {
      if (!r) return;
      if (address.trim() && r.lat == null) toast.warning("Saved, but we couldn't find that address on the map. Add a landmark or the street name.");
      else toast.success("Address saved.");
    });

  const setListed = async (isDiscoverable: boolean) => {
    setGateError(null);
    try {
      await run("listed", () => unwrap(client.PATCH("/saas/me/location", { body: { isDiscoverable } })), {
        success: isDiscoverable ? "Your shop is now listed in Find a shop." : "Your shop is hidden from Find a shop.",
        invalidate: ["/saas/me"],
        rethrow: true,
      });
    } catch (err) {
      if (isApiError(err) && err.code === "LIVE_GATE_NOT_MET") setGateError(err.message);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <Section title="Address" description="Students use this to find you. We place the map pin from it.">
          <Card className="space-y-3">
            <Input label="Street address" value={address} disabled={!manage} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. 12 Akoka Road, beside the Faculty of Arts, UNILAG" />
            <p className="text-xs text-fog flex items-center gap-1.5">
              <MapPin size={12} /> {pinned ? `Pinned at ${shop.lat?.toFixed(4)}, ${shop.lng?.toFixed(4)}` : "Not on the map yet"}
            </p>
            {manage ? (
              <Button size="sm" disabled={address.trim() === (shop.address ?? "")} loading={isPending("address")} onClick={saveAddress}>
                Save address
              </Button>
            ) : null}
          </Card>
        </Section>
        <Section title="Find a shop listing" description="Show your shop on the public map so new students can discover you.">
          <Card className="space-y-3">
            <Checkbox
              label="List my shop publicly"
              description="Needs an address on the map, an active account, a kiosk online and a passed test print."
              checked={shop.isDiscoverable}
              disabled={!manage || isPending("listed")}
              onChange={(e) => void setListed(e.target.checked)}
            />
            {gateError ? <Notice tone="warn">{gateError}</Notice> : null}
          </Card>
        </Section>
      </div>
      <Card className="h-fit space-y-4">
        <KeyValue
          items={[
            ["Shop", shop.name],
            ["Handle", <span key="s" className="pl-mono">{shop.slug}</span>],
            ["Status", shop.status],
            ["PrintLoop fee", `${(Number(shop.commissionPct ?? 0) * 100).toFixed(1)}%`],
          ]}
        />
        <div>
          <div className="editorial-label mb-1.5">Your print link</div>
          <a href={shopLink} target="_blank" rel="noreferrer" className="pl-link text-sm break-all inline-flex items-start gap-1">
            {shopLink} <ExternalLink size={12} className="mt-1 shrink-0" />
          </a>
          <p className="text-xs text-fog mt-1">Share it or print it as a QR at your counter. Students land straight on your shop.</p>
        </div>
      </Card>
    </div>
  );
}
