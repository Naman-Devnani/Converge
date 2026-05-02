import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Participant } from '../types';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function makeIcon(color: string, name: string, isMe: boolean) {
  const size = isMe ? 22 : 18;
  const half = size / 2;
  return L.divIcon({
    html: `
      <div style="position:relative;width:${size}px;height:${size}px;">
        ${isMe ? `<div style="
          position:absolute;inset:0;border-radius:50%;
          background:${color};opacity:0.35;
          animation:pulse-ring 2s ease-out infinite;
        "></div>` : ''}
        <div class="ms-marker ${isMe ? 'ms-marker-me' : ''}" style="
          width:${size}px;height:${size}px;
          background:${color};
        "></div>
        <div class="ms-label">${name}${isMe ? ' ✦' : ''}</div>
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

interface MarkersProps {
  participants: Participant[];
  myId: string;
}

function Markers({ participants, myId }: MarkersProps) {
  const map = useMap();
  const markersRef    = useRef<Record<string, L.Marker>>({});
  const circlesRef    = useRef<Record<string, L.Circle>>({});
  const midpointRef   = useRef<L.Marker | null>(null);

  useEffect(() => {
    const activeIds = new Set(participants.map(p => p.id));

    for (const id of Object.keys(markersRef.current)) {
      if (!activeIds.has(id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
        circlesRef.current[id]?.remove();
        delete circlesRef.current[id];
      }
    }

    const latlngs: L.LatLngExpression[] = [];
    const located = participants.filter(p => p.lat !== null && p.lng !== null);

    for (const p of participants) {
      if (p.lat === null || p.lng === null) continue;

      const pos: L.LatLngExpression = [p.lat, p.lng];
      latlngs.push(pos);
      const isMe = p.id === myId;

      if (!markersRef.current[p.id]) {
        markersRef.current[p.id] = L.marker(pos, {
          icon: makeIcon(p.color, p.name, isMe),
          zIndexOffset: isMe ? 1000 : 0,
        }).addTo(map);
      } else {
        markersRef.current[p.id].setLatLng(pos);
        markersRef.current[p.id].setIcon(makeIcon(p.color, p.name, isMe));
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
      }
    }

    // Midpoint "Meet here" marker — only when 2+ people are located
    if (located.length >= 2) {
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
      }
    } else {
      midpointRef.current?.remove();
      midpointRef.current = null;
    }

    if (latlngs.length === 1) {
      map.setView(latlngs[0] as L.LatLngExpression, Math.max(map.getZoom(), 15), { animate: true });
    } else if (latlngs.length > 1) {
      map.fitBounds(L.latLngBounds(latlngs as L.LatLngExpression[]), {
        padding: [64, 64],
        maxZoom: 17,
        animate: true,
      });
    }
  }, [participants, myId, map]);

  useEffect(() => {
    return () => {
      Object.values(markersRef.current).forEach(m => m.remove());
      Object.values(circlesRef.current).forEach(c => c.remove());
      midpointRef.current?.remove();
    };
  }, []);

  return null;
}

function ZoomControls() {
  const map = useMap();
  return (
    <div className="absolute right-4 top-4 flex flex-col gap-1 z-[1000]">
      <button
        onClick={() => map.zoomIn()}
        className="w-9 h-9 bg-[#1e293b]/90 backdrop-blur-sm text-white rounded-xl shadow-lg flex items-center justify-center text-lg font-bold hover:bg-[#334155] transition-colors"
      >
        +
      </button>
      <button
        onClick={() => map.zoomOut()}
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
}

export default function MeetMap({ participants, myId }: Props) {
  return (
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
      <Markers participants={participants} myId={myId} />
      <ZoomControls />
    </MapContainer>
  );
}
