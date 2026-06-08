// N-2: Single shared Leaflet default-icon fix — imported once instead of
// duplicated in every component that uses a MapContainer.
// REL-06: Marker images are now vendored under client/public/leaflet/ (copied from
// node_modules/leaflet/dist/images/) and served same-origin, removing the previous
// runtime dependency on the unpkg CDN.
import L from 'leaflet';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  iconUrl:       '/leaflet/marker-icon.png',
  shadowUrl:     '/leaflet/marker-shadow.png',
});
