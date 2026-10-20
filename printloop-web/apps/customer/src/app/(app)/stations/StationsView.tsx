"use client";

import { MapPin, Printer } from "lucide-react";
import { EmptyState, ErrorState, Pill, Skeleton, timeAgo } from "@printloop/ui";
import { errorMessage } from "@printloop/api-client";
import { useApi } from "@printloop/api-client/react";
import { useShop } from "@/lib/shop-context";
import { ShopRequired } from "@/components/ShopRequired";

export function StationsView() {
  const shop = useShop();
  const $api = useApi();
  const q = $api.useQuery("get", "/customer/stations", {}, { refetchInterval: 20_000, enabled: Boolean(shop) });
  const stations = q.data?.data?.stations ?? [];

  if (!shop) return <ShopRequired action="see its printers" />;
  if (q.error) return <ErrorState message={errorMessage(q.error)} />;
  if (q.isLoading) {
    return (
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    );
  }
  if (!stations.length) {
    return <EmptyState icon={<Printer size={30} />} title="No stations yet" description={`${shop.name} hasn't connected a printer. Show your code at the counter.`} />;
  }
  return (
    <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {stations.map((s) => {
        const online = s.status === "online";
        return (
          <li key={s.id} className="border-2 border-ink bg-paper-light p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <Printer size={26} className="text-ochre" />
              <Pill tone={online ? "sage" : s.status === "maintenance" ? "ochre" : "fog"} live={online}>
                {s.status}
              </Pill>
            </div>
            <div>
              <h2 className="font-serif text-xl font-bold">{s.name}</h2>
              {s.area || s.campus ? <p className="text-sm text-fog">{[s.area, s.campus].filter(Boolean).join(" · ")}</p> : null}
            </div>
            <div className="mt-auto flex items-center justify-between text-sm">
              <span>{s.queue ? `${s.queue} in queue` : "No queue"}</span>
              <span className="text-xs text-fog">{s.lastSeenAt ? `Seen ${timeAgo(s.lastSeenAt)}` : "Never connected"}</span>
            </div>
            {s.mapsUrl ? (
              <a href={s.mapsUrl} target="_blank" rel="noreferrer" className="pl-btn-ghost pl-btn-sm">
                <MapPin size={13} /> Directions
              </a>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
