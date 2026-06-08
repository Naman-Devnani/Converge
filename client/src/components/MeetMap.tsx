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
          background:${safeColor};color:${safeColor};
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
      <div style="position:relative;width:40px;height:40px;display:flex;flex-direction:column;align-items:center;">
        <div style="
          width:40px;height:40px;border-radius:9999px;
          background:rgba(0,165,114,0.20);border:1px solid rgba(78,222,163,0.4);
          display:flex;align-items:center;justify-content:center;
          color:#4edea3;filter:drop-shadow(0 0 8px #4edea3);
        ">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#4edea3"><path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>
        </div>
        <div class="ms-label" style="background:rgba(23,31,51,0.9);color:#dae2fd;font-weight:700;border:1px solid rgba(255,255,255,0.1);">Meet here</div>
      </div>
    `,
    className: '',
    iconSize:   [40, 40],
    iconAnchor: [20, 20],
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
      // Average longitude via a unit-vector mean so the centroid is correct even when
      // participants straddle the ±180° antimeridian (a plain arithmetic mean flips it).
      let sx = 0, sy = 0;
      for (const p of located) {
        const r = (p.lng! * Math.PI) / 180;
        sx += Math.cos(r); sy += Math.sin(r);
      }
      const avgLng = (Math.atan2(sy, sx) * 180) / Math.PI;
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

  // Cleanup all markers on unmount. Capture the ref objects (not their .current snapshots)
  // so the cleanup reads the live marker collections at unmount time.
  useEffect(() => {
    const markers = markersRef, circles = circlesRef, venues = venueMarkersRef, midpoint = midpointRef;
    return () => {
      Object.values(markers.current).forEach(m => m.remove());
      Object.values(circles.current).forEach(c => c.remove());
      Object.values(venues.current).forEach(m => m.remove());
      midpoint.current?.remove();
    };
  }, []);

  return null;
}

function ZoomControls({ participants, myId }: { participants: Participant[]; myId: string }) {
  const map = useMap();

  // Recenter on my location; if I'm not located yet, fit everyone who is.
  const recenter = () => {
    const me = participants.find(p => p.id === myId);
    if (me && me.lat !== null && me.lng !== null) {
      map.setView([me.lat, me.lng], Math.max(map.getZoom(), 15), { animate: true });
      return;
    }
    const located = participants.filter(p => p.lat !== null && p.lng !== null);
    if (located.length > 0) {
      map.fitBounds(
        L.latLngBounds(located.map(p => [p.lat!, p.lng!] as L.LatLngExpression)),
        { padding: [64, 64], maxZoom: 17, animate: true },
      );
    }
  };

  return (
    <div className="absolute right-container-margin top-1/2 -translate-y-1/2 z-[1000] flex flex-col gap-md">
      {/* A11Y-01: Explicit aria-labels for screen reader users */}
      <div className="flex flex-col bg-surface-container/90 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden shadow-xl">
        <button onClick={() => map.zoomIn()} aria-label="Zoom in" className="p-2.5 hover:bg-white/5 text-on-surface-variant hover:text-on-surface transition-colors border-b border-white/10">
          <span className="material-symbols-outlined">add</span>
        </button>
        <button onClick={() => map.zoomOut()} aria-label="Zoom out" className="p-2.5 hover:bg-white/5 text-on-surface-variant hover:text-on-surface transition-colors">
          <span className="material-symbols-outlined">remove</span>
        </button>
      </div>
      <button onClick={recenter} aria-label="Recenter on my location" title="Recenter on me" className="p-2.5 bg-surface-container-high/90 backdrop-blur-md border border-white/10 rounded-full text-primary hover:bg-white/10 transition-colors shadow-lg active:scale-90 flex items-center justify-center">
        <span className="material-symbols-outlined">my_location</span>
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
      <ZoomControls participants={participants} myId={myId} />
    </MapContainer>
    </div>
  );
}
