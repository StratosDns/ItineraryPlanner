'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Cost, CostSplit, TripMemberWithProfile, Profile } from '@/types/database'
import { DollarSign, Plus, Trash2, Loader2, X, CheckCircle } from 'lucide-react'
import { format } from 'date-fns'

interface Props {
  tripId: string
  members: TripMemberWithProfile[]
  currentUserId: string
  canEdit: boolean
}

interface CostWithSplitsUI extends Cost {
  splits: (CostSplit & { profile: Profile | null })[]
}

const CATEGORIES = ['accommodation', 'food', 'transport', 'fuel', 'activity', 'shopping', 'other']

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).format(amount)
}

function memberName(profile: Profile | null, userId: string) {
  return profile?.display_name ?? userId.slice(0, 8) + '…'
}

export default function CostsTab({ tripId, members, currentUserId, canEdit }: Props) {
  const supabase = createClient()
  const [costs, setCosts] = useState<CostWithSplitsUI[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  // Form
  const [category, setCategory] = useState('other')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [paidBy, setPaidBy] = useState(currentUserId)
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal')
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchCosts() }, [])

  // Reset custom splits when members change
  useEffect(() => {
    const init: Record<string, string> = {}
    members.forEach(m => { init[m.user_id] = '' })
    setCustomSplits(init)
  }, [members])

  async function fetchCosts() {
    setLoading(true)
    const { data: costsData } = await supabase
      .from('costs')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false })

    if (!costsData) { setLoading(false); return }

    // Fetch splits with profile
    const splitsResults = await Promise.all(
      costsData.map(c =>
        supabase
          .from('cost_splits')
          .select('*, profile:profiles(*)')
          .eq('cost_id', c.id)
      )
    )

    setCosts(costsData.map((c, i) => ({
      ...c,
      splits: (splitsResults[i].data ?? []) as (CostSplit & { profile: Profile | null })[],
    })))
    setLoading(false)
  }

  async function addCost(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const totalAmount = parseFloat(amount)
    const { data: cost } = await supabase
      .from('costs')
      .insert({ trip_id: tripId, category, description: description.trim() || null, amount: totalAmount, currency, paid_by: paidBy })
      .select()
      .single()

    if (!cost) { setSaving(false); return }

    // Build splits
    const splits = members.map(m => {
      const share = splitMode === 'equal'
        ? totalAmount / members.length
        : parseFloat(customSplits[m.user_id] ?? '0') || 0
      return { cost_id: cost.id, user_id: m.user_id, share_amount: Math.round(share * 100) / 100 }
    })

    await supabase.from('cost_splits').insert(splits)

    // Fetch the created splits with profiles
    const { data: newSplits } = await supabase
      .from('cost_splits')
      .select('*, profile:profiles(*)')
      .eq('cost_id', cost.id)

    setCosts(prev => [{
      ...cost,
      splits: (newSplits ?? []) as (CostSplit & { profile: Profile | null })[],
    }, ...prev])

    setSaving(false)
    setShowForm(false)
    setDescription(''); setAmount(''); setCategory('other')
  }

  async function deleteCost(id: string) {
    await supabase.from('cost_splits').delete().eq('cost_id', id)
    await supabase.from('costs').delete().eq('id', id)
    setCosts(prev => prev.filter(c => c.id !== id))
  }

  async function toggleSettled(splitId: string, costId: string, current: boolean) {
    const { data } = await supabase
      .from('cost_splits')
      .update({ settled: !current, settled_at: !current ? new Date().toISOString() : null })
      .eq('id', splitId)
      .select()
      .single()
    if (data) {
      setCosts(prev => prev.map(c =>
        c.id === costId
          ? { ...c, splits: c.splits.map(s => s.id === splitId ? { ...s, ...data } : s) }
          : c
      ))
    }
  }

  // Balance computation: who owes who
  const balances: Record<string, number> = {}
  members.forEach(m => { balances[m.user_id] = 0 })
  costs.forEach(c => {
    // Payer gets credited
    balances[c.paid_by] = (balances[c.paid_by] ?? 0) + c.amount
    // Each split debts their share
    c.splits.forEach(s => {
      balances[s.user_id] = (balances[s.user_id] ?? 0) - s.share_amount
    })
  })

  const totalByCurrency = costs.reduce<Record<string, number>>((acc, c) => {
    acc[c.currency] = (acc[c.currency] ?? 0) + c.amount; return acc
  }, {})

  return (
    <div className="max-w-2xl mx-auto p-6">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Expenses</p>
          <p className="text-2xl font-bold">{costs.length}</p>
        </div>
        {Object.entries(totalByCurrency).map(([cur, tot]) => (
          <div key={cur} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Total ({cur})</p>
            <p className="text-2xl font-bold">{formatMoney(tot, cur)}</p>
          </div>
        ))}
      </div>

      {/* Balances */}
      {members.length > 1 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Balances</h3>
          <div className="space-y-1.5">
            {members.map(m => {
              const bal = balances[m.user_id] ?? 0
              return (
                <div key={m.user_id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{memberName(m.profile, m.user_id)}</span>
                  <span className={`font-semibold ${bal > 0 ? 'text-green-600' : bal < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                    {bal > 0 ? '+' : ''}{bal.toFixed(2)}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-gray-400 mt-3">Positive = owed money back · Negative = owes money</p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">Expenses</h2>
        {canEdit && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> Add expense
          </button>
        )}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium">New expense</h3>
            <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-gray-400" /></button>
          </div>
          <form onSubmit={addCost} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Category</label>
                <select value={category} onChange={e => setCategory(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 capitalize">
                  {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Paid by</label>
                <select value={paidBy} onChange={e => setPaidBy(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {members.map(m => (
                    <option key={m.user_id} value={m.user_id}>{memberName(m.profile, m.user_id)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Description</label>
              <input type="text" value={description} onChange={e => setDescription(e.target.value)}
                placeholder="e.g. Hotel night in Paris"
                className="w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Amount</label>
                <input type="number" required min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Currency</label>
                <select value={currency} onChange={e => setCurrency(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Split mode */}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Split</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setSplitMode('equal')}
                  className={`flex-1 py-1.5 text-sm rounded-lg border transition-colors ${splitMode === 'equal' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:bg-gray-50'}`}>
                  Equal
                </button>
                <button type="button" onClick={() => setSplitMode('custom')}
                  className={`flex-1 py-1.5 text-sm rounded-lg border transition-colors ${splitMode === 'custom' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:bg-gray-50'}`}>
                  Custom
                </button>
              </div>
            </div>

            {splitMode === 'equal' && amount && (
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500">
                {members.map(m => (
                  <div key={m.user_id} className="flex justify-between">
                    <span>{memberName(m.profile, m.user_id)}</span>
                    <span className="font-medium">{formatMoney(parseFloat(amount || '0') / members.length, currency)}</span>
                  </div>
                ))}
              </div>
            )}

            {splitMode === 'custom' && (
              <div className="space-y-2">
                {members.map(m => (
                  <div key={m.user_id} className="flex items-center gap-2">
                    <span className="text-sm text-gray-600 flex-1">{memberName(m.profile, m.user_id)}</span>
                    <input type="number" min="0" step="0.01"
                      value={customSplits[m.user_id] ?? ''}
                      onChange={e => setCustomSplits(prev => ({ ...prev, [m.user_id]: e.target.value }))}
                      placeholder="0.00"
                      className="w-24 text-sm border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 text-right" />
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={saving} className="flex-1 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Save
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Costs list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
      ) : costs.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <DollarSign className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No expenses yet</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {costs.map(c => {
            const payer = members.find(m => m.user_id === c.paid_by)
            return (
              <li key={c.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full text-gray-600 capitalize">{c.category}</span>
                      <span className="font-semibold text-gray-900">{formatMoney(c.amount, c.currency)}</span>
                    </div>
                    {c.description && <p className="text-sm text-gray-600 mt-0.5">{c.description}</p>}
                    <p className="text-xs text-gray-400 mt-0.5">
                      Paid by {memberName(payer?.profile ?? null, c.paid_by)} · {format(new Date(c.created_at), 'dd MMM yyyy')}
                    </p>
                  </div>
                  {canEdit && (
                    <button onClick={() => deleteCost(c.id)} className="p-1.5 text-gray-300 hover:text-red-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Splits */}
                {c.splits.length > 0 && (
                  <div className="border-t border-gray-100 pt-2 mt-2 space-y-1">
                    {c.splits.map(s => (
                      <div key={s.id} className="flex items-center justify-between text-xs">
                        <span className={`text-gray-600 ${s.settled ? 'line-through text-gray-400' : ''}`}>
                          {memberName(s.profile, s.user_id)}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className={s.settled ? 'text-gray-400 line-through' : 'text-gray-700 font-medium'}>
                            {formatMoney(s.share_amount, c.currency)}
                          </span>
                          <button
                            onClick={() => toggleSettled(s.id, c.id, s.settled)}
                            title={s.settled ? 'Mark unsettled' : 'Mark settled'}
                            className={`${s.settled ? 'text-green-500' : 'text-gray-300 hover:text-green-500'}`}
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
