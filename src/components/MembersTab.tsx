'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TripMemberWithProfile, TripRole } from '@/types/database'
import { Users, Mail, Trash2, Loader2, Crown, Edit3, Eye, Link2, Copy, Check, Pencil, X, Clock } from 'lucide-react'

interface InviteLink {
  id: string
  token: string
  label: string | null
  created_at: string
  expires_at: string | null
  member_claimed_by: string | null
}

interface Props {
  tripId: string
  members: TripMemberWithProfile[]
  currentUserId: string
  role: TripRole
}

function roleIcon(role: TripRole) {
  if (role === 'owner') return <Crown className="w-3.5 h-3.5 text-purple-500" />
  if (role === 'editor') return <Edit3 className="w-3.5 h-3.5 text-green-500" />
  return <Eye className="w-3.5 h-3.5 text-gray-400" />
}

function roleBadge(role: TripRole) {
  const base = 'text-xs px-2 py-0.5 rounded-full font-medium'
  if (role === 'owner') return `${base} bg-purple-100 text-purple-700`
  if (role === 'editor') return `${base} bg-green-100 text-green-700`
  return `${base} bg-gray-100 text-gray-600`
}

const EXPIRY_OPTIONS = [
  { label: 'No expiry', value: null },
  { label: '24 hours', value: 24 },
  { label: '7 days', value: 168 },
  { label: '30 days', value: 720 },
]

function linkStatus(link: InviteLink): { label: string; color: string } {
  const expired = link.expires_at && new Date(link.expires_at) < new Date()
  if (expired) return { label: 'Expired', color: 'text-red-500 bg-red-50' }
  if (link.member_claimed_by) return { label: 'Slot claimed', color: 'text-amber-600 bg-amber-50' }
  return { label: 'Active', color: 'text-green-600 bg-green-50' }
}

function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return 'No expiry'
  const d = new Date(expiresAt)
  const now = new Date()
  if (d < now) return `Expired ${d.toLocaleDateString()}`
  return `Expires ${d.toLocaleDateString()}`
}

export default function MembersTab({ tripId, members: initialMembers, currentUserId, role }: Props) {
  const supabase = createClient()
  const [members, setMembers] = useState(initialMembers)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<TripRole>('editor')
  const [inviting, setInviting] = useState(false)
  const [inviteResult, setInviteResult] = useState<{ ok: boolean; msg: string } | null>(null)

  // Invite links state
  const [links, setLinks] = useState<InviteLink[]>([])
  const [linksLoading, setLinksLoading] = useState(false)
  const [linkLabel, setLinkLabel] = useState('')
  const [linkExpiry, setLinkExpiry] = useState<number | null>(null)
  const [generating, setGenerating] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState('')

  const isOwner = role === 'owner'

  const loadLinks = useCallback(async () => {
    if (!isOwner) return
    setLinksLoading(true)
    const { data } = await supabase
      .from('trip_invite_links' as never)
      .select('id, token, label, created_at, expires_at, member_claimed_by')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false })
    setLinks((data as InviteLink[] | null) ?? [])
    setLinksLoading(false)
  }, [isOwner, supabase, tripId])

  useEffect(() => { loadLinks() }, [loadLinks])

  async function generateLink() {
    setGenerating(true)
    const res = await fetch('/api/invite-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId, label: linkLabel || null, expiresInHours: linkExpiry }),
    })
    if (res.ok) {
      setLinkLabel('')
      setLinkExpiry(null)
      await loadLinks()
    }
    setGenerating(false)
  }

  async function revokeLink(id: string) {
    if (!confirm('Revoke this link? Visitors will no longer be able to use it.')) return
    await fetch(`/api/invite-link/${id}`, { method: 'DELETE' })
    setLinks(prev => prev.filter(l => l.id !== id))
  }

  async function saveLabel(id: string) {
    await fetch(`/api/invite-link/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: editingLabel }),
    })
    setLinks(prev => prev.map(l => l.id === id ? { ...l, label: editingLabel } : l))
    setEditingLinkId(null)
  }

  function copyLink(link: InviteLink) {
    const url = `${window.location.origin}/join/${link.token}`
    navigator.clipboard.writeText(url)
    setCopiedId(link.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault()
    setInviteResult(null)
    setInviting(true)

    const res = await fetch('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId, email: inviteEmail, role: inviteRole }),
    })

    const json = await res.json()
    if (res.ok && json.member) {
      setMembers(prev => [...prev, json.member])
      setInviteEmail('')
      setInviteResult({ ok: true, msg: 'Member invited successfully' })
    } else {
      setInviteResult({ ok: false, msg: json.error ?? 'Invitation failed' })
    }
    setInviting(false)
  }

  async function updateRole(memberId: string, newRole: TripRole) {
    const { data } = await supabase
      .from('trip_members')
      .update({ role: newRole })
      .eq('id', memberId)
      .select('*, profile:profiles(*)')
      .single()
    if (data) {
      setMembers(prev => prev.map(m => m.id === memberId ? (data as TripMemberWithProfile) : m))
    }
  }

  async function removeMember(memberId: string) {
    if (!confirm('Remove this member?')) return
    await supabase.from('trip_members').delete().eq('id', memberId)
    setMembers(prev => prev.filter(m => m.id !== memberId))
  }

  return (
    <div className="max-w-lg mx-auto p-6">
      <div className="flex items-center gap-2 mb-6">
        <Users className="w-5 h-5 text-gray-500" />
        <h2 className="font-semibold text-gray-900">{members.length} member{members.length !== 1 ? 's' : ''}</h2>
      </div>

      {/* Invite form (owner only) */}
      {isOwner && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <h3 className="font-medium text-gray-900 mb-4">Invite member</h3>
          <form onSubmit={invite} className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Email address</label>
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="member@example.com"
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Role</label>
              <div className="flex gap-2">
                {(['editor', 'viewer'] as TripRole[]).map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setInviteRole(r)}
                    className={`flex-1 py-1.5 text-sm rounded-lg border capitalize transition-colors ${
                      inviteRole === r
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'border-gray-300 hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {inviteResult && (
              <p className={`text-sm px-3 py-2 rounded-lg ${
                inviteResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
              }`}>
                {inviteResult.msg}
              </p>
            )}

            <button
              type="submit"
              disabled={inviting}
              className="w-full py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {inviting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
              Send invite
            </button>
          </form>
        </div>
      )}

      {/* Members list */}
      <ul className="space-y-2">
        {members.map(m => {
          const isMe = m.user_id === currentUserId
          const isMemberOwner = m.role === 'owner'
          const canModify = isOwner && !isMe && !isMemberOwner

          return (
            <li key={m.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0 text-sm font-semibold text-gray-600">
                {(m.profile?.display_name ?? '?')[0].toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {roleIcon(m.role as TripRole)}
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {m.profile?.display_name ?? 'Unknown user'}
                    {isMe && <span className="text-gray-400 font-normal ml-1">(you)</span>}
                  </span>
                </div>
                <p className="text-xs text-gray-400 truncate">
                  Joined {new Date(m.joined_at).toLocaleDateString()}
                </p>
              </div>

              <span className={roleBadge(m.role as TripRole)}>{m.role}</span>

              {canModify && (
                <div className="flex items-center gap-1 shrink-0">
                  <select
                    value={m.role}
                    onChange={e => updateRole(m.id, e.target.value as TripRole)}
                    className="text-xs border border-gray-200 rounded-lg px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="editor">editor</option>
                    <option value="viewer">viewer</option>
                  </select>
                  <button
                    onClick={() => removeMember(m.id)}
                    className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {/* Viewer invite links (owner only) */}
      {isOwner && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-4">
            <Link2 className="w-4 h-4 text-gray-500" />
            <h3 className="font-semibold text-gray-900">Viewer links</h3>
            <span className="text-xs text-gray-400">— shareable, route-only access</span>
          </div>

          {/* Generate link form */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
            <h4 className="text-sm font-medium text-gray-900 mb-3">Generate new link</h4>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Label <span className="font-normal text-gray-400">(optional)</span></label>
                <input
                  type="text"
                  value={linkLabel}
                  onChange={e => setLinkLabel(e.target.value)}
                  placeholder="e.g. For Maria, Travel blog readers"
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Expiry</label>
                <div className="flex flex-wrap gap-2">
                  {EXPIRY_OPTIONS.map(opt => (
                    <button
                      key={String(opt.value)}
                      type="button"
                      onClick={() => setLinkExpiry(opt.value)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                        linkExpiry === opt.value
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={generateLink}
                disabled={generating}
                className="w-full py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                Generate link
              </button>
            </div>
          </div>

          {/* Links list */}
          {linksLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>
          ) : links.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No links yet</p>
          ) : (
            <ul className="space-y-2">
              {links.map(link => {
                const status = linkStatus(link)
                return (
                  <li key={link.id} className="bg-white border border-gray-200 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Label row */}
                        {editingLinkId === link.id ? (
                          <div className="flex items-center gap-1.5 mb-1">
                            <input
                              autoFocus
                              value={editingLabel}
                              onChange={e => setEditingLabel(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveLabel(link.id); if (e.key === 'Escape') setEditingLinkId(null) }}
                              className="text-sm border border-gray-300 rounded px-2 py-0.5 flex-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <button onClick={() => saveLabel(link.id)} className="text-blue-600 hover:text-blue-700"><Check className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setEditingLinkId(null)} className="text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-sm font-medium text-gray-900">
                              {link.label ?? <span className="text-gray-400 italic">No label</span>}
                            </span>
                            <button
                              onClick={() => { setEditingLinkId(link.id); setEditingLabel(link.label ?? '') }}
                              className="text-gray-300 hover:text-gray-500"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        )}

                        {/* Meta row */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${status.color}`}>
                            {status.label}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <Clock className="w-3 h-3" />
                            {formatExpiry(link.expires_at)}
                          </span>
                          <span className="text-xs text-gray-300 font-mono">
                            {link.token.slice(0, 8)}…
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => copyLink(link)}
                          title="Copy link"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          {copiedId === link.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => revokeLink(link.id)}
                          title="Revoke link"
                          className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
