'use client'

import { useEffect, useRef, useState } from 'react'
import { Stop } from '@/types/database'

interface Props {
  stops: Stop[]
  selectedStopId?: string | null
  onMapClick?: (lat: number, lng: number) => void
  onMarkerClick?: (stop: Stop) => void
  /** Emits N-1 driving distances in km whenever a route is resolved */
  onRouteUpdate?: (distances: number[]) => void
  /** Emits the 0-based leg index when a route segment is clicked */
  onSegmentClick?: (index: number) => void
}

let L: typeof import('leaflet') | null = null

export default function RouteMap({
  stops, selectedStopId, onMapClick, onMarkerClick, onRouteUpdate, onSegmentClick
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<import('leaflet').Map | null>(null)
  const markersRef = useRef<import('leaflet').Marker[]>([])
  const legPolyRef = useRef<import('leaflet').Polyline[]>([])
  const labelRef = useRef<import('leaflet').Marker[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const [mapReady, setMapReady] = useState(false)

  // Stable callback refs — prevent effects from re-running on every render
  const onMarkerClickRef = useRef(onMarkerClick)
  const onRouteUpdateRef = useRef(onRouteUpdate)
  const onSegmentClickRef = useRef(onSegmentClick)
  useEffect(() => { onMarkerClickRef.current = onMarkerClick }, [onMarkerClick])
  useEffect(() => { onRouteUpdateRef.current = onRouteUpdate }, [onRouteUpdate])
  useEffect(() => { onSegmentClickRef.current = onSegmentClick }, [onSegmentClick])

  // ── Init ──────────────────────────────────────────────────────────────────
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
      if (onMapClick) map.on('click', (e) => onMapClick(e.latlng.lat, e.latlng.lng))
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

  // ── Markers (re-runs on stop list or selection change) ────────────────────
  // Track last stop positions so we only fitBounds when the list actually changes
  const stopsSigRef = useRef('')

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !L) return
    const map = mapInstanceRef.current
    const Lx = L

    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    const valid = stops.filter(s => s.lat != null && s.lng != null)
    if (valid.length === 0) return

    valid.forEach((stop, i) => {
      const sel = stop.id === selectedStopId
      const icon = Lx.divIcon({
        className: '',
        html: `<div style="
          width:28px;height:28px;border-radius:50%;
          background:${sel ? '#2563eb' : '#1e40af'};
          border:2px solid ${sel ? '#93c5fd' : 'white'};
          color:white;font-size:11px;font-weight:600;
          display:flex;align-items:center;justify-content:center;
          box-shadow:0 2px 6px rgba(0,0,0,0.3);
          ${sel ? 'transform:scale(1.2);' : ''}
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

    const newSig = valid.map(s => `${s.id}:${s.lat}:${s.lng}`).join('|')
    if (newSig !== stopsSigRef.current) {
      stopsSigRef.current = newSig
      map.fitBounds(Lx.latLngBounds(valid.map(s => [s.lat!, s.lng!])), { padding: [40, 40], maxZoom: 14 })
    }
  }, [stops, selectedStopId, mapReady])

  // ── Driving routes (re-runs only when stop list changes) ──────────────────
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !L) return
    const Lx = L

    legPolyRef.current.forEach(p => p.remove())
    legPolyRef.current = []
    labelRef.current.forEach(m => m.remove())
    labelRef.current = []
    abortRef.current?.abort()

    const valid = stops.filter(s => s.lat != null && s.lng != null)
    if (valid.length < 2) return

    const controller = new AbortController()
    abortRef.current = controller
    const coords = valid.map(s => `${s.lng!.toFixed(6)},${s.lat!.toFixed(6)}`).join(';')

    fetch(
      `https://router.project-osrm.org/route/v1/driving/${coords}?overview=false&geometries=geojson&steps=true`,
      { signal: controller.signal }
    )
      .then(r => r.json())
      .then(json => {
        if (controller.signal.aborted || !mapInstanceRef.current) return
        if (json.code !== 'Ok' || !json.routes?.[0]) { drawFallback(Lx, valid); return }

        const route = json.routes[0]
        const distances: number[] = []

        type Step = { geometry: { coordinates: [number, number][] } }
        type Leg  = { distance: number; steps: Step[] }

        ;(route.legs as Leg[]).forEach((leg, i) => {
          if (!mapInstanceRef.current) return
          const distKm = Math.round(leg.distance / 100) / 10
          distances.push(distKm)

          // Build road-following geometry for this leg
          const latlngs: [number, number][] = []
          for (const step of leg.steps) {
            for (const [lng, lat] of step.geometry.coordinates) {
              const prev = latlngs[latlngs.length - 1]
              if (!prev || prev[0] !== lat || prev[1] !== lng) latlngs.push([lat, lng])
            }
          }

          // Clickable polyline per leg
          const poly = Lx.polyline(latlngs, { color: '#3b82f6', weight: 5, opacity: 0.8 })
          poly.on('click', (e) => {
            Lx.DomEvent.stopPropagation(e)
            legPolyRef.current.forEach(p => p.setStyle({ color: '#3b82f6', weight: 5, opacity: 0.8 }))
            poly.setStyle({ color: '#1d4ed8', weight: 6, opacity: 1 })
            onSegmentClickRef.current?.(i)
          })
          poly.addTo(mapInstanceRef.current)
          legPolyRef.current.push(poly)

          // Distance label at midpoint of leg geometry
          if (latlngs.length > 0) {
            const mid = latlngs[Math.floor(latlngs.length / 2)]
            const labelIcon = Lx.divIcon({
              className: '',
              html: `<div style="background:white;border:1px solid #cbd5e1;border-radius:4px;padding:1px 6px;font-size:11px;color:#1e40af;font-weight:600;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.15);pointer-events:none">${distKm} km</div>`,
              iconSize: [64, 20],
              iconAnchor: [32, 10],
            })
            const lbl = Lx.marker(mid, { icon: labelIcon, interactive: false }).addTo(mapInstanceRef.current)
            labelRef.current.push(lbl)
          }
        })

        onRouteUpdateRef.current?.(distances)
      })
      .catch(err => {
        if (err.name === 'AbortError' || !mapInstanceRef.current) return
        drawFallback(Lx, valid)
      })

    function drawFallback(Lx: typeof import('leaflet'), vs: Stop[]) {
      if (!mapInstanceRef.current) return
      const poly = Lx.polyline(
        vs.map(s => [s.lat!, s.lng!] as [number, number]),
        { color: '#3b82f6', weight: 3, opacity: 0.7, dashArray: '6,6' }
      ).addTo(mapInstanceRef.current)
      legPolyRef.current.push(poly)
    }
  }, [stops, mapReady])

  return <div ref={mapRef} className="w-full h-full rounded-xl overflow-hidden" />
}
