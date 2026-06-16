'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Stop } from '@/types/database'
import { X, Navigation, Loader2 } from 'lucide-react'

interface Props {
  from: Stop
  to: Stop
  distance?: number
  canEdit: boolean
  onClose: () => void
  onRouteNotesChange: (stopId: string, notes: string) => void
}

export default function RouteSegmentPanel({ from, to, distance, canEdit, onClose, onRouteNotesChange }: Props) {
  const supabase = createClient()
  const [notes, setNotes] = useState(from.route_notes ?? '')
  const [saving, setSaving] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notesRef = useRef(from.route_notes ?? '')

  useEffect(() => {
    const v = from.route_notes ?? ''
    setNotes(v)
    notesRef.current = v
  }, [from.id])

  // Flush any pending save when the panel closes or the segment changes
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        supabase.from('stops').update({ route_notes: notesRef.current }).eq('id', from.id)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from.id])

  function handleChange(value: string) {
    setNotes(value)
    notesRef.current = value
    onRouteNotesChange(from.id, value)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      await supabase.from('stops').update({ route_notes: value }).eq('id', from.id)
      setSaving(false)
    }, 800)
  }

  return (
    <div className="w-80 shrink-0 border-l border-gray-200 bg-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-gray-100">
        <div className="flex-1 min-w-0 pr-2">
          <div className="flex items-center gap-1.5 mb-2">
            <Navigation className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Route leg</span>
            {distance != null && (
              <span className="ml-auto text-xs font-semibold text-gray-700 bg-blue-50 px-2 py-0.5 rounded-full">
                {distance.toFixed(1)} km
              </span>
            )}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                <span className="text-white text-[9px] font-bold">A</span>
              </div>
              <p className="text-sm font-medium text-gray-900 truncate">{from.name}</p>
            </div>
            <div className="w-px h-3 bg-gray-300 ml-2.5" />
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center shrink-0">
                <span className="text-white text-[9px] font-bold">B</span>
              </div>
              <p className="text-sm font-medium text-gray-900 truncate">{to.name}</p>
            </div>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 shrink-0">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Notes */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Leg notes</label>
          {saving && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />Saving
            </span>
          )}
        </div>
        <textarea
          value={notes}
          onChange={e => handleChange(e.target.value)}
          disabled={!canEdit}
          placeholder={canEdit ? 'e.g. take the coastal road, avoid toll, overnight ferry…' : 'No notes'}
          rows={6}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
        />
      </div>
    </div>
  )
}
