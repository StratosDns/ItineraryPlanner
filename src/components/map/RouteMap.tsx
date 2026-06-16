'use client'

import { useEffect, useRef, useState } from 'react'
import { Stop } from '@/types/database'

interface Props {
  stops: Stop[]
  selectedStopId?: string | null
  onMapClick?: (lat: number, lng: number) => void
  onMarkerClick?: (stop: Stop) => void
  /** Called whenever a driving route is resolved: array of N-1 distances in km */
  onRouteUpdate?: (distances: number[]) => void
}

let L: typeof import('leaflet') | null = null

export default function RouteMap({ stops, selectedStopId, onMapClick, onMarkerClick, onRouteUpdate }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<import('leaflet').Map | null>(null)
  const markersRef = useRef<import('leaflet').Marker[]>([])
  const routeLayerRef = useRef<import('leaflet').Polyline | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [mapReady, setMapReady] = useState(false)

  // Keep callback refs stable so effects do not re-run when they change
  const onMarkerClickRef = useRef(onMarkerClick)
  const onRouteUpdateRef = useRef(onRouteUpdate)
  useEffect(() => { onMarkerClickRef.current = onMarkerClick }, [onMarkerClick])
  useEffect(() => { onRouteUpdateRef.current = onRouteUpdate }, [onRouteUpdate])

  // Init map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return

    async function init() {
      L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const map = L.map(mapRef.current!, { center: [48.8566, 2.3522], zoom: 5 })

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      if (onMapClick) {
        map.on('click', (e) => onMapClick(e.latlng.lat, e.latlng.lng))
      }

      mapInstanceRef.current = map
      setMapReady(true)
    }

    init()

    return () => {
      abortRef.current?.abort()
      mapInstanceRef.current?.remove()
      mapInstanceRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update markers + driving route when stops or selection changes
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !L) return

    const map = mapInstanceRef.current
    const Lx = L

    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
    routeLayerRef.current?.remove()
    routeLayerRef.current = null
    abortRef.current?.abort()

    const validStops = stops.filter(s => s.lat != null && s.lng != null)
    if (validStops.length === 0) return

    // Numbered markers
    validStops.forEach((stop, i) => {
      const isSelected = stop.id === selectedStopId
      const icon = Lx.divIcon({
        className: '',
        html: `<div style="
          width:28px;height:28px;border-radius:50%;
          background:${isSelected ? '#2563eb' : '#1e40af'};
          border:2px solid ${isSelected ? '#93c5fd' : 'white'};
          color:white;font-size:11px;font-weight:600;
          display:flex;align-items:center;justify-content:center;
          box-shadow:0 2px 6px rgba(0,0,0,0.3);
          ${isSelected ? 'transform:scale(1.2);' : ''}
        ">${i + 1}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      })

      const marker = Lx.marker([stop.lat!, stop.lng!], { icon })
        .addTo(map)
        .bindTooltip(stop.name, { direction: 'top', offset: [0, -10] })

      marker.on('click', () => onMarkerClickRef.current?.(stop))
      markersRef.current.push(marker)
    })

    map.fitBounds(
      Lx.latLngBounds(validStops.map(s => [s.lat!, s.lng!])),
      { padding: [40, 40], maxZoom: 14 }
    )

    if (validStops.length < 2) return

    const controller = new AbortController()
    abortRef.current = controller

    const coords = validStops.map(s => `${s.lng!.toFixed(6)},${s.lat!.toFixed(6)}`).join(';')

    function drawFallback() {
      if (!mapInstanceRef.current) return
      routeLayerRef.current = Lx.polyline(
        validStops.map(s => [s.lat!, s.lng!] as [number, number]),
        { color: '#3b82f6', weight: 3, opacity: 0.7, dashArray: '6,6' }
      ).addTo(mapInstanceRef.current)
    }

    fetch(
      `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`,
      { signal: controller.signal }
    )
      .then(r => r.json())
      .then(json => {
        if (controller.signal.aborted || !mapInstanceRef.current) return
        if (json.code !== 'Ok' || !json.routes?.[0]) { drawFallback(); return }

        const route = json.routes[0]
        const distances: number[] = route.legs.map(
          (l: { distance: number }) => Math.round(l.distance / 100) / 10
        )
        onRouteUpdateRef.current?.(distances)

        const latlngs: [number, number][] = route.geometry.coordinates.map(
          ([lng, lat]: [number, number]) => [lat, lng]
        )
        routeLayerRef.current = Lx.polyline(latlngs, {
          color: '#3b82f6',
          weight: 4,
          opacity: 0.85,
        }).addTo(mapInstanceRef.current)
      })
      .catch(err => {
        if (err.name === 'AbortError' || !mapInstanceRef.current) return
        drawFallback()
      })

  }, [stops, selectedStopId, mapReady])

  return <div ref={mapRef} className="w-full h-full rounded-xl overflow-hidden" />
}
