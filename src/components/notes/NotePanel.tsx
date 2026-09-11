'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MapNote, MapNoteItem, Cost } from '@/types/database'
import {
  X, Link2, ImageIcon, FileText, DollarSign, Plus, Trash2,
  ExternalLink, Loader2, Upload, ChevronDown, ChevronRight,
} from 'lucide-react'

interface Props {
  note: MapNote
  tripId: string
  canEdit: boolean
  onClose: () => void
}

const NOTE_DOT: Record<string, string> = {
  yellow: 'bg-yellow-400',
  green:  'bg-green-400',
  red:    'bg-red-400',
  blue:   'bg-blue-400',
}

type Section = 'links' | 'images' | 'texts' | 'costs'

export default function NotePanel({ note, tripId, canEdit, onClose }: Props) {
  const supabase = createClient()
  const [items, setItems] = useState<MapNoteItem[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<Record<Section, boolean>>({
    links: true, images: true, texts: true, costs: true,
  })

  // Link form
  const [addingLink, setAddingLink] = useState(false)
  const [linkLabel, setLinkLabel] = useState('')
  const [linkUrl, setLinkUrl]   = useState('')
  const [savingLink, setSavingLink] = useState(false)

  // Text form
  const [addingText, setAddingText]     = useState(false)
  const [textContent, setTextContent]   = useState('')
  const [savingText, setSavingText]     = useState(false)

  // Cost form
  const [addingCost, setAddingCost]         = useState(false)
  const [costs, setCosts]                   = useState<Cost[]>([])
  const [costsLoading, setCostsLoading]     = useState(false)
  const [selectedCostId, setSelectedCostId] = useState('')
  const [savingCost, setSavingCost]         = useState(false)

  // Image upload
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    loadItems()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id])

  async function loadItems() {
    setLoading(true)
    const { data } = await supabase
      .from('note_items')
      .select('*')
      .eq('note_id', note.id)
      .order('order_index')
    setItems(data ?? [])
    setLoading(false)
  }

  async function loadCosts() {
    if (costs.length > 0) return
    setCostsLoading(true)
    const { data } = await supabase
      .from('costs')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false })
    setCosts(data ?? [])
    setCostsLoading(false)
  }

  // ── Add handlers ────────────────────────────────────────────────────────────

  async function addLink() {
    if (!linkUrl.trim()) return
    setSavingLink(true)
    const { data } = await supabase
      .from('note_items')
      .insert({
        note_id: note.id,
        trip_id: tripId,
        type: 'link',
        label: linkLabel.trim() || null,
        url: linkUrl.trim(),
        order_index: items.length,
      })
      .select()
      .single()
    if (data) setItems(prev => [...prev, data])
    setLinkLabel(''); setLinkUrl(''); setAddingLink(false)
    setSavingLink(false)
  }

  async function addText() {
    if (!textContent.trim()) return
    setSavingText(true)
    const { data } = await supabase
      .from('note_items')
      .insert({
        note_id: note.id,
        trip_id: tripId,
        type: 'text',
        content: textContent.trim(),
        order_index: items.length,
      })
      .select()
      .single()
    if (data) setItems(prev => [...prev, data])
    setTextContent(''); setAddingText(false)
    setSavingText(false)
  }

  async function addCostRef() {
    if (!selectedCostId) return
    const cost = costs.find(c => c.id === selectedCostId)
    const label = cost
      ? `${cost.category} · ${cost.amount.toFixed(2)} ${cost.currency}`
      : selectedCostId
    setSavingCost(true)
    const { data } = await supabase
      .from('note_items')
      .insert({
        note_id: note.id,
        trip_id: tripId,
        type: 'cost_ref',
        cost_id: selectedCostId,
        label,
        order_index: items.length,
      })
      .select()
      .single()
    if (data) setItems(prev => [...prev, data])
    setSelectedCostId(''); setAddingCost(false)
    setSavingCost(false)
  }

  async function uploadImage(file: File) {
    setUploading(true)
    const safeName = file.name.replace(/\s+/g, '_')
    const path = `note-images/${note.id}/${Date.now()}-${safeName}`
    const { error } = await supabase.storage.from('attachments').upload(path, file)
    if (!error) {
      const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(path)
      const { data } = await supabase
        .from('note_items')
        .insert({
          note_id: note.id,
          trip_id: tripId,
          type: 'image',
          storage_path: path,
          file_url: urlData.publicUrl,
          file_name: file.name,
          order_index: items.length,
        })
        .select()
        .single()
      if (data) setItems(prev => [...prev, data])
    }
    setUploading(false)
  }

  async function deleteItem(item: MapNoteItem) {
    if (item.storage_path) {
      await supabase.storage.from('attachments').remove([item.storage_path])
    }
    await supabase.from('note_items').delete().eq('id', item.id)
    setItems(prev => prev.filter(i => i.id !== item.id))
  }

  // ── Derived lists ───────────────────────────────────────────────────────────
  const links    = items.filter(i => i.type === 'link')
  const images   = items.filter(i => i.type === 'image')
  const texts    = items.filter(i => i.type === 'text')
  const costRefs = items.filter(i => i.type === 'cost_ref')

  const toggle = (s: Section) => setOpen(prev => ({ ...prev, [s]: !prev[s] }))

  // ── Section header helper ───────────────────────────────────────────────────
  function SectionHeader({
    section, label, icon: Icon, count,
  }: { section: Section; label: string; icon: React.ElementType; count: number }) {
    return (
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors"
        onClick={() => toggle(section)}
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          <Icon className="w-3.5 h-3.5" />
          {label}
          {count > 0 && (
            <span className="bg-gray-100 text-gray-600 rounded-full px-1.5 py-px text-[10px] font-medium">{count}</span>
          )}
        </span>
        {open[section]
          ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
      </button>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="w-80 shrink-0 border-l border-gray-200 bg-white flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100">
        <div className={`w-3 h-3 rounded-full shrink-0 ${NOTE_DOT[note.color] ?? 'bg-yellow-400'}`} />
        <span className="flex-1 text-sm font-semibold text-gray-800 truncate">
          {note.content ? note.content.slice(0, 40) + (note.content.length > 40 ? '…' : '') : 'Note details'}
        </span>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">

          {/* ── LINKS ── */}
          <div>
            <SectionHeader section="links" label="Links" icon={Link2} count={links.length} />
            {open.links && (
              <div className="px-3 pb-2 space-y-1.5">
                {links.map(item => (
                  <div key={item.id} className="flex items-start gap-2 p-2 rounded-lg bg-gray-50 group">
                    <Link2 className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      {item.label && <p className="text-xs font-medium text-gray-700 truncate">{item.label}</p>}
                      <a
                        href={item.url!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-500 hover:underline truncate block"
                      >
                        {item.url}
                      </a>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <a href={item.url!} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-gray-200 text-gray-400">
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      {canEdit && (
                        <button onClick={() => deleteItem(item)} className="p-1 rounded hover:bg-red-100 text-gray-300 hover:text-red-500">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {canEdit && (
                  addingLink ? (
                    <div className="space-y-1.5 pt-1">
                      <input
                        autoFocus
                        value={linkLabel}
                        onChange={e => setLinkLabel(e.target.value)}
                        placeholder="Label (optional)"
                        className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                      <input
                        value={linkUrl}
                        onChange={e => setLinkUrl(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addLink()}
                        placeholder="https://…"
                        className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                      <div className="flex gap-1.5">
                        <button
                          onClick={addLink}
                          disabled={savingLink || !linkUrl.trim()}
                          className="flex-1 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-1"
                        >
                          {savingLink ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Add'}
                        </button>
                        <button onClick={() => { setAddingLink(false); setLinkLabel(''); setLinkUrl('') }} className="px-2 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingLink(true)}
                      className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 py-1 px-1"
                    >
                      <Plus className="w-3 h-3" /> Add link
                    </button>
                  )
                )}
              </div>
            )}
          </div>

          {/* ── IMAGES ── */}
          <div>
            <SectionHeader section="images" label="Images" icon={ImageIcon} count={images.length} />
            {open.images && (
              <div className="px-3 pb-2 space-y-1.5">
                {images.map(item => (
                  <div key={item.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 group">
                    {item.file_url ? (
                      <img
                        src={item.file_url}
                        alt={item.file_name ?? 'image'}
                        className="w-10 h-10 rounded object-cover shrink-0 border border-gray-200"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded bg-gray-200 flex items-center justify-center shrink-0">
                        <ImageIcon className="w-4 h-4 text-gray-400" />
                      </div>
                    )}
                    <span className="flex-1 text-xs text-gray-600 truncate min-w-0">{item.file_name ?? 'Image'}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.file_url && (
                        <a href={item.file_url} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-gray-200 text-gray-400">
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      {canEdit && (
                        <button onClick={() => deleteItem(item)} className="p-1 rounded hover:bg-red-100 text-gray-300 hover:text-red-500">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {canEdit && (
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (file) uploadImage(file)
                        e.target.value = ''
                      }}
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 py-1 px-1 disabled:opacity-60"
                    >
                      {uploading
                        ? <><Loader2 className="w-3 h-3 animate-spin" /> Uploading…</>
                        : <><Upload className="w-3 h-3" /> Upload image</>}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── TEXT NOTES ── */}
          <div>
            <SectionHeader section="texts" label="Text notes" icon={FileText} count={texts.length} />
            {open.texts && (
              <div className="px-3 pb-2 space-y-1.5">
                {texts.map(item => (
                  <div key={item.id} className="flex items-start gap-2 p-2 rounded-lg bg-gray-50 group">
                    <FileText className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                    <p className="flex-1 text-xs text-gray-700 whitespace-pre-wrap break-words min-w-0">{item.content}</p>
                    {canEdit && (
                      <button onClick={() => deleteItem(item)} className="p-1 rounded hover:bg-red-100 text-gray-300 hover:text-red-500 shrink-0">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}

                {canEdit && (
                  addingText ? (
                    <div className="space-y-1.5 pt-1">
                      <textarea
                        autoFocus
                        value={textContent}
                        onChange={e => setTextContent(e.target.value)}
                        placeholder="Write a note…"
                        rows={3}
                        className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                      />
                      <div className="flex gap-1.5">
                        <button
                          onClick={addText}
                          disabled={savingText || !textContent.trim()}
                          className="flex-1 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-1"
                        >
                          {savingText ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Add'}
                        </button>
                        <button onClick={() => { setAddingText(false); setTextContent('') }} className="px-2 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingText(true)}
                      className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 py-1 px-1"
                    >
                      <Plus className="w-3 h-3" /> Add text note
                    </button>
                  )
                )}
              </div>
            )}
          </div>

          {/* ── COST REFERENCES ── */}
          <div>
            <SectionHeader section="costs" label="Cost refs" icon={DollarSign} count={costRefs.length} />
            {open.costs && (
              <div className="px-3 pb-3 space-y-1.5">
                {costRefs.map(item => (
                  <div key={item.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
                    <DollarSign className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    <span className="flex-1 text-xs text-gray-700 min-w-0 truncate">
                      {item.label ?? item.cost_id}
                    </span>
                    {canEdit && (
                      <button onClick={() => deleteItem(item)} className="p-1 rounded hover:bg-red-100 text-gray-300 hover:text-red-500 shrink-0">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}

                {canEdit && (
                  addingCost ? (
                    <div className="space-y-1.5 pt-1">
                      {costsLoading ? (
                        <div className="flex items-center gap-1.5 text-xs text-gray-400 py-1">
                          <Loader2 className="w-3 h-3 animate-spin" /> Loading costs…
                        </div>
                      ) : costs.length === 0 ? (
                        <p className="text-xs text-gray-400 py-1">No costs recorded for this trip yet.</p>
                      ) : (
                        <select
                          autoFocus
                          value={selectedCostId}
                          onChange={e => setSelectedCostId(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                        >
                          <option value="">Select a cost…</option>
                          {costs.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.category} · {c.amount.toFixed(2)} {c.currency}
                            </option>
                          ))}
                        </select>
                      )}
                      <div className="flex gap-1.5">
                        <button
                          onClick={addCostRef}
                          disabled={savingCost || !selectedCostId}
                          className="flex-1 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-1"
                        >
                          {savingCost ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Link'}
                        </button>
                        <button onClick={() => { setAddingCost(false); setSelectedCostId('') }} className="px-2 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setAddingCost(true); loadCosts() }}
                      className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 py-1 px-1"
                    >
                      <Plus className="w-3 h-3" /> Link a cost
                    </button>
                  )
                )}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}
