// N-2: Single shared Leaflet default-icon fix — imported once instead of
// duplicated in every component that uses a MapContainer.
// REL-06: TODO — these marker images are loaded from the unpkg CDN at runtime, creating
// an external dependency. The proper fix is to copy the three PNG files from
// node_modules/leaflet/dist/images/ into the public/ folder and reference them as
// '/leaflet/marker-icon-2x.png', '/leaflet/marker-icon.png', '/leaflet/marker-shadow.png'.
// This cannot be done via text-editing alone (binary files) — add a postinstall script
// or vite plugin to copy them at build time. For now we rely on the CDN; if it fails,
// Leaflet falls back to showing no default icon (custom divIcons still render correctly).
import L from 'leaflet';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});
