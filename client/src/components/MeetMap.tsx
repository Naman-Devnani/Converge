import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Participant, VenuePoint } from '../types';
import { VENUE_COLORS } from './VenuePicker';
import '../utils/leaflet-setup'; // N-2: shared icon fix
// SEC-08: Import shared sanitization utilities.
import { safeHexColor, escapeHtml } from '../utils/sanitize';

function makeIcon(color: string, name: string, isMe: boolean) {
  const size      = isMe ? 22 : 18;
  const half      = size / 2;
  const safeName  = escapeHtml(name);
  const safeColor = safeHexColor(color); // H-1
  return L.divIcon({
    html: `
      <div style="position:relative;width:${size}px;height:${size}px;">
        ${isMe ? `<div style="
          position:absolute;inset:0;border-radius:50%;
          background:${safeColor};opacity:0.35;
          animation:pulse-ring 2s ease-out infinite;
        "></div>` : ''}
        <div class="ms-marker ${isMe ? 'ms-marker-me' : ''}" style="
          width:${size}px;height:${size}px;
          background:${safeColor};
        "></div>
        <div class="ms-label">${safeName}${isMe ? ' ✦' : ''}</div>
      </div>
    `,
    className: '',
    iconSize:   [size, size],
    iconAnchor: [half, half],
  });
}

function makeMidpointIcon() {
  return L.divIcon({
    html: `
      <div style="position:relative;width:32px;height:32px;">
        <div style="
          width:32px;height:32px;border-radius:50%;
          background:#f59e0b;border:3px solid #fff;
          display:flex;align-items:center;justify-content:center;
          font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.5);
        ">🏁</div>
        <div class="ms-label" style="background:#f59e0b;color:#000;font-weight:700;">Meet here</div>
      </div>
    `,
    className: '',
    iconSize:   [32, 32],
    iconAnchor: [16, 16],
  });
}

function makeVenueIcon(label: string, color: string) {
  const safeLabel = escapeHtml(label.slice(0, 24));
  const safeColor = safeHexColor(color); // H-1
  return L.divIcon({
    html: `
      <div style="position:relative;width:34px;height:34px;">
        <div style="
          width:34px;height:34px;border-radius:50%;
          background:${safeColor};border:3px solid #fff;
          display:flex;align-items:center;justify-content:center;
          font-size:15px;box-shadow:0 2px 10px rgba(0,0,0,0.6);
        ">📍</div>
        <div class="ms-label" style="background:${safeColor};color:#fff;font-weight:700;white-space:nowrap;">${safeLabel}</div>
      </div>
    `,
    className: '',
    iconSize:   [34, 34],
    iconAnchor: [17, 17],
  });
}

interface MarkersProps {
  participants: Participant[];
  myId: string;
  venuePoints: VenuePoint[];
}

function Markers({ participants, myId, venuePoints }: MarkersProps) {
  const map = useMap();
  // M-2: Object.create(null) prevents prototype-pollution via special key names
  const markersRef      = useRef<Record<string, L.Marker>>(Object.create(null));
  const circlesRef      = useRef<Record<string, L.Circle>>(Object.create(null));
  const midpointRef     = useRef<L.Marker | null>(null);
  const venueMarkersRef = useRef<Record<string, L.Marker>>(Object.create(null));
  // PERF-06: Cache divIcon instances to avoid regenerating on every render.
  const iconCacheRef    = useRef<Record<string, L.DivIcon>>(Object.create(null));
  const userMovedRef = useRef(false);
  // skipZoomRef is set to true immediately before any programmatic setView/fitBounds
  // call so the resulting zoomstart event is not mistaken for a user interaction.
  const skipZoomRef  = useRef(false);

  // Stop auto-fitting once the user manually pans or zooms.
  // NOTE: Leaflet's zoomstart event never carries originalEvent (it is a map-state
  // event, not a DOM-event wrapper), so we cannot use originalEvent to distinguish
  // user from programmatic zooms. Instead we use skipZoomRef: our code sets it
  // true before calling fitBounds/setView; the handler clears it each time it fires.
  // Any zoomstart that arrives without skipZoomRef being true is user-initiated.
  useEffect(() => {
    const onDragStart = () => { userMovedRef.current = true; };
    const onZoomStart = () => {
      if (!skipZoomRef.current) userMovedRef.current = true;
      skipZoomRef.current = false;
    };
    map.on('dragstart', onDragStart);
    map.on('zoomstart', onZoomStart);
    return () => {
      map.off('dragstart', onDragStart);
      map.off('zoomstart', onZoomStart);
    };
  }, [map]);

  // ── Venue point markers ──────────────────────────────────────────────────────
  useEffect(() => {
    const activeIds = new Set(venuePoints.map(v => v.id));

    // Remove stale venue markers
    for (const id of Object.keys(venueMarkersRef.current)) {
      if (!activeIds.has(id)) {
        venueMarkersRef.current[id].remove();
        delete venueMarkersRef.current[id];
        // PERF-06: Clear cached icon for removed venue.
        delete iconCacheRef.current[`venue:${id}`];
      }
    }

    // Add / update venue markers
    venuePoints.forEach((vp, i) => {
      const pos: L.LatLngExpression = [vp.lat, vp.lng];
      const color = VENUE_COLORS[i % VENUE_COLORS.length];
      // PERF-06: Cache venue icon by id:label:color key.
      const venueIconKey = `venue:${vp.id}:${vp.label}:${color}`;
      if (!iconCacheRef.current[venueIconKey]) {
        iconCacheRef.current[venueIconKey] = makeVenueIcon(vp.label, color);
      }
      const venueIcon = iconCacheRef.current[venueIconKey];
      if (!venueMarkersRef.current[vp.id]) {
        venueMarkersRef.current[vp.id] = L.marker(pos, {
          icon: venueIcon,
          zIndexOffset: 500,
        }).addTo(map);
      } else {
        venueMarkersRef.current[vp.id].setLatLng(pos);
        venueMarkersRef.current[vp.id].setIcon(venueIcon);
        // Re-add if detached (e.g. React StrictMode double-invoke removes it via cleanup)
        venueMarkersRef.current[vp.id].addTo(map);
      }
    });
  }, [venuePoints, map]);

  // ── Participant markers + auto-centroid + auto-fit ───────────────────────────
  useEffect(() => {
    const activeIds = new Set(participants.map(p => p.id));

    for (const id of Object.keys(markersRef.current)) {
      if (!activeIds.has(id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
        circlesRef.current[id]?.remove();
        delete circlesRef.current[id];
        // PERF-06: Clear cached icon for removed participant.
        for (const key of Object.keys(iconCacheRef.current)) {
          if (key.startsWith(`p:${id}:`)) delete iconCacheRef.current[key];
        }
      }
    }

    const latlngs: L.LatLngExpression[] = [];
    const located = participants.filter(p => p.lat !== null && p.lng !== null);

    for (const p of participants) {
      // L-9: strict null check (avoids suppressing lat/lng === 0 on equator)
      if (p.lat === null || p.lng === null) continue;

      const pos: L.LatLngExpression = [p.lat, p.lng];
      latlngs.push(pos);
      const isMe = p.id === myId;

      // PERF-06: Cache participant icons by id:color:name:isMe key.
      const iconKey = `p:${p.id}:${p.color}:${p.name}:${isMe}`;
      if (!iconCacheRef.current[iconKey]) {
        iconCacheRef.current[iconKey] = makeIcon(p.color, p.name, isMe);
      }
      const icon = iconCacheRef.current[iconKey];

      if (!markersRef.current[p.id]) {
        markersRef.current[p.id] = L.marker(pos, {
          icon,
          zIndexOffset: isMe ? 1000 : 0,
        }).addTo(map);
      } else {
        markersRef.current[p.id].setLatLng(pos);
        markersRef.current[p.id].setIcon(icon);
        markersRef.current[p.id].addTo(map);
      }

      if (p.accuracy && p.accuracy > 15) {
        if (!circlesRef.current[p.id]) {
          circlesRef.current[p.id] = L.circle(pos, {
            radius: p.accuracy,
            color: p.color, fillColor: p.color,
            fillOpacity: 0.08, weight: 1, opacity: 0.4,
          }).addTo(map);
        } else {
          circlesRef.current[p.id].setLatLng(pos).setRadius(p.accuracy);
        }
      } else {
        circlesRef.current[p.id]?.remove();
        delete circlesRef.current[p.id];
      }
    }

    // Auto-centroid "Meet here" — only when no venue points set and 2+ people located
    if (venuePoints.length === 0 && located.length >= 2) {
      // COR-09: Use non-null assertion — located is already filtered to p.lat !== null.
      const avgLat = located.reduce((s, p) => s + p.lat!, 0) / located.length;
      const avgLng = located.reduce((s, p) => s + p.lng!, 0) / located.length;
      const midPos: L.LatLngExpression = [avgLat, avgLng];
      if (!midpointRef.current) {
        midpointRef.current = L.marker(midPos, {
          icon: makeMidpointIcon(),
          zIndexOffset: -100,
        }).addTo(map);
      } else {
        midpointRef.current.setLatLng(midPos);
        midpointRef.current.addTo(map);
      }
    } else {
      midpointRef.current?.remove();
      midpointRef.current = null;
    }

    // Auto-fit: include both participant positions and venue points
    const allLatlngs: L.LatLngExpression[] = [
      ...latlngs,
      ...venuePoints.map(vp => [vp.lat, vp.lng] as L.LatLngExpression),
    ];

    if (!userMovedRef.current) {
      if (allLatlngs.length === 1) {
        skipZoomRef.current = true;
        map.setView(allLatlngs[0] as L.LatLngExpression, Math.max(map.getZoom(), 15), { animate: true });
      } else if (allLatlngs.length > 1) {
        skipZoomRef.current = true;
        map.fitBounds(L.latLngBounds(allLatlngs as L.LatLngExpression[]), {
          padding: [64, 64],
          maxZoom: 17,
          animate: true,
        });
      }
    }
  }, [participants, myId, venuePoints, map]);

  // Cleanup all markers on unmount
  useEffect(() => {
    return () => {
      Object.values(markersRef.current).forEach(m => m.remove());
      Object.values(circlesRef.current).forEach(c => c.remove());
      Object.values(venueMarkersRef.current).forEach(m => m.remove());
      midpointRef.current?.remove();
    };
  }, []);

  return null;
}

function ZoomControls() {
  const map = useMap();
  return (
    <div className="absolute right-4 top-4 flex flex-col gap-1 z-[1000]">
      {/* A11Y-01: Explicit aria-labels for screen reader users */}
      <button
        onClick={() => map.zoomIn()}
        aria-label="Zoom in"
        className="w-9 h-9 bg-[#1e293b]/90 backdrop-blur-sm text-white rounded-xl shadow-lg flex items-center justify-center text-lg font-bold hover:bg-[#334155] transition-colors"
      >
        +
      </button>
      <button
        onClick={() => map.zoomOut()}
        aria-label="Zoom out"
        className="w-9 h-9 bg-[#1e293b]/90 backdrop-blur-sm text-white rounded-xl shadow-lg flex items-center justify-center text-lg font-bold hover:bg-[#334155] transition-colors"
      >
        −
      </button>
    </div>
  );
}

interface Props {
  participants: Participant[];
  myId: string;
  venuePoints: VenuePoint[];
}

export default function MeetMap({ participants, myId, venuePoints }: Props) {
  return (
    // A11Y-02: aria-hidden so screen readers skip the map and use ParticipantList instead.
    <div aria-hidden="true" style={{ height: '100%', width: '100%' }}>
      <p className="sr-only">Map view — participant list below provides accessible location information.</p>
    <MapContainer
      center={[20, 0]}
      zoom={3}
      style={{ height: '100%', width: '100%' }}
      zoomControl={false}
      attributionControl={true}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        maxZoom={19}
      />
      <Markers participants={participants} myId={myId} venuePoints={venuePoints} />
      <ZoomControls />
    </MapContainer>
    </div>
  );
}
