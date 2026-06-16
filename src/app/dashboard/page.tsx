import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { MapPin, Calendar } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import CreateTripButton from '@/components/CreateTripButton'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch all trips the user is a member of
  const { data: memberships } = await supabase
    .from('trip_members')
    .select(`
      role,
      trip:trips (
        id, title, description, created_at, owner_id
      )
    `)
    .eq('user_id', user.id)
    .order('joined_at', { ascending: false })

  const trips = (memberships ?? [])
    .filter(m => m.trip)
    .map(m => ({ ...m.trip as { id: string; title: string; description: string | null; created_at: string; owner_id: string }, role: m.role }))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Trips</h1>
          <p className="text-gray-500 text-sm mt-0.5">{trips.length} trip{trips.length !== 1 ? 's' : ''}</p>
        </div>
        <CreateTripButton userId={user.id} />
      </div>

      {trips.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-2xl">
          <MapPin className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="font-medium text-gray-500">No trips yet</p>
          <p className="text-sm text-gray-400 mb-4">Create your first multi-stop route</p>
          <CreateTripButton userId={user.id} primary />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {trips.map(trip => (
            <Link
              key={trip.id}
              href={`/trips/${trip.id}`}
              className="bg-white border border-gray-200 rounded-2xl p-5 hover:border-blue-300 hover:shadow-sm transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                  <MapPin className="w-5 h-5 text-blue-600" />
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  trip.role === 'owner'
                    ? 'bg-purple-100 text-purple-700'
                    : trip.role === 'editor'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {trip.role}
                </span>
              </div>

              <h3 className="font-semibold text-gray-900 mb-1 line-clamp-1">{trip.title}</h3>
              {trip.description && (
                <p className="text-sm text-gray-500 line-clamp-2 mb-3">{trip.description}</p>
              )}

              <div className="flex items-center gap-1 text-xs text-gray-400 mt-auto">
                <Calendar className="w-3 h-3" />
                <span>{formatDistanceToNow(new Date(trip.created_at), { addSuffix: true })}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
