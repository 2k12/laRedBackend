// Polygon vertices for "Universidad Técnica del Norte (El Olivo)"
// Exact bounds provided by user via GeoJSON
export const CAMPUS_POLYGON = [
  { lat: 0.3596589224792268, lng: -78.110396399995 },
  { lat: 0.35970778712767526, lng: -78.11210669643556 },
  { lat: 0.35938459069082285, lng: -78.11228921139553 },
  { lat: 0.35925715502420985, lng: -78.11239603457064 },
  { lat: 0.3591718855696655, lng: -78.11249723547277 },
  { lat: 0.3591203490855861, lng: -78.11259656228391 },
  { lat: 0.3590206931044122, lng: -78.11278420158433 },
  { lat: 0.358977512130366, lng: -78.11298872877477 },
  { lat: 0.3589164237234712, lng: -78.11322113523379 },
  { lat: 0.358846478771639, lng: -78.11332360716135 },
  { lat: 0.3586629823627021, lng: -78.11340559595429 },
  { lat: 0.35843608732332655, lng: -78.11313633041516 },
  { lat: 0.35810697027017113, lng: -78.11302527966438 },
  { lat: 0.35789642470074057, lng: -78.11272737159624 },
  { lat: 0.35780052365025483, lng: -78.1126363724722 },
  { lat: 0.3576747845750532, lng: -78.11265977532733 },
  { lat: 0.35741709777252595, lng: -78.11254421908917 },
  { lat: 0.3571995034976254, lng: -78.11240472032863 },
  { lat: 0.35712628514166056, lng: -78.11214563137537 },
  { lat: 0.35696388085732167, lng: -78.11211319275203 },
  { lat: 0.3569026128159152, lng: -78.11206795537552 },
  { lat: 0.3568520618160278, lng: -78.11204910279834 },
  { lat: 0.35683033879350035, lng: -78.11201723776088 },
  { lat: 0.3565911988060151, lng: -78.11202839421915 },
  { lat: 0.3565627416672186, lng: -78.11191745381669 },
  { lat: 0.3560898691485761, lng: -78.11146040565747 },
  { lat: 0.356272104445452, lng: -78.11104166355295 },
  { lat: 0.35624471773137145, lng: -78.11055788271857 },
  { lat: 0.3562658273289685, lng: -78.11053114497554 },
  { lat: 0.3596589224792268, lng: -78.110396399995 },
];

// Ray Casting Algorithm to check if a point is inside a polygon
// Based on: https://github.com/substack/point-in-polygon
export const isPointInPolygon = (
  lat: number,
  lng: number,
  polygon: { lat: number; lng: number }[],
) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat,
      yi = polygon[i].lng;
    const xj = polygon[j].lat,
      yj = polygon[j].lng;

    const intersect =
      yi > lng !== yj > lng && lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};

export const isWithinCampus = (lat: number, lng: number): boolean => {
  // Legacy radius check (optional backup)
  // return CAMPUS_ZONES.some(zone => getDistance(lat, lng, zone.lat, zone.lng) <= zone.radius);

  // Exact Polygon Check
  return isPointInPolygon(lat, lng, CAMPUS_POLYGON);
};
