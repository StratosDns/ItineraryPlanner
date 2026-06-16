// Geocoding via Nominatim (OpenStreetMap) — free, no key required
// Rate limit: 1 req/sec per Nominatim usage policy

export interface GeoResult {
  lat: number
  lng: number
  display_name: string
}

export async function geocode(query: string): Promise<GeoResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=0`
  const res = await fetch(url, {
    headers: { 'Accept-Language': 'en', 'User-Agent': 'RouteForge/1.0' },
  })
  if (!res.ok) throw new Error('Geocoding request failed')
  const data = await res.json()
  return data.map((r: { lat: string; lon: string; display_name: string }) => ({
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    display_name: r.display_name,
  }))
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
  const res = await fetch(url, {
    headers: { 'Accept-Language': 'en', 'User-Agent': 'RouteForge/1.0' },
  })
  if (!res.ok) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
  const data = await res.json()
  return data.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

// Routing via OSRM public demo server
// For production use, self-host or use a paid routing API
export interface RouteResult {
  coordinates: [number, number][]  // [lng, lat] pairs
  distance_m: number
  duration_s: number
}

export async function getRoute(waypoints: { lat: number; lng: number }[]): Promise<RouteResult | null> {
  if (waypoints.length < 2) return null
  const coords = waypoints.map(w => `${w.lng},${w.lat}`).join(';')
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    if (data.code !== 'Ok' || !data.routes?.[0]) return null
    const route = data.routes[0]
    return {
      coordinates: route.geometry.coordinates,
      distance_m: route.distance,
      duration_s: route.duration,
    }
  } catch {
    return null
  }
}
