'use client'

import { useEffect, useRef, useState } from 'react'
import { Stop, MapNote } from '@/types/database'

const NOTE_COLORS: Record<string, { bg: string; border: string }> = {
  yellow: { bg: '#fef08a', border: '#ca8a04' },
  green:  { bg: '#bbf7d0', border: '#16a34a' },
  red:    { bg: '#fecaca', border: '#dc2626' },
  blue:   { bg: '#bfdbfe', border: '#2563eb' },
}

// Base note dimensions at zoom 13 (scale = 1.0)
const NOTE_W = 130
const NOTE_H = 52

// Leaflet's default zoom-animation duration — keep this in sync so notes
// animate at the same speed as the map tiles.
const LEAFLET_ZOOM_ANIM_DURATION = 0.25 // seconds

interface Props {
  stops: Stop[]
  selectedStopId?: string | null
  onMapClick?: (lat: number, lng: number) => void
  onMarkerClick?: (stop: Stop) => void
  onRouteUpdate?: (distances: number[]) => void
  onSegmentClick?: (index: number) => void
  mapNotes?: MapNote[]
  placingNote?: boolean
  onNoteCreate?: (lat: number, lng: number) => void
  onNoteClick?: (note: MapNote, clientX: number, clientY: number) => void
  canEditNotes?: boolean
  onNoteMove?: (id: string, lat: number, lng: number) => void
  onNoteScaleChange?: (id: string, scale: number) => void
}

let L: typeof import('leaflet') | null = null

/**
 * Build a divIcon at base 1× size (130 × 52 px).
 *
 * WHY the inner div approach:
 *   Leaflet sets `transform: translate3d(x, y, 0)` on the OUTER marker element
 *   for geographic positioning. We must NEVER touch that property — doing so
 *   snaps the marker to (0,0) on the pane. Instead we apply our scale transform
 *   to a child (data-note-inner), leaving the outer element entirely to Leaflet.
 *
 *   transform-origin: center bottom  →  the anchor point (bottom-center of the
 *   note, which Leaflet aligns to the lat/lng via iconAnchor) stays fixed as
 *   the note grows or shrinks. The note expands upward from its pin point.
 *
 *   transition: transform …  →  the CSS transition duration matches Leaflet's
 *   own zoom animation so notes scale in sync with the map tiles, making them
 *   feel physically glued to the map.
 */
function buildNoteIcon(
  Lx: typeof import('leaflet'),
  note: MapNote,
  canEdit: boolean,
) {
  const c = NOTE_COLORS[note.color] ?? NOTE_COLORS.yellow
  const escaped = note.content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')

  const resizeHandle = canEdit ? `
    <div data-resize-handle style="
      position:absolute;bottom:2px;right:2px;
      width:12px;height:12px;
      cursor:se-resize;
      border-right:2px solid ${c.border};
      border-bottom:2px solid ${c.border};
      opacity:0.5;
    "></div>` : ''

  return Lx.divIcon({
    className: '',
    html: `<div
      data-note-inner
      style="
        background:${c.bg};border:1.5px solid ${c.border};border-radius:3px;
        padding:6px 8px;
        width:${NOTE_W}px;min-height:${NOTE_H - 6}px;
        font-size:11px;line-height:1.45;
        box-shadow:2px 3px 8px rgba(0,0,0,0.22);
        word-break:break-word;cursor:pointer;
        font-family:system-ui,-apple-system,sans-serif;color:#111;
        position:relative;overflow:hidden;
        transform-origin:center bottom;
        transition:transform ${LEAFLET_ZOOM_ANIM_DURATION}s cubic-bezier(0,0,0.25,1);
        will-change:transform;
      "
    >${escaped || '<span style="color:#999;font-style:italic">Empty note</span>'}
      <div style="
        position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);
        width:0;height:0;
        border-left:6px solid transparent;border-right:6px solid transparent;
        border-top:6px solid ${c.border};
      "></div>
      ${resizeHandle}
    </div>`,
    iconSize:   [NOTE_W, NOTE_H],
    iconAnchor: [NOTE_W / 2, NOTE_H],
  })
}

/**
 * Scale factor for a given map zoom level, anchored at zoom 13 = 1.0.
 * Each zoom level doubles or halves the scale, matching Leaflet tile scaling.
 * Clamped so notes never vanish or overflow at extreme zoom levels.
 */
function noteZoomScale(zoom: number) {
  return Math.min(6, Math.max(0.15, Math.pow(2, zoom - 13)))
}

/**
 * Apply zoom × user-scale to the inner content div of a marker.
 * Silently no-ops if the element or inner div is not in the DOM.
 */
function setInnerScale(markerEl: HTMLElement, zoomFactor: number, userScale: number) {
  const inner = markerEl.querySelector('[data-note-inner]') as HTMLElement | null
  if (inner) inner.style.transform = `scale(${zoomFactor * userScale})`
}

export default function RouteMap({
  stops, selectedStopId, onMapClick, onMarkerClick, onRouteUpdate, onSegmentClick,
  mapNotes, placingNote, onNoteCreate, onNoteClick, canEditNotes, onNoteMove,
  onNoteScaleChange,
}: Props) {
  const mapRef             = useRef<HTMLDivElement>(null)
  const mapInstanceRef     = useRef<import('leaflet').Map | null>(null)
  const markersRef         = useRef<import('leaflet').Marker[]>([])
  const legPolyRef         = useRef<import('leaflet').Polyline[]>([])
  const labelRef           = useRef<import('leaflet').Marker[]>([])
  const noteMarkersRef     = useRef<Map<string, import('leaflet').Marker>>(new Map())
  // Per-note user-chosen scale (from note.note_scale, updated live during drag)
  const noteUserScalesRef  = useRef<Map<string, number>>(new Map())
  // Stable ref to notes array — read inside Leaflet event closures without stale captures
  const mapNotesRef        = useRef<MapNote[]>([])
  const abortRef           = useRef<AbortController | null>(null)
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => { mapNotesRef.current = mapNotes ?? [] }, [mapNotes])

  // Stable callback refs
  const onMarkerClickRef     = useRef(onMarkerClick)
  const onRouteUpdateRef     = useRef(onRouteUpdate)
  const onSegmentClickRef    = useRef(onSegmentClick)
  const onNoteCreateRef      = useRef(onNoteCreate)
  const onNoteClickRef       = useRef(onNoteClick)
  const onNoteMoveRef        = useRef(onNoteMove)
  const onNoteScaleChangeRef = useRef(onNoteScaleChange)
  const placingNoteRef       = useRef(placingNote)
  const onMapClickRef        = useRef(onMapClick)
  useEffect(() => { onMarkerClickRef.current     = onMarkerClick    }, [onMarkerClick])
  useEffect(() => { onRouteUpdateRef.current     = onRouteUpdate    }, [onRouteUpdate])
  useEffect(() => { onSegmentClickRef.current    = onSegmentClick   }, [onSegmentClick])
  useEffect(() => { onNoteCreateRef.current      = onNoteCreate     }, [onNoteCreate])
  useEffect(() => { onNoteClickRef.current       = onNoteClick      }, [onNoteClick])
  useEffect(() => { onNoteMoveRef.current        = onNoteMove       }, [onNoteMove])
  useEffect(() => { onNoteScaleChangeRef.current = onNoteScaleChange }, [onNoteScaleChange])
  useEffect(() => { onMapClickRef.current        = onMapClick       }, [onMapClick])
  useEffect(() => { placingNoteRef.current       = placingNote      }, [placingNote])

  useEffect(() => {
    if (!mapRef.current) return
    mapRef.current.style.cursor = placingNote ? 'crosshair' : ''
  }, [placingNote])

  // ── Map init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return
    async function init() {
      L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })
      const map = L.map(mapRef.current!, { center: [48.8566, 2.3522], zoom: 5 })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      map.on('click', (e) => {
        if (placingNoteRef.current) {
          onNoteCreateRef.current?.(e.latlng.lat, e.latlng.lng)
        } else {
          onMapClickRef.current?.(e.latlng.lat, e.latlng.lng)
        }
      })

      // ── Zoom-relative note scaling ────────────────────────────────────────
      //
      // We hook 'zoomanim' (fires at the START of Leaflet's zoom animation,
      // before tiles begin animating) so we can update the note scale at the
      // same moment. The CSS transition on data-note-inner (same duration as
      // Leaflet's tile animation) then runs in parallel with the tiles, making
      // notes feel physically pinned to the map.
      //
      // 'zoomend' handles non-animated zoom changes (e.g. programmatic setZoom
      // with animate:false) as a fallback — for animated zoom the value is
      // already correct by the time 'zoomend' fires, so the second call is a no-op.
      //
      // We update the INNER div only. The outer marker element's transform is
      // exclusively managed by Leaflet (translate3d for geographic positioning).
      function applyZoomScales(zoom: number) {
        const zf = noteZoomScale(zoom)
        for (const note of mapNotesRef.current) {
          const marker = noteMarkersRef.current.get(note.id)
          if (!marker) continue
          const el = marker.getElement()
          if (!el) continue
          const us = noteUserScalesRef.current.get(note.id) ?? 1
          setInnerScale(el, zf, us)
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on('zoomanim', (e: any) => applyZoomScales(e.zoom))
      map.on('zoomend',  ()       => applyZoomScales(map.getZoom()))

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

  // ── Stop markers ──────────────────────────────────────────────────────────
  const stopsSigRef = useRef('')

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !L) return
    const map = mapInstanceRef.current
    const Lx  = L

    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    const valid = stops.filter(s => s.lat != null && s.lng != null)
    if (valid.length === 0) return

    valid.forEach((stop, i) => {
      const sel  = stop.id === selectedStopId
      const stay = stop.is_stay ?? false
      const bg     = (sel || stay) ? '#2563eb' : '#1e40af'
      const border = sel ? '#93c5fd' : stay ? '#f59e0b' : 'white'
      const scale  = sel ? 'scale(1.25)' : stay ? 'scale(1.1)' : 'none'
      const shadow = stay ? '0 2px 8px rgba(37,99,235,0.5)' : '0 2px 6px rgba(0,0,0,0.3)'
      const icon = Lx.divIcon({
        className: '',
        html: `<div style="
          width:28px;height:28px;border-radius:50%;
          background:${bg};border:2.5px solid ${border};
          color:white;font-size:11px;font-weight:600;
          display:flex;align-items:center;justify-content:center;
          box-shadow:${shadow};transform:${scale};
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

  // ── Driving routes ────────────────────────────────────────────────────────
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

          const latlngs: [number, number][] = []
          for (const step of leg.steps) {
            for (const [lng, lat] of step.geometry.coordinates) {
              const prev = latlngs[latlngs.length - 1]
              if (!prev || prev[0] !== lat || prev[1] !== lng) latlngs.push([lat, lng])
            }
          }

          const poly = Lx.polyline(latlngs, { color: '#3b82f6', weight: 5, opacity: 0.8 })
          poly.on('click', (e) => {
            Lx.DomEvent.stopPropagation(e)
            legPolyRef.current.forEach(p => p.setStyle({ color: '#3b82f6', weight: 5, opacity: 0.8 }))
            poly.setStyle({ color: '#1d4ed8', weight: 6, opacity: 1 })
            onSegmentClickRef.current?.(i)
          })
          poly.addTo(mapInstanceRef.current)
          legPolyRef.current.push(poly)

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

  // ── Map notes ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !L) return
    const Lx  = L
    const map = mapInstanceRef.current

    noteMarkersRef.current.forEach(m => m.remove())
    noteMarkersRef.current.clear()
    noteUserScalesRef.current.clear()

    const currentZoom = map.getZoom()
    const currentZf   = noteZoomScale(currentZoom)

    for (const note of (mapNotes ?? [])) {
      const userScale = note.note_scale ?? 1
      noteUserScalesRef.current.set(note.id, userScale)

      const icon   = buildNoteIcon(Lx, note, canEditNotes ?? false)
      const marker = Lx.marker([note.lat, note.lng], {
        icon,
        zIndexOffset: 500,
        draggable: canEditNotes ?? false,
      }).addTo(map)

      // Apply current zoom scale immediately — disable transition for the
      // initial set so the note doesn't animate in from scale(1).
      const outerEl = marker.getElement()
      if (outerEl) {
        const inner = outerEl.querySelector('[data-note-inner]') as HTMLElement | null
        if (inner) {
          inner.style.transition = 'none'
          inner.style.transform  = `scale(${currentZf * userScale})`
          // Re-enable transition after a frame so subsequent zoom events animate.
          requestAnimationFrame(() => {
            inner.style.transition = `transform ${LEAFLET_ZOOM_ANIM_DURATION}s cubic-bezier(0,0,0.25,1)`
          })
        }
      }

      marker.on('click', (e) => {
        Lx.DomEvent.stopPropagation(e)
        onNoteClickRef.current?.(note, e.originalEvent.clientX, e.originalEvent.clientY)
      })

      marker.on('dragend', () => {
        const { lat, lng } = marker.getLatLng()
        onNoteMoveRef.current?.(note.id, lat, lng)
      })

      // ── Resize handle ─────────────────────────────────────────────────────
      // During drag: update inner div scale live (accounting for current zoom).
      // On mouseup: persist the new userScale; the notes effect will rebuild
      //             markers with the updated note_scale from state.
      if (canEditNotes && outerEl) {
        const handle = outerEl.querySelector('[data-resize-handle]') as HTMLElement | null
        if (handle) {
          Lx.DomEvent.disableClickPropagation(handle)

          handle.addEventListener('mousedown', (e: MouseEvent) => {
            e.preventDefault()
            e.stopPropagation()

            const startX     = e.clientX
            const startScale = noteUserScalesRef.current.get(note.id) ?? 1
            const zf         = noteZoomScale(map.getZoom())
            // Current visual width at the drag start point (in screen px)
            const startVisualW = NOTE_W * zf * startScale

            const onMove = (ev: MouseEvent) => {
              const delta    = ev.clientX - startX
              // Compute new userScale from desired new visual width
              const newVisualW  = Math.max(40, startVisualW + delta)
              const newUserScale = newVisualW / (NOTE_W * zf)
              noteUserScalesRef.current.set(note.id, newUserScale)
              const inner = outerEl.querySelector('[data-note-inner]') as HTMLElement | null
              if (inner) {
                // Suppress transition during live drag for immediate feedback
                inner.style.transition = 'none'
                inner.style.transform  = `scale(${zf * newUserScale})`
              }
            }

            const onUp = (ev: MouseEvent) => {
              document.removeEventListener('mousemove', onMove)
              document.removeEventListener('mouseup', onUp)
              const delta       = ev.clientX - startX
              const newVisualW  = Math.max(40, startVisualW + delta)
              const newUserScale = newVisualW / (NOTE_W * zf)
              noteUserScalesRef.current.set(note.id, newUserScale)
              // Restore transition
              const inner = outerEl.querySelector('[data-note-inner]') as HTMLElement | null
              if (inner) {
                inner.style.transition = `transform ${LEAFLET_ZOOM_ANIM_DURATION}s cubic-bezier(0,0,0.25,1)`
              }
              onNoteScaleChangeRef.current?.(note.id, newUserScale)
            }

            document.addEventListener('mousemove', onMove)
            document.addEventListener('mouseup', onUp)
          })
        }
      }

      noteMarkersRef.current.set(note.id, marker)
    }
  }, [mapNotes, mapReady, canEditNotes])

  return <div ref={mapRef} className="w-full h-full rounded-xl overflow-hidden" />
}
