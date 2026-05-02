import { useState, useCallback, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { VenuePoint } from '../types';

// Ensure Leaflet default icons resolve correctly (same fix as MeetMap)
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

export const VENUE_COLORS = ['#8b5cf6', '#3b82f6', '#ec4899', '#f59e0b', '#06b6d4'];
export const MAX_VENUES   = 5;

function makePickerIcon(color: string) {
  return L.divIcon({
    html: `<div style="
      width:22px;height:22px;border-radius:50%;
      background:${color};border:3px solid #fff;
      box-shadow:0 2px 8px rgba(0,0,0,0.5);
    "></div>`,
    className: '',
    iconSize:   [22, 22],
    iconAnchor: [11, 11],
  });
}

// Photon (Komoot) GeoJSON feature
interface PhotonFeature {
  geometry: { coordinates: [number, number] }; // [lon, lat]
  properties: {
    osm_id:      number;
    name?:       string;
    street?:     string;
    housenumber?: string;
    city?:       string;
    state?:      string;
    country?:    string;
    postcode?:   string;
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: e => onMapClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function MapFitter({ venuePoints }: { venuePoints: VenuePoint[] }) {
  const map = useMap();
  const prevLen = useRef(0);
  useEffect(() => {
    if (venuePoints.length === prevLen.current) return;
    prevLen.current = venuePoints.length;
    if (venuePoints.length === 1) {
      map.setView([venuePoints[0].lat, venuePoints[0].lng], 14, { animate: true });
    } else if (venuePoints.length > 1) {
      map.fitBounds(
        L.latLngBounds(venuePoints.map(v => [v.lat, v.lng] as L.LatLngExpression)),
        { padding: [24, 24], maxZoom: 16, animate: true },
      );
    }
  }, [venuePoints, map]);
  return null;
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  venuePoints: VenuePoint[];
  onChange: (points: VenuePoint[]) => void;
}

export default function VenuePicker({ venuePoints, onChange }: Props) {
  const [query,     setQuery]     = useState('');
  const [results,   setResults]   = useState<PhotonFeature[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Address search via Photon (Komoot) — free, no API key, global ────────────
  const handleQueryChange = useCallback((q: string) => {
    setQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) { setResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5&lang=en`,
        );
        const data = await res.json();
        setResults(data.features ?? []);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 450);
  }, []);

  // Build a readable label from Photon properties
  function photonLabel(p: PhotonFeature['properties']): string {
    const primary = p.name || (p.street ? `${p.street}${p.housenumber ? ' ' + p.housenumber : ''}` : '');
    return (primary || 'Venue').slice(0, 40);
  }

  // Build subtitle line: city / state / country
  function photonSubtitle(p: PhotonFeature['properties']): string {
    return [p.city, p.state, p.country].filter(Boolean).join(', ');
  }

  const addFromResult = (f: PhotonFeature) => {
    if (venuePoints.length >= MAX_VENUES) return;
    const [lng, lat] = f.geometry.coordinates;
    onChange([...venuePoints, {
      id:    crypto.randomUUID(),
      label: photonLabel(f.properties),
      lat,
      lng,
    }]);
    setQuery('');
    setResults([]);
  };

  // ── Map-click add ────────────────────────────────────────────────────────────
  const addFromMap = (lat: number, lng: number) => {
    if (venuePoints.length >= MAX_VENUES) return;
    onChange([...venuePoints, {
      id:    crypto.randomUUID(),
      label: `Venue ${venuePoints.length + 1}`,
      lat,
      lng,
    }]);
  };

  // ── Edit / remove ────────────────────────────────────────────────────────────
  const updateLabel = (id: string, label: string) =>
    onChange(venuePoints.map(p => p.id === id ? { ...p, label } : p));

  const remove = (id: string) => onChange(venuePoints.filter(p => p.id !== id));

  return (
    <div className="space-y-3">

      {/* Address search */}
      <div className="relative">
        <div className="flex items-center gap-2 bg-[#0f172a] border border-slate-700 focus-within:border-emerald-500 rounded-xl px-3 transition-colors">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" className="text-slate-500 flex-shrink-0">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            placeholder="Search for a place…"
            className="flex-1 bg-transparent outline-none py-2.5 text-white placeholder-slate-600 text-sm"
          />
          {searching && (
            <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          )}
        </div>

        {/* Dropdown results */}
        {results.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-[#1e293b] border border-slate-700 rounded-xl overflow-hidden shadow-2xl z-[9999] max-h-44 overflow-y-auto">
            {results.map((f, i) => (
              <button
                key={`${f.properties.osm_id}-${i}`}
                type="button"
                onClick={() => addFromResult(f)}
                className="w-full text-left px-3 py-2.5 hover:bg-slate-700/70 border-b border-slate-700/50 last:border-0 transition-colors"
              >
                <span className="font-medium text-white text-xs block truncate">
                  {photonLabel(f.properties)}
                </span>
                <span className="text-slate-500 text-[11px] block truncate">
                  {photonSubtitle(f.properties)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mini map */}
      <div className="rounded-xl overflow-hidden border border-slate-700" style={{ height: 180 }}>
        <MapContainer
          center={[20, 0]}
          zoom={2}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            maxZoom={19}
          />
          <MapClickHandler onMapClick={addFromMap} />
          <MapFitter venuePoints={venuePoints} />
          {venuePoints.map((vp, i) => (
            <Marker
              key={vp.id}
              position={[vp.lat, vp.lng]}
              icon={makePickerIcon(VENUE_COLORS[i % VENUE_COLORS.length])}
            />
          ))}
        </MapContainer>
      </div>

      <p className="text-[11px] text-slate-500 -mt-1">
        {venuePoints.length < MAX_VENUES
          ? 'Tap the map to drop a pin, or search above.'
          : `Maximum ${MAX_VENUES} venue points reached.`}
      </p>

      {/* Venue list with inline label editing */}
      {venuePoints.length > 0 && (
        <div className="space-y-2">
          {venuePoints.map((vp, i) => (
            <div key={vp.id} className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-white/20"
                style={{ background: VENUE_COLORS[i % VENUE_COLORS.length] }}
              />
              <input
                type="text"
                value={vp.label}
                onChange={e => updateLabel(vp.id, e.target.value)}
                maxLength={40}
                className="flex-1 bg-[#0f172a] border border-slate-700 focus:border-emerald-500 outline-none rounded-lg px-2.5 py-1.5 text-white text-xs transition-colors"
              />
              <button
                type="button"
                onClick={() => remove(vp.id)}
                className="w-6 h-6 flex items-center justify-center text-slate-600 hover:text-red-400 transition-colors text-xs flex-shrink-0"
                aria-label="Remove venue"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
