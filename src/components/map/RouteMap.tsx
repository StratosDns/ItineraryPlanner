'use client'

import { useEffect, useRef } from 'react'
import { Stop } from '@/types/database'

// Dynamically import Leaflet to avoid SSR issues
interface Props {
  stops: Stop[]
  selectedStopId?: string | null
  onMapClick?: (lat: number, lng: number) => void
  onMarkerClick?: (stop: Stop) => void
}

let L: typeof import('leaflet') | null = null

export default function RouteMap({ stops, selectedStopId, onMapClick, onMarkerClick }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<import('leaflet').Map | null>(null)
  const markersRef = useRef<import('leaflet').Marker[]>([])
  const routeLayerRef = useRef<import('leaflet').Polyline | null>(null)

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return

    async function init() {
      L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')

      // Fix Leaflet default icon paths in Next.js
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const map = L.map(mapRef.current!, {
        center: [48.8566, 2.3522],
        zoom: 5,
        zoomControl: true,
      })

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      if (onMapClick) {
        map.on('click', (e) => onMapClick(e.latlng.lat, e.latlng.lng))
      }

      mapInstanceRef.current = map
      updateMarkers()
    }

    init()

    return () => {
      mapInstanceRef.current?.remove()
      mapInstanceRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update markers + route when stops change
  function updateMarkers() {
    if (!mapInstanceRef.current || !L) return
    const map = mapInstanceRef.current

    // Clear existing markers
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
    routeLayerRef.current?.remove()

    const validStops = stops.filter(s => s.lat != null && s.lng != null)
    if (validStops.length === 0) return

    // Add numbered markers
    validStops.forEach((stop, i) => {
      const isSelected = stop.id === selectedStopId
      const icon = L!.divIcon({
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

      const marker = L!.marker([stop.lat!, stop.lng!], { icon })
        .addTo(map)
        .bindTooltip(stop.name, { direction: 'top', offset: [0, -10] })

      if (onMarkerClick) {
        marker.on('click', () => onMarkerClick(stop))
      }

      markersRef.current.push(marker)
    })

    // Straight-line route (OSRM route is fetched separately and drawn via prop)
    if (validStops.length >= 2) {
      const latlngs = validStops.map(s => [s.lat!, s.lng!] as [number, number])
      routeLayerRef.current = L.polyline(latlngs, {
        color: '#3b82f6',
        weight: 3,
        opacity: 0.7,
        dashArray: '6,6',
      }).addTo(map)
    }

    // Fit bounds
    const bounds = L.latLngBounds(validStops.map(s => [s.lat!, s.lng!]))
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 })
  }

  useEffect(() => {
    updateMarkers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, selectedStopId])

  return (
    <div ref={mapRef} className="w-full h-full rounded-xl overflow-hidden" />
  )
}
