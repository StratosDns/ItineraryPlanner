'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus, Loader2, X } from 'lucide-react'

interface Props {
  userId: string
  primary?: boolean
}

export default function CreateTripButton({ userId, primary }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // Generate UUIDs client-side to avoid RETURNING needing SELECT RLS
    const tripId = crypto.randomUUID()

    const { error: tripErr } = await supabase
      .from('trips')
      .insert({ id: tripId, title, description: description || null, owner_id: userId })

    if (tripErr) { setError(tripErr.message); setLoading(false); return }

    const { error: memberErr } = await supabase.from('trip_members').insert({
      trip_id: tripId, user_id: userId, role: 'owner',
    })
    if (memberErr) { setError(memberErr.message); setLoading(false); return }

    // Create a default route so the StopsTab is ready immediately
    await supabase.from('routes').insert({
      trip_id: tripId, name: 'Route 1', created_by: userId, order_index: 0,
    })

    setLoading(false)
    setOpen(false)
    setTitle('')
    setDescription('')
    router.push(`/trips/${tripId}`)
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          primary
            ? 'inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700'
            : 'inline-flex items-center gap-2 bg-blue-600 text-white px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700'
        }
      >
        <Plus className="w-4 h-4" />
        New trip
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold">New trip</h2>
              <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-gray-100">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Trip name</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Europe Road Trip 2026"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Short summary of the trip..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Create trip
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
