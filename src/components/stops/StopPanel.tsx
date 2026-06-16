'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Stop, StopAttachment } from '@/types/database'
import { X, Paperclip, Trash2, Upload, Loader2, ExternalLink, FileText } from 'lucide-react'

interface Props {
  stop: Stop
  canEdit: boolean
  onClose: () => void
  onNotesChange: (id: string, notes: string) => void
}

export default function StopPanel({ stop, canEdit, onClose, onNotesChange }: Props) {
  const supabase = createClient()
  const [notes, setNotes] = useState(stop.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [attachments, setAttachments] = useState<StopAttachment[]>([])
  const [loadingAttachments, setLoadingAttachments] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [label, setLabel] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setNotes(stop.notes ?? '')
    fetchAttachments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stop.id])

  async function fetchAttachments() {
    setLoadingAttachments(true)
    const { data } = await supabase
      .from('stop_attachments')
      .select('*')
      .eq('stop_id', stop.id)
      .order('created_at', { ascending: false })
    setAttachments(data ?? [])
    setLoadingAttachments(false)
  }

  function handleNotesChange(value: string) {
    setNotes(value)
    onNotesChange(stop.id, value)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      await supabase.from('stops').update({ notes: value }).eq('id', stop.id)
      setSaving(false)
    }, 800)
  }

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)

    const ext = file.name.split('.').pop()
    const path = `stops/${stop.id}/${Date.now()}.${ext}`

    const { error: upErr } = await supabase.storage
      .from('attachments')
      .upload(path, file)

    if (upErr) { setUploading(false); alert('Upload failed: ' + upErr.message); return }

    const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(path)

    const { data: att } = await supabase
      .from('stop_attachments')
      .insert({
        stop_id: stop.id,
        file_name: file.name,
        file_url: urlData.publicUrl,
        storage_path: path,
        file_type: file.type,
        label: label.trim() || null,
      })
      .select()
      .single()

    if (att) setAttachments(prev => [att, ...prev])
    setLabel('')
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function deleteAttachment(att: StopAttachment) {
    await supabase.storage.from('attachments').remove([att.storage_path])
    await supabase.from('stop_attachments').delete().eq('id', att.id)
    setAttachments(prev => prev.filter(a => a.id !== att.id))
  }

  function fileIcon(type: string | null) {
    if (!type) return <FileText className="w-4 h-4 text-gray-400" />
    if (type.startsWith('image/')) return <span className="text-lg">🖼</span>
    if (type === 'application/pdf') return <span className="text-lg">📄</span>
    return <FileText className="w-4 h-4 text-gray-400" />
  }

  return (
    <div className="w-80 shrink-0 border-l border-gray-200 bg-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-gray-100">
        <div className="flex-1 min-w-0 pr-2">
          <h3 className="font-semibold text-gray-900 truncate">{stop.name}</h3>
          {stop.address && (
            <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{stop.address}</p>
          )}
          {stop.lat != null && (
            <p className="text-xs text-gray-300 mt-0.5">{stop.lat.toFixed(5)}, {stop.lng?.toFixed(5)}</p>
          )}
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 shrink-0">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Notes */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Notes</label>
            {saving && <span className="text-xs text-gray-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Saving</span>}
          </div>
          <textarea
            value={notes}
            onChange={e => handleNotesChange(e.target.value)}
            disabled={!canEdit}
            placeholder={canEdit ? 'Add notes about this stop...' : 'No notes'}
            rows={5}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
          />
        </div>

        {/* Attachments */}
        <div className="p-4">
          <div className="flex items-center gap-1 mb-3">
            <Paperclip className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Attachments</span>
          </div>

          {canEdit && (
            <div className="mb-3 space-y-2">
              <input
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="Label (e.g. Hotel reservation)"
                className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <label className={`flex items-center gap-2 justify-center w-full border-2 border-dashed rounded-lg py-2.5 cursor-pointer transition-colors text-xs font-medium
                ${uploading ? 'border-gray-200 text-gray-400' : 'border-blue-200 text-blue-600 hover:bg-blue-50'}`}>
                {uploading
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</>
                  : <><Upload className="w-3.5 h-3.5" /> Upload file</>}
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  disabled={uploading}
                  onChange={uploadFile}
                  accept="image/*,application/pdf,.doc,.docx,.txt,.csv"
                />
              </label>
            </div>
          )}

          {loadingAttachments ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-gray-300" />
            </div>
          ) : attachments.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-3">No attachments</p>
          ) : (
            <ul className="space-y-2">
              {attachments.map(att => (
                <li key={att.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 border border-gray-100">
                  <span className="shrink-0">{fileIcon(att.file_type)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate">{att.label ?? att.file_name}</p>
                    {att.label && <p className="text-xs text-gray-400 truncate">{att.file_name}</p>}
                  </div>
                  <a
                    href={att.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 text-gray-400 hover:text-blue-600 shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  {canEdit && (
                    <button
                      onClick={() => deleteAttachment(att)}
                      className="p-1 text-gray-400 hover:text-red-500 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
