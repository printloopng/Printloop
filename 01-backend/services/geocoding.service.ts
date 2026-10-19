
export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName?: string;
}

export interface Geocoder {
  geocode(address: string): Promise<GeocodeResult | null>;
}

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT =
  process.env.GEOCODER_USER_AGENT ||
  'PrintLoop-SaaS/2.0 (https://printloop.app; ops@printloop.app)';

let lastNominatimAt = 0;
async function nominatimThrottle(): Promise<void> {
  const gap = Date.now() - lastNominatimAt;
  if (gap < 1100) await new Promise((r) => setTimeout(r, 1100 - gap));
  lastNominatimAt = Date.now();
}

class NominatimGeocoder implements Geocoder {
  async geocode(address: string): Promise<GeocodeResult | null> {
    const q = address.trim();
    if (!q) return null;
    await nominatimThrottle();
    try {
      const url =
        `${NOMINATIM_BASE}?format=json&limit=1&addressdetails=0` +
        `&q=${encodeURIComponent(q)}`;
      const r = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      });
      if (!r.ok) {
        console.warn(
          `[geocoder:nominatim] HTTP ${r.status} for "${q}"`,
        );
        return null;
      }
      const arr = (await r.json()) as Array<{
        lat: string;
        lon: string;
        display_name?: string;
      }>;
      if (!Array.isArray(arr) || arr.length === 0) return null;
      const top = arr[0];
      const lat = parseFloat(top.lat);
      const lng = parseFloat(top.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng, displayName: top.display_name };
    } catch (err) {
      console.warn('[geocoder:nominatim] error:', err);
      return null;
    }
  }
}

class DisabledGeocoder implements Geocoder {
  async geocode(): Promise<GeocodeResult | null> {
    return null;
  }
}

class FixtureGeocoder implements Geocoder {
  private table: Record<string, GeocodeResult> = {
    'yaba, lagos': { lat: 6.5095, lng: 3.3711, displayName: 'Yaba, Lagos' },
    'unilag, akoka, lagos': {
      lat: 6.5158,
      lng: 3.3898,
      displayName: 'UNILAG, Akoka, Lagos',
    },
    'lekki phase 1, lagos': {
      lat: 6.4488,
      lng: 3.4724,
      displayName: 'Lekki Phase 1, Lagos',
    },
    'ikoyi, lagos': {
      lat: 6.4541,
      lng: 3.435,
      displayName: 'Ikoyi, Lagos',
    },
  };
  async geocode(address: string): Promise<GeocodeResult | null> {
    return this.table[address.trim().toLowerCase()] || null;
  }
}

let cached: Geocoder | null = null;

export function getGeocoder(): Geocoder {
  if (cached) return cached;
  const choice = (process.env.GEOCODER || 'nominatim').toLowerCase();
  if (choice === 'disabled') cached = new DisabledGeocoder();
  else if (choice === 'fixture') cached = new FixtureGeocoder();
  else cached = new NominatimGeocoder();
  return cached;
}

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function _resetGeocoderForTests(): void {
  cached = null;
}
