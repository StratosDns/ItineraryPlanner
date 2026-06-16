'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TripMemberWithProfile, TripRole } from '@/types/database'
import { Users, Mail, Trash2, Loader2, Crown, Edit3, Eye } from 'lucide-react'

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

export default function MembersTab({ tripId, members: initialMembers, currentUserId, role }: Props) {
  const supabase = createClient()
  const [members, setMembers] = useState(initialMembers)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<TripRole>('editor')
  const [inviting, setInviting] = useState(false)
  const [inviteResult, setInviteResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const isOwner = role === 'owner'

  async function invite(e: React.FormEvent) {
    e.preventDefault()
    setInviteResult(null)
    setInviting(true)

    // Look up user by email via profiles
    // Note: in production use a secure server action or edge function
    // Here we query the profiles table — requires email to be stored there,
    // or use Supabase Admin API (service role) via an API route.
    // For now we surface a message guiding the user.
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
                  {roleIcon(m.role)}
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {m.profile?.display_name ?? 'Unknown user'}
                    {isMe && <span className="text-gray-400 font-normal ml-1">(you)</span>}
                  </span>
                </div>
                <p className="text-xs text-gray-400 truncate">
                  Joined {new Date(m.joined_at).toLocaleDateString()}
                </p>
              </div>

              <span className={roleBadge(m.role)}>{m.role}</span>

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
    </div>
  )
}
