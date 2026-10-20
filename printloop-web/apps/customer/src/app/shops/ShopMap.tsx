"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { useEffect } from "react";
import type { Shop } from "./ShopFinder";

const LAGOS: [number, number] = [6.5158, 3.3898];

function pin(color: string, active: boolean) {
  const size = active ? 34 : 26;
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    html: `<div style="width:${size}px;height:${size}px;background:${color};border:3px solid #1A1410;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:3px 3px 0 #1A1410"></div>`,
  });
}

function Fit({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView(points[0]!, 15);
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
  }, [map, points]);
  return null;
}

export default function ShopMap({
  shops,
  center,
  currentSlug,
}: {
  shops: Shop[];
  center: [number, number] | null;
  currentSlug: string | null;
}) {
  const placed = shops.filter((s) => s.lat != null && s.lng != null);
  const points = placed.map((s) => [s.lat as number, s.lng as number] as [number, number]);
  return (
    <div className="border-2 border-ink h-[28rem] sm:h-[34rem] relative z-0">
      <MapContainer center={center ?? points[0] ?? LAGOS} zoom={14} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Fit points={center ? [center, ...points] : points} />
        {center ? (
          <Marker position={center} icon={pin("#6B7A5C", false)}>
            <Popup>You are here</Popup>
          </Marker>
        ) : null}
        {placed.map((s) => (
          <Marker
            key={s.slug}
            position={[s.lat as number, s.lng as number]}
            icon={pin(s.agentOnline ? s.brand.primaryColor || "#D14B2C" : "#888888", s.slug === currentSlug)}
          >
            <Popup>
              <div style={{ fontFamily: "var(--font-inter)", minWidth: 180 }}>
                <strong style={{ fontSize: 15 }}>{s.brand.wordmark || s.name}</strong>
                <div style={{ fontSize: 12, color: "#888", margin: "4px 0 8px" }}>
                  {s.agentOnline ? "Online" : "Offline"}
                  {s.cheapestPerPage != null ? ` · from ₦${s.cheapestPerPage}/page` : ""}
                </div>
                <a href={`/shops/${s.slug}`} style={{ color: "#D14B2C", fontWeight: 700, marginRight: 12 }}>
                  Details
                </a>
                <a href={`/?shop=${encodeURIComponent(s.slug)}`} style={{ color: "#1A1410", fontWeight: 700 }}>
                  Print here →
                </a>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
