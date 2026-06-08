import { useState, useCallback, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { VenuePoint } from '../types';
import '../utils/leaflet-setup';
import { safeHexColor } from '../utils/sanitize';

export const VENUE_COLORS = ['#4edea3', '#2dd4bf', '#6ee7b7', '#b76dff', '#4d8eff'];
export const MAX_VENUES   = 5;

function makePickerIcon(color: string) {
  const safeColor = safeHexColor(color);
  return L.divIcon({
    html: `<div style="width:18px;height:18px;border-radius:50%;background:${safeColor};border:2px solid #0b1326;box-shadow:0 0 12px ${safeColor},0 0 0 1.5px rgba(255,255,255,.7);"></div>`,
    className: '', iconSize: [18, 18], iconAnchor: [9, 9],
  });
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: { osm_id: number; name?: string; street?: string; housenumber?: string; city?: string; state?: string; country?: string; postcode?: string };
}

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
    if (venuePoints.length === 1) map.setView([venuePoints[0].lat, venuePoints[0].lng], 14, { animate: true });
    else if (venuePoints.length > 1) map.fitBounds(L.latLngBounds(venuePoints.map(v => [v.lat, v.lng] as L.LatLngExpression)), { padding: [24, 24], maxZoom: 16, animate: true });
  }, [venuePoints, map]);
  return null;
}

interface Props {
  venuePoints: VenuePoint[];
  onChange: (points: VenuePoint[]) => void;
}

export default function VenuePicker({ venuePoints, onChange }: Props) {
  const [query, setQuery]         = useState('');
  const [results, setResults]     = useState<PhotonFeature[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);

  const handleQueryChange = useCallback((q: string) => {
    setQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) { setResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5&lang=en`);
        if (!res.ok) throw new Error('Photon API error');
        const data = await res.json();
        setResults(data.features ?? []);
      } catch { setResults([]); } finally { setSearching(false); }
    }, 450);
  }, []);

  function photonLabel(p: PhotonFeature['properties']): string {
    const primary = p.name || (p.street ? `${p.street}${p.housenumber ? ' ' + p.housenumber : ''}` : '');
    return (primary || 'Venue').slice(0, 40);
  }
  function photonSubtitle(p: PhotonFeature['properties']): string {
    return [p.city, p.state, p.country].filter(Boolean).join(', ');
  }

  const addFromResult = (f: PhotonFeature) => {
    if (!f?.geometry?.coordinates?.length || venuePoints.length >= MAX_VENUES) return;
    const [lng, lat] = f.geometry.coordinates;
    onChange([...venuePoints, { id: crypto.randomUUID(), label: photonLabel(f.properties), lat, lng }]);
    setQuery(''); setResults([]);
  };
  const addFromMap = (lat: number, lng: number) => {
    if (venuePoints.length >= MAX_VENUES) return;
    onChange([...venuePoints, { id: crypto.randomUUID(), label: `Venue ${venuePoints.length + 1}`, lat, lng }]);
  };
  const updateLabel = (id: string, label: string) => onChange(venuePoints.map(p => p.id === id ? { ...p, label } : p));
  const remove = (id: string) => onChange(venuePoints.filter(p => p.id !== id));

  const full = venuePoints.length >= MAX_VENUES;

  return (
    <div className="space-y-md">
      {/* Search */}
      <div>
        <div className="relative">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px] pointer-events-none">search</span>
          <input
            type="text" value={query} onChange={e => handleQueryChange(e.target.value)}
            placeholder="Search address or venue name…"
            className="w-full bg-surface-container-low border-none rounded-2xl py-3 pl-12 pr-10 text-on-surface placeholder:text-outline focus:ring-2 focus:ring-secondary transition-all outline-none text-body-md"
          />
          {searching && <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-secondary border-t-transparent rounded-full animate-spin" />}

          {results.length > 0 && (
            <div className="fade-in-down absolute z-[9999] top-full left-0 right-0 mt-2 glass-card rounded-2xl overflow-hidden shadow-2xl max-h-52 overflow-y-auto">
              <div className="p-2 space-y-1">
                {results.map((f, i) => (
                  <button key={`${f.properties.osm_id}-${i}`} type="button" onClick={() => addFromResult(f)} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surface-container-high transition-colors text-left">
                    <span className="material-symbols-outlined text-secondary opacity-70 flex-shrink-0">location_on</span>
                    <div className="min-w-0">
                      <p className="text-on-surface font-semibold text-sm truncate">{photonLabel(f.properties)}</p>
                      <p className="text-xs text-on-surface-variant truncate">{photonSubtitle(f.properties)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <p className="text-[10px] text-on-surface-variant/60 mt-1 ml-1">Place search by <a href="https://photon.komoot.io" target="_blank" rel="noopener noreferrer" className="underline">Photon/OSM</a></p>
      </div>

      {/* Map */}
      <div className="relative rounded-3xl overflow-hidden border border-white/10" style={{ height: 200 }}>
        <MapContainer center={[20, 0]} zoom={2} style={{ height: '100%', width: '100%' }} zoomControl={false} attributionControl={false}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" maxZoom={19} />
          <MapClickHandler onMapClick={addFromMap} />
          <MapFitter venuePoints={venuePoints} />
          {venuePoints.map((vp, i) => <Marker key={vp.id} position={[vp.lat, vp.lng]} icon={makePickerIcon(VENUE_COLORS[i % VENUE_COLORS.length])} />)}
        </MapContainer>
        {!full && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[500] pointer-events-none">
            <div className="bg-surface-container-highest/80 backdrop-blur-md px-4 py-2 rounded-full border border-secondary/20 shadow-xl">
              <p className="text-label-md text-on-surface whitespace-nowrap">Tap the map to drop a pin</p>
            </div>
          </div>
        )}
      </div>

      {/* Added venues */}
      {venuePoints.length > 0 && (
        <div className="space-y-md">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-headline-md text-secondary">Added venues</h2>
            <span className="bg-secondary/10 text-secondary text-xs font-bold px-2 py-1 rounded-full border border-secondary/20">{venuePoints.length} / {MAX_VENUES}</span>
          </div>
          <div className="space-y-2.5">
            {venuePoints.map((vp, i) => (
              <div key={vp.id} className="flex items-center gap-3 p-3 glass-card rounded-2xl">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: VENUE_COLORS[i % VENUE_COLORS.length], boxShadow: `0 0 8px ${VENUE_COLORS[i % VENUE_COLORS.length]}` }} />
                <input type="text" value={vp.label} onChange={e => updateLabel(vp.id, e.target.value)} maxLength={40} className="flex-1 bg-transparent border-none p-0 text-on-surface font-semibold focus:ring-0 outline-none text-sm" />
                <button type="button" onClick={() => remove(vp.id)} aria-label="Remove venue" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-error/20 text-on-surface-variant hover:text-error transition-colors flex-shrink-0">
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {full && <p className="text-[11px] text-on-surface-variant text-center">Maximum {MAX_VENUES} venue points reached.</p>}
    </div>
  );
}
