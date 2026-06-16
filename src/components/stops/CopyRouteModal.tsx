'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TripRoute, TripRouteWithCreator, Stop, Profile } from '@/types/database'
import { X, Loader2, Copy } from 'lucide-react'

interface EditableTrip {
  id: string
  title: string
}

interface Props {
  route: TripRoute
  stops: Stop[]
  currentTripId: string
  currentTripTitle: string
  currentUserId: string
  onClose: () => void
  /** Called after a successful copy. newRoute is set only when copying to the current trip. */
  onCopied: (newRoute: TripRouteWithCreator | null, newStops: Stop[], targetTripId: string) => void
}

export default function CopyRouteModal({
  route, stops, currentTripId, currentTripTitle, currentUserId, onClose, onCopied
}: Props) {
  const supabase = createClient()
  const [name, setName] = useState(`${route.name} (copy)`)
  const [targetTripId, setTargetTripId] = useState(currentTripId)
  const [trips, setTrips] = useState<EditableTrip[]>([{ id: currentTripId, title: currentTripTitle }])
  const [loadingTrips, setLoadingTrips] = useState(true)
  const [copying, setCopying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('trip_members')
        .select('role, trip:trips!inner(id, title)')
        .eq('user_id', currentUserId)
        .in('role', ['owner', 'editor'])

      if (data) {
        const list = data
          .map((m: any) => m.trip as EditableTrip)
          .filter(Boolean)
          .filter((t, i, arr) => arr.findIndex(x => x.id === t.id) === i) // dedupe
          .sort((a, b) => a.title.localeCompare(b.title))
        setTrips(list.length > 0 ? list : [{ id: currentTripId, title: currentTripTitle }])
      }
      setLoadingTrips(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleCopy() {
    if (!name.trim()) return
    setCopying(true)
    setError(null)

    try {
      // Get next order_index for target trip
      const { data: existingRoutes } = await supabase
        .from('routes')
        .select('order_index')
        .eq('trip_id', targetTripId)
        .order('order_index', { ascending: false })
        .limit(1)
      const nextOrder = existingRoutes && existingRoutes.length > 0
        ? existingRoutes[0].order_index + 1
        : 0

      // Create new route
      const { data: newRoute, error: routeErr } = await supabase
        .from('routes')
        .insert({
          trip_id: targetTripId,
          name: name.trim(),
          created_by: currentUserId,
          order_index: nextOrder,
        })
        .select('*, creator:profiles(*)')
        .single()

      if (routeErr || !newRoute) {
        setError(routeErr?.message ?? 'Failed to create route')
        setCopying(false)
        return
      }

      // Copy stops
      const newStops: Stop[] = []
      if (stops.length > 0) {
        const { data: insertedStops, error: stopsErr } = await supabase
          .from('stops')
          .insert(
            stops.map(s => ({
              trip_id: targetTripId,
              route_id: newRoute.id,
              name: s.name,
              lat: s.lat,
              lng: s.lng,
              address: s.address,
              notes: s.notes,
              route_notes: s.route_notes,
              order_index: s.order_index,
            }))
          )
          .select()

        if (stopsErr) {
          setError(stopsErr.message)
          setCopying(false)
          return
        }
        newStops.push(...(insertedStops ?? []))
      }

      onCopied(
        targetTripId === currentTripId ? (newRoute as TripRouteWithCreator) : null,
        newStops,
        targetTripId
      )
    } catch (e: any) {
      setError(e.message ?? 'Unknown error')
      setCopying(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Copy className="w-4 h-4 text-gray-500" />
            <h2 className="text-lg font-semibold">Copy route</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New route name</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Copy to trip</label>
            {loadingTrips ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading trips…
              </div>
            ) : (
              <select
                value={targetTripId}
                onChange={e => setTargetTripId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {trips.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.title}{t.id === currentTripId ? ' (this trip)' : ''}
                  </option>
                ))}
              </select>
            )}
            <p className="text-xs text-gray-400 mt-1">
              Copying {stops.length} stop{stops.length !== 1 ? 's' : ''}
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleCopy}
              disabled={copying || !name.trim()}
              className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {copying && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {copying ? 'Copying…' : 'Copy route'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
