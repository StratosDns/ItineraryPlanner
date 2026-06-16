'use client'

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { Stop } from '@/types/database'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, GripVertical, Trash2, ChevronRight, MapPin, Search, X, Loader2 } from 'lucide-react'
import { geocode, GeoResult } from '@/lib/nominatim'
import StopPanel from './StopPanel'

const RouteMap = dynamic(() => import('@/components/map/RouteMap'), { ssr: false, loading: () => (
  <div className="w-full h-full bg-gray-100 rounded-xl flex items-center justify-center">
    <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
  </div>
) })

interface Props {
  tripId: string
  initialStops: Stop[]
  canEdit: boolean
}

// ── Sortable stop row ─────────────────────────────────────────────────────────
function SortableStop({
  stop, index, selected, canEdit, onClick, onDelete
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
      {/* Drag handle */}
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

      {/* Number badge */}
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
        selected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
      }`}>
        {index + 1}
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{stop.name}</p>
        {stop.address && (
          <p className="text-xs text-gray-400 truncate">{stop.address}</p>
        )}
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
function AddStopForm({ onAdd, onCancel }: { onAdd: (name: string, lat: number, lng: number, address: string) => Promise<void>; onCancel: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeoResult[]>([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState(false)

  async function search() {
    if (!query.trim()) return
    setSearching(true)
    try {
      const r = await geocode(query)
      setResults(r)
    } catch { /* ignore */ } finally {
      setSearching(false) }
  }

  async function pick(r: GeoResult) {
    setAdding(true)
    const name = query.trim() || r.display_name.split(',')[0]
    await onAdd(name, r.lat, r.lng, r.display_name)
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

// ── Main component ────────────────────────────────────────────────────────────
export default function StopsTab({ tripId, initialStops, canEdit }: Props) {
  const supabase = createClient()
  const [stops, setStops] = useState<Stop[]>(initialStops)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [panelStop, setPanelStop] = useState<Stop | null>(null)
  // Driving distances between consecutive stops, updated by RouteMap
  const [segmentDistances, setSegmentDistances] = useState<number[]>([])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const selectedStop = stops.find(s => s.id === selectedId) ?? null

  async function addStop(name: string, lat: number, lng: number, address: string) {
    const orderIndex = stops.length
    const { data, error } = await supabase
      .from('stops')
      .insert({ trip_id: tripId, name, lat, lng, address, order_index: orderIndex })
      .select()
      .single()
    if (!error && data) {
      setStops(prev => [...prev, data])
      setAdding(false)
      setSelectedId(data.id)
    }
  }

  async function deleteStop(id: string) {
    await supabase.from('stops').delete().eq('id', id)
    setStops(prev => {
      const next = prev.filter(s => s.id !== id)
      // Re-index
      next.forEach((s, i) => {
        if (s.order_index !== i) {
          supabase.from('stops').update({ order_index: i }).eq('id', s.id)
        }
      })
      return next.map((s, i) => ({ ...s, order_index: i }))
    })
    if (selectedId === id) setSelectedId(null)
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setStops(prev => {
      const oldIdx = prev.findIndex(s => s.id === active.id)
      const newIdx = prev.findIndex(s => s.id === over.id)
      const reordered = arrayMove(prev, oldIdx, newIdx)
      // Persist new order
      reordered.forEach((s, i) => {
        if (s.order_index !== i) {
          supabase.from('stops').update({ order_index: i }).eq('id', s.id)
        }
      })
      return reordered.map((s, i) => ({ ...s, order_index: i }))
    })
  }

  const updateStopNotes = useCallback((id: string, notes: string) => {
    setStops(prev => prev.map(s => s.id === id ? { ...s, notes } : s))
  }, [])

  return (
    <div className="flex h-[calc(100vh-8rem)] overflow-hidden">
      {/* Left: stop list */}
      <div className="w-80 shrink-0 flex flex-col border-r border-gray-200 bg-white overflow-y-auto">
        <div className="p-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">
            {stops.length} stop{stops.length !== 1 ? 's' : ''}
          </span>
          {canEdit && !adding && (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              <Plus className="w-4 h-4" /> Add stop
            </button>
          )}
        </div>

        <div className="flex-1 p-2 space-y-1.5 overflow-y-auto">
          {adding && (
            <AddStopForm onAdd={addStop} onCancel={() => setAdding(false)} />
          )}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={stops.map(s => s.id)} strategy={verticalListSortingStrategy}>
              {stops.map((stop, i) => (
                <div key={stop.id}>
                  {i > 0 && (
                    <div className="flex items-center gap-1.5 pl-10 py-0.5 text-xs text-gray-400">
                      <span className="block w-px h-3 bg-gray-200 ml-1" />
                      {segmentDistances[i - 1] != null
                        ? <span>{segmentDistances[i - 1].toFixed(1)} km</span>
                        : <span className="italic">routing…</span>}
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
                <button onClick={() => setAdding(true)} className="text-blue-600 text-sm mt-1 hover:underline">
                  Add your first stop
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right: map */}
      <div className="flex-1 relative">
        <div className="absolute inset-2">
          <RouteMap
            stops={stops}
            selectedStopId={selectedId}
            onMarkerClick={stop => { setSelectedId(stop.id); setPanelStop(stop) }}
            onRouteUpdate={setSegmentDistances}
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
    </div>
  )
}
