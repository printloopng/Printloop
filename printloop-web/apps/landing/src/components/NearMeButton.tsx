"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Crosshair } from "lucide-react";

export function NearMeButton({ active }: { active: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "asking" | "denied">("idle");

  const locate = () => {
    if (!navigator.geolocation) return setState("denied");
    setState("asking");
    navigator.geolocation.getCurrentPosition(
      (p) => router.push(`/find?lat=${p.coords.latitude.toFixed(5)}&lng=${p.coords.longitude.toFixed(5)}`),
      () => setState("denied"),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
    );
  };

  return (
    <div className="flex flex-col gap-1">
      <button type="button" onClick={locate} disabled={state === "asking"} className={`pl-chip ${active ? "pl-chip-active" : ""}`}>
        <Crosshair size={13} aria-hidden /> {state === "asking" ? "Locating…" : active ? "Near me" : "Use my location"}
      </button>
      {state === "denied" ? <span role="status" className="text-xs text-fog">Location is off in your browser, so shops are listed by name.</span> : null}
    </div>
  );
}
