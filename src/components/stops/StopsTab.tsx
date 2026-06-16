'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { Stop, TripRouteWithCreator, TripRoute } from '@/types/database'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Plus, GripVertical, Trash2, ChevronRight, MapPin, Search, X, Loader2, Route,
  MoreHorizontal, Copy
} from 'lucide-react'
import { geocode, GeoResult } from '@/lib/nominatim'
import StopPanel from './StopPanel'
import RouteSegmentPanel from './RouteSegmentPanel'
import CopyRouteModal from './CopyRouteModal'

const RouteMap = dynamic(() => import('@/components/map/RouteMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-gray-100 rounded-xl flex items-center justify-center">
      <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
    </div>
  ),
})

interface Props {
  tripId: string
  initialRoutes: TripRouteWithCreator[]
  canEdit: boolean
  currentUserId: string
}

// ── Sortable stop row ─────────────────────────────────────────────────────────
function SortableStop({
  stop, index, selected, canEdit, onClick, onDelete,
}: {
  stop: Stop
  index: number
  selected: boolean
  canEdit: boolean
  onClick: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: stop.id, disabled: !canEdit })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${
        selected
          ? 'bg-blue-50 border-blue-200'
          : isDragging
          ? 'bg-white border-gray-300 shadow-md opacity-90'
          : 'bg-white border-gray-200 hover:border-gray-300'
      }`}
      onClick={onClick}
    >
      {canEdit && (
        <div
          {...attributes}
          {...listeners}
          className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing p-0.5"
          onClick={e => e.stopPropagation()}
        >
          <GripVertical className="w-4 h-4" />
        </div>
      )}
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
        selected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
      }`}>
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{stop.name}</p>
        {stop.address && <p className="text-xs text-gray-400 truncate">{stop.address}</p>}
      </div>
      <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
      {canEdit && (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

// ── Add stop form ─────────────────────────────────────────────────────────────
function AddStopForm({ onAdd, onCancel }: {
  onAdd: (name: string, lat: number, lng: number, address: string) => Promise<void>
  onCancel: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeoResult[]>([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState(false)

  async function search() {
    if (!query.trim()) return
    setSearching(true)
    try { setResults(await geocode(query)) }
    catch { /* ignore */ }
    finally { setSearching(false) }
  }

  async function pick(r: GeoResult) {
    setAdding(true)
    await onAdd(query.trim() || r.display_name.split(',')[0], r.lat, r.lng, r.display_name)
    setAdding(false)
  }

  return (
    <div className="border border-blue-200 bg-blue-50 rounded-xl p-3 space-y-2">
      <div className="flex gap-2">
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Search location..."
          className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
        <button
          onClick={search}
          disabled={searching}
          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-60"
        >
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>
      {results.length > 0 && (
        <ul className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden max-h-48 overflow-y-auto">
          {results.map((r, i) => (
            <li key={i}>
              <button
                onClick={() => pick(r)}
                disabled={adding}
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-start gap-2"
              >
                <MapPin className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
                <span className="line-clamp-2 text-gray-700">{r.display_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Creator avatar chip ───────────────────────────────────────────────────────
function CreatorAvatar({ name, url }: { name: string | null; url: string | null }) {
  const initial = (name ?? '?')[0].toUpperCase()
  if (url) {
    return <img src={url} alt={name ?? ''} className="w-4 h-4 rounded-full object-cover shrink-0" />
  }
  return (
    <div className="w-4 h-4 rounded-full bg-gray-400 flex items-center justify-center text-[8px] font-bold text-white shrink-0">
      {initial}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function StopsTab({ tripId, initialRoutes, canEdit, currentUserId }: Props) {
  const supabase = createClient()

  // Route state
  const [routes, setRoutes] = useState<TripRouteWithCreator[]>(initialRoutes)
  const [activeRouteId, setActiveRouteId] = useState<string | null>(initialRoutes[0]?.id ?? null)
  const [loadingStops, setLoadingStops] = useState(false)
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null)
  const [routeMenuId, setRouteMenuId] = useState<string | null>(null)
  const [copyTarget, setCopyTarget] = useState<TripRoute | null>(null)
  const [creatingRoute, setCreatingRoute] = useState(false)

  // Stop state
  const [stops, setStops] = useState<Stop[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [panelStop, setPanelStop] = useState<Stop | null>(null)
  const [panelSegment, setPanelSegment] = useState<{ index: number } | null>(null)
  const [segmentDistances, setSegmentDistances] = useState<number[]>([])

  const stopsRef = useRef(stops)
  useEffect(() => { stopsRef.current = stops }, [stops])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const totalDistance = segmentDistances.reduce((s, d) => s + d, 0)

  // Load stops whenever the active route changes
  useEffect(() => {
    if (!activeRouteId) { setStops([]); return }
    setLoadingStops(true)
    setStops([])
    setSelectedId(null)
    setPanelStop(null)
    setPanelSegment(null)
    setSegmentDistances([])
    supabase
      .from('stops')
      .select('*')
      .eq('route_id', activeRouteId)
      .order('order_index', { ascending: true })
      .then(({ data }) => {
        setStops(data ?? [])
        setLoadingStops(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRouteId])

  // Close route menu on outside click
  useEffect(() => {
    if (!routeMenuId) return
    function handle() { setRouteMenuId(null) }
    document.addEventListener('click', handle)
    return () => document.removeEventListener('click', handle)
  }, [routeMenuId])

  // ── Route CRUD ──────────────────────────────────────────────────────────────
  async function createRoute() {
    setCreatingRoute(true)
    const { data, error } = await supabase
      .from('routes')
      .insert({
        trip_id: tripId,
        name: `Route ${routes.length + 1}`,
        created_by: currentUserId,
        order_index: routes.length,
      })
      .select('*, creator:profiles(*)')
      .single()
    setCreatingRoute(false)
    if (!error && data) {
      setRoutes(prev => [...prev, data as TripRouteWithCreator])
      setActiveRouteId(data.id)
    }
  }

  async function renameRoute(id: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) { setEditingRouteId(null); return }
    await supabase.from('routes').update({ name: trimmed }).eq('id', id)
    setRoutes(prev => prev.map(r => r.id === id ? { ...r, name: trimmed } : r))
    setEditingRouteId(null)
  }

  async function deleteRoute(id: string) {
    if (!confirm('Delete this route and all its stops?')) return
    await supabase.from('routes').delete().eq('id', id)
    const remaining = routes.filter(r => r.id !== id)
    setRoutes(remaining)
    if (activeRouteId === id) setActiveRouteId(remaining[0]?.id ?? null)
  }

  // ── Stop CRUD ───────────────────────────────────────────────────────────────
  async function addStop(name: string, lat: number, lng: number, address: string) {
    if (!activeRouteId) return
    const { data, error } = await supabase
      .from('stops')
      .insert({
        trip_id: tripId,
        route_id: activeRouteId,
        name, lat, lng, address,
        order_index: stopsRef.current.length,
      })
      .select()
      .single()
    if (!error && data) {
      setStops(prev => [...prev, data])
      setAdding(false)
      setSelectedId(data.id)
      setPanelStop(data)
      setPanelSegment(null)
    }
  }

  async function deleteStop(id: string) {
    const current = stopsRef.current
    await supabase.from('stops').delete().eq('id', id)
    const next = current.filter(s => s.id !== id).map((s, i) => ({ ...s, order_index: i }))
    setStops(next)
    setSegmentDistances([])
    if (selectedId === id) { setSelectedId(null); setPanelStop(null) }
    if (panelSegment !== null) setPanelSegment(null)
    const original = new Map(current.map(s => [s.id, s.order_index]))
    await Promise.all(
      next
        .filter(s => original.get(s.id) !== s.order_index)
        .map(s => supabase.from('stops').update({ order_index: s.order_index }).eq('id', s.id))
    )
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const current = stopsRef.current
    const oldIdx = current.findIndex(s => s.id === active.id)
    const newIdx = current.findIndex(s => s.id === over.id)
    const reordered = arrayMove(current, oldIdx, newIdx).map((s, i) => ({ ...s, order_index: i }))
    setStops(reordered)
    setSegmentDistances([])
    setPanelSegment(null)
    const original = new Map(current.map(s => [s.id, s.order_index]))
    await Promise.all(
      reordered
        .filter(s => original.get(s.id) !== s.order_index)
        .map(s => supabase.from('stops').update({ order_index: s.order_index }).eq('id', s.id))
    )
  }

  const updateStopNotes = useCallback((id: string, notes: string) => {
    setStops(prev => prev.map(s => s.id === id ? { ...s, notes } : s))
  }, [])

  const updateStopRouteNotes = useCallback((id: string, route_notes: string) => {
    setStops(prev => prev.map(s => s.id === id ? { ...s, route_notes } : s))
  }, [])

  // ── Copy route callback ─────────────────────────────────────────────────────
  function handleCopied(
    newRoute: TripRouteWithCreator | null,
    newStops: Stop[],
    targetTripId: string
  ) {
    if (newRoute && targetTripId === tripId) {
      // Copy was to this trip — add tab and switch to it (stops load via useEffect)
      setRoutes(prev => [...prev, newRoute])
      setActiveRouteId(newRoute.id)
    }
    // If copied to another trip, user just sees the modal close
    setCopyTarget(null)
  }

  const segFrom = panelSegment != null ? stops[panelSegment.index] : null
  const segTo   = panelSegment != null ? stops[panelSegment.index + 1] : null

  const activeRoute = routes.find(r => r.id === activeRouteId)

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] overflow-hidden">
      {/* Route tabs */}
      <div className="bg-white border-b border-gray-200 px-3 py-2 flex items-center gap-1.5 overflow-x-auto shrink-0">
        {routes.map(route => {
          const isActive = route.id === activeRouteId
          const isEditing = editingRouteId === route.id
          return (
            <div
              key={route.id}
              className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer border transition-all shrink-0 ${
                isActive
                  ? 'bg-blue-50 border-blue-200'
                  : 'border-transparent hover:bg-gray-50 hover:border-gray-200'
              }`}
              onClick={() => !isEditing && setActiveRouteId(route.id)}
            >
              <CreatorAvatar
                name={route.creator?.display_name ?? null}
                url={route.creator?.avatar_url ?? null}
              />

              {isEditing ? (
                <input
                  autoFocus
                  defaultValue={route.name}
                  className="text-sm font-medium bg-white border border-blue-300 rounded px-1 w-28 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  onBlur={e => renameRoute(route.id, e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') renameRoute(route.id, e.currentTarget.value)
                    if (e.key === 'Escape') setEditingRouteId(null)
                  }}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span className={`text-sm font-medium truncate max-w-[120px] ${
                  isActive ? 'text-blue-700' : 'text-gray-700'
                }`}>
                  {route.name}
                </span>
              )}

              {canEdit && (
                <div className="relative" onClick={e => e.stopPropagation()}>
                  <button
                    className={`p-0.5 rounded hover:bg-gray-200 text-gray-400 transition-opacity ${
                      isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}
                    onClick={() => setRouteMenuId(routeMenuId === route.id ? null : route.id)}
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                  {routeMenuId === route.id && (
                    <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[120px] py-1">
                      <button
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 text-gray-700"
                        onClick={() => { setEditingRouteId(route.id); setRouteMenuId(null) }}
                      >
                        Rename
                      </button>
                      <button
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 text-gray-700 flex items-center gap-2"
                        onClick={() => { setCopyTarget(route); setRouteMenuId(null) }}
                      >
                        <Copy className="w-3 h-3" /> Copy
                      </button>
                      <button
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-red-50 text-red-600"
                        onClick={() => { deleteRoute(route.id); setRouteMenuId(null) }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {canEdit && (
          <button
            onClick={creatingRoute ? undefined : createRoute}
            disabled={creatingRoute}
            className="flex items-center gap-1 px-2.5 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg border border-dashed border-blue-200 transition-colors shrink-0 disabled:opacity-60"
          >
            {creatingRoute
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Plus className="w-3.5 h-3.5" />}
            New route
          </button>
        )}

        {routes.length === 0 && !canEdit && (
          <p className="text-sm text-gray-400 px-2">No routes yet</p>
        )}
      </div>

      {/* Main area */}
      {routes.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center p-8">
          <div>
            <Route className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 font-medium mb-1">No routes yet</p>
            <p className="text-sm text-gray-400 mb-4">Create a route to start adding stops and planning your trip.</p>
            {canEdit && (
              <button
                onClick={createRoute}
                disabled={creatingRoute}
                className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
              >
                {creatingRoute
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</>
                  : <><Plus className="w-4 h-4" /> Create first route</>}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Left: stop list */}
          <div className="w-80 shrink-0 flex flex-col border-r border-gray-200 bg-white overflow-hidden">
            <div className="p-3 border-b border-gray-100 flex items-center justify-between gap-2">
              <div>
                <span className="text-sm font-medium text-gray-700">
                  {stops.length} stop{stops.length !== 1 ? 's' : ''}
                </span>
                {segmentDistances.length > 0 && (
                  <span className="ml-2 text-xs text-gray-400 inline-flex items-center gap-1">
                    <Route className="w-3 h-3" />
                    {totalDistance.toFixed(0)} km total
                  </span>
                )}
              </div>
              {canEdit && !adding && activeRouteId && (
                <button
                  onClick={() => setAdding(true)}
                  className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium shrink-0"
                >
                  <Plus className="w-4 h-4" /> Add stop
                </button>
              )}
            </div>

            <div className="flex-1 p-2 space-y-1.5 overflow-y-auto">
              {loadingStops ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
                </div>
              ) : (
                <>
                  {adding && <AddStopForm onAdd={addStop} onCancel={() => setAdding(false)} />}

                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={stops.map(s => s.id)} strategy={verticalListSortingStrategy}>
                      {stops.map((stop, i) => (
                        <div key={stop.id}>
                          {i > 0 && (
                            <div
                              className="flex items-center gap-1.5 pl-9 py-0.5 text-xs text-gray-400 group cursor-pointer hover:text-blue-500"
                              onClick={() => {
                                setPanelSegment({ index: i - 1 })
                                setPanelStop(null)
                                setSelectedId(null)
                              }}
                              title="Click to add route notes for this leg"
                            >
                              <span className="block w-px h-3 bg-gray-200 group-hover:bg-blue-300 ml-1" />
                              <span>
                                {segmentDistances[i - 1] != null
                                  ? `${segmentDistances[i - 1].toFixed(1)} km`
                                  : stops.filter(s => s.lat != null).length >= 2 ? 'routing…' : ''}
                              </span>
                              {stops[i - 1]?.route_notes && (
                                <span className="text-blue-400">· notes</span>
                              )}
                            </div>
                          )}
                          <SortableStop
                            stop={stop}
                            index={i}
                            selected={selectedId === stop.id}
                            canEdit={canEdit}
                            onClick={() => {
                              setSelectedId(stop.id)
                              setPanelStop(stop)
                              setPanelSegment(null)
                            }}
                            onDelete={() => deleteStop(stop.id)}
                          />
                        </div>
                      ))}
                    </SortableContext>
                  </DndContext>

                  {stops.length === 0 && !adding && (
                    <div className="text-center py-12 text-gray-400">
                      <MapPin className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">No stops yet</p>
                      {canEdit && (
                        <button
                          onClick={() => setAdding(true)}
                          className="text-blue-600 text-sm mt-1 hover:underline"
                        >
                          Add your first stop
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Map */}
          <div className="flex-1 relative">
            <div className="absolute inset-2">
              <RouteMap
                stops={stops}
                selectedStopId={selectedId}
                onMarkerClick={stop => {
                  setSelectedId(stop.id)
                  setPanelStop(stop)
                  setPanelSegment(null)
                }}
                onRouteUpdate={setSegmentDistances}
                onSegmentClick={i => {
                  setPanelSegment({ index: i })
                  setPanelStop(null)
                  setSelectedId(null)
                }}
              />
            </div>
          </div>

          {/* Stop detail panel */}
          {panelStop && (
            <StopPanel
              stop={panelStop}
              canEdit={canEdit}
              onClose={() => setPanelStop(null)}
              onNotesChange={updateStopNotes}
            />
          )}

          {/* Route segment panel */}
          {panelSegment != null && segFrom && segTo && (
            <RouteSegmentPanel
              from={segFrom}
              to={segTo}
              distance={segmentDistances[panelSegment.index]}
              canEdit={canEdit}
              onClose={() => setPanelSegment(null)}
              onRouteNotesChange={updateStopRouteNotes}
            />
          )}
        </div>
      )}

      {/* Copy route modal */}
      {copyTarget && activeRoute && (
        <CopyRouteModal
          route={copyTarget}
          stops={copyTarget.id === activeRouteId ? stops : []}
          currentTripId={tripId}
          currentTripTitle=""
          currentUserId={currentUserId}
          onClose={() => setCopyTarget(null)}
          onCopied={handleCopied}
        />
      )}
    </div>
  )
}
