'use client'

// /viewer/[token] — Anonymous read-only route view
// No authentication required. Token is the access credential.
// Shows: map + stops list only. No notes, no costs, no members.

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { MapPin, Eye, Loader2, AlertCircle, Clock, MapPinned } from 'lucide-react'
import { Stop, MapNote } from '@/types/database'

const RouteMap = dynamic(() => import('@/components/map/RouteMap'), { ssr: false })

interface TripData {
  trip: { id: string; title: string; description: string | null }
  routes: { id: string; name: string; order_index: number }[]
  stops: (Omit<Stop, 'notes' | 'route_notes'>)[]
  mapNotes: MapNote[]
}

export default function ViewerPage() {
  const params = useParams()
  const token = params.token as string

  const [data, setData] = useState<TripData | null>(null)
  const [error, setError] = useState<'expired' | 'invalid' | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    fetch(`/api/join/${token}/trip-data`)
      .then(async res => {
        if (!res.ok) {
          const json = await res.json()
          setError(json.expired ? 'expired' : 'invalid')
          return
        }
        const json: TripData = await res.json()
        setData(json)
        if (json.routes.length > 0) setActiveRouteId(json.routes[0].id)
      })
      .catch(() => setError('invalid'))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex items-center gap-2 mb-8">
            <MapPin className="w-7 h-7 text-blue-600" />
            <span className="text-xl font-bold text-gray-900">RouteForge</span>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-8">
            {error === 'expired' ? (
              <>
                <Clock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <h1 className="text-lg font-semibold text-gray-900 mb-2">Link expired</h1>
                <p className="text-sm text-gray-500">This invite link has expired. Ask the trip owner for a new one.</p>
              </>
            ) : (
              <>
                <AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <h1 className="text-lg font-semibold text-gray-900 mb-2">Link not found</h1>
                <p className="text-sm text-gray-500">This invite link is invalid or has been revoked.</p>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (!data) return null

  const activeRoute = data.routes.find(r => r.id === activeRouteId) ?? data.routes[0]
  const activeStops = data.stops.filter(s => s.route_id === activeRouteId) as Stop[]
  const activeMapNotes = data.mapNotes.filter(n => n.route_id === activeRouteId)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-blue-600" />
          <span className="font-bold text-gray-900">{data.trip.title}</span>
        </div>
        <div className="flex items-center gap-1.5 bg-gray-100 text-gray-500 text-xs font-medium px-3 py-1.5 rounded-full">
          <Eye className="w-3.5 h-3.5" />
          Viewing as guest
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-72 shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
          {/* Route tabs */}
          {data.routes.length > 1 && (
            <div className="flex overflow-x-auto border-b border-gray-200 px-3 pt-3 gap-1 shrink-0">
              {data.routes.map(r => (
                <button
                  key={r.id}
                  onClick={() => setActiveRouteId(r.id)}
                  className={`text-xs px-3 py-1.5 rounded-t-lg whitespace-nowrap font-medium border-b-2 transition-colors ${
                    r.id === activeRouteId
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {r.name}
                </button>
              ))}
            </div>
          )}

          {/* Stop list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {activeStops.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <MapPinned className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No stops yet</p>
              </div>
            ) : (
              activeStops.map((stop, idx) => (
                <div
                  key={stop.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100"
                >
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-semibold shrink-0 mt-0.5">
                    {idx + 1}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{stop.name}</p>
                    {stop.address && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">{stop.address}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer hint */}
          <div className="border-t border-gray-100 px-4 py-3 shrink-0">
            <p className="text-xs text-gray-400 text-center">
              {activeRoute?.name} · {activeStops.length} stop{activeStops.length !== 1 ? 's' : ''}
            </p>
          </div>
        </aside>

        {/* Map */}
        <main className="flex-1 relative">
          <RouteMap
            stops={activeStops}
            mapNotes={activeMapNotes}
            canEditNotes={false}
          />
        </main>
      </div>
    </div>
  )
}
