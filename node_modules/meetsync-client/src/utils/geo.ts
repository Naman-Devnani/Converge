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

export function formatETA(km: number, speedKmh = 5): string {
  if (km < 0.03) return 'Here!';
  const mins = (km / speedKmh) * 60;
  if (mins < 1)  return '< 1 min';
  if (mins < 60) return `~${Math.round(mins)} min`;
  return `~${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`;
}

// Snap coordinates to a ~500 m grid for privacy blur mode.
// Consistent: same real location always produces the same snapped point.
export function toApproximate(lat: number, lng: number): { lat: number; lng: number } {
  const precision = 0.005; // ≈ 500 m
  return {
    lat: Math.round(lat / precision) * precision,
    lng: Math.round(lng / precision) * precision,
  };
}

const ADJECTIVES = ['Swift', 'Bright', 'Cool', 'Quick', 'Bold', 'Calm', 'Keen', 'Wise', 'Jolly', 'Merry'];
const NOUNS      = ['Fox', 'Owl', 'Bear', 'Deer', 'Wolf', 'Hawk', 'Lynx', 'Puma', 'Otter', 'Robin'];

export function randomName(): string {
  const adj  = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj} ${noun}`;
}
