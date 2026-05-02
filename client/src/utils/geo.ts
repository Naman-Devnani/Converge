export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(km: number): string {
  if (km < 0.03) return 'Arrived!';
  if (km < 1)    return `${Math.round(km * 1000)} m away`;
  return `${km.toFixed(1)} km away`;
}

// L-3: Accept an optional live speed (km/h) so callers can pass
// participant.speed * 3.6 when available instead of always assuming walking pace.
export function formatETA(km: number, speedKmh = 5): string {
  if (km < 0.03) return 'Here!';
  const mins = (km / Math.max(speedKmh, 0.5)) * 60;
  if (mins < 1)  return '< 1 min';
  if (mins < 60) return `~${Math.round(mins)} min`;
  return `~${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`;
}

// M-6: Build a session-scoped approximator that adds a STABLE RANDOM jitter to the
// grid snap.  The jitter is derived from a unique per-session seed so the same
// real position produces DIFFERENT grid cells across sessions — defeating
// re-identification by accumulating observations.
//
// Usage: call makeApproximator(crypto.randomUUID()) once on consent, then reuse
// the returned function for all location updates in that session.
export function makeApproximator(
  seed: string,
): (lat: number, lng: number) => { lat: number; lng: number } {
  // FNV-1a hash → two stable floats ∈ [0, 1)
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const jitterLat = ((h & 0xffff) / 0x10000 - 0.5) * 0.005;         // ±~250 m
  const jitterLng = (((h >>> 16) & 0xffff) / 0x10000 - 0.5) * 0.005;
  const precision = 0.005;                                            // ≈ 500 m grid
  return (lat, lng) => ({
    lat: Math.round((lat + jitterLat) / precision) * precision,
    lng: Math.round((lng + jitterLng) / precision) * precision,
  });
}

const ADJECTIVES = ['Swift', 'Bright', 'Cool', 'Quick', 'Bold', 'Calm', 'Keen', 'Wise', 'Jolly', 'Merry'];
const NOUNS      = ['Fox', 'Owl', 'Bear', 'Deer', 'Wolf', 'Hawk', 'Lynx', 'Puma', 'Otter', 'Robin'];

// Also switch randomName to CSPRNG while we're here
export function randomName(): string {
  const buf = new Uint8Array(2);
  crypto.getRandomValues(buf);
  return `${ADJECTIVES[buf[0] % ADJECTIVES.length]} ${NOUNS[buf[1] % NOUNS.length]}`;
}
