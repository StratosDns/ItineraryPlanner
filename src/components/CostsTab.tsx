'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Cost, CostSplit, TripMemberWithProfile, Profile } from '@/types/database'
import { DollarSign, Plus, Trash2, Loader2, X, CheckCircle, Fuel } from 'lucide-react'
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
const FUEL_TYPES  = ['gasoline', 'diesel', 'lpg', 'electric', 'other']
const FUEL_UNITS  = ['L', 'gal', 'kWh'] as const
type FuelUnit = typeof FUEL_UNITS[number]

function priceLabel(unit: FuelUnit) {
  return unit === 'L' ? 'Price/L' : unit === 'gal' ? 'Price/gal' : 'Price/kWh'
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).format(amount)
}

function memberName(profile: Profile | null, userId: string) {
  return profile?.display_name ?? userId.slice(0, 8) + '…'
}

function FuelDetail({ c }: { c: Cost }) {
  if (c.category !== 'fuel' || (!c.fuel_liters && !c.fuel_type)) return null
  return (
    <div className="mt-1.5 flex flex-wrap gap-2 text-xs text-gray-500">
      {c.fuel_type && (
        <span className="inline-flex items-center gap-1">
          <Fuel className="w-3 h-3" />
          {c.fuel_type}
        </span>
      )}
      {c.fuel_liters != null && (
        <span>{c.fuel_liters} {c.fuel_unit ?? 'L'}</span>
      )}
      {c.fuel_price_per_unit != null && (
        <span>@ {c.fuel_price_per_unit} {c.currency}/{c.fuel_unit ?? 'L'}</span>
      )}
      {c.odometer != null && (
        <span>· {c.odometer} km</span>
      )}
    </div>
  )
}

export default function CostsTab({ tripId, members, currentUserId, canEdit }: Props) {
  const supabase = createClient()
  const [costs, setCosts] = useState<CostWithSplitsUI[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  // Base expense fields
  const [category, setCategory] = useState('other')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [paidBy, setPaidBy] = useState(currentUserId)
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal')
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  // Fuel-specific fields
  const [fuelLiters, setFuelLiters] = useState('')
  const [fuelPricePerUnit, setFuelPricePerUnit] = useState('')
  const [fuelTotalCost, setFuelTotalCost] = useState('')
  const [fuelUnit, setFuelUnit] = useState<FuelUnit>('L')
  const [fuelType, setFuelType] = useState('gasoline')
  const [odometer, setOdometer] = useState('')

  const isFuel = category === 'fuel'

  // Keep amount in sync with fuelTotalCost when category = fuel
  useEffect(() => {
    if (isFuel) setAmount(fuelTotalCost)
  }, [isFuel, fuelTotalCost])

  useEffect(() => { fetchCosts() }, [])

  useEffect(() => {
    const init: Record<string, string> = {}
    members.forEach(m => { init[m.user_id] = '' })
    setCustomSplits(init)
  }, [members])

  // Reset fuel fields when switching away from fuel
  useEffect(() => {
    if (!isFuel) {
      setFuelLiters(''); setFuelPricePerUnit(''); setFuelTotalCost('')
      setFuelUnit('L'); setFuelType('gasoline'); setOdometer('')
    }
  }, [isFuel])

  async function fetchCosts() {
    setLoading(true)
    const { data: costsData } = await supabase
      .from('costs')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false })

    if (!costsData) { setLoading(false); return }

    const splitsResults = await Promise.all(
      costsData.map(c =>
        supabase.from('cost_splits').select('*, profile:profiles(*)').eq('cost_id', c.id)
      )
    )

    setCosts(costsData.map((c, i) => ({
      ...c,
      splits: (splitsResults[i].data ?? []) as (CostSplit & { profile: Profile | null })[],
    })))
    setLoading(false)
  }

  // ── Fuel field cascade — any 2 known → compute the 3rd ─────────────────────
  function onLitersChange(val: string) {
    setFuelLiters(val)
    const l = parseFloat(val)
    const p = parseFloat(fuelPricePerUnit)
    const t = parseFloat(fuelTotalCost)
    if (val && fuelPricePerUnit && !isNaN(l) && !isNaN(p)) {
      const computed = (l * p).toFixed(2)
      setFuelTotalCost(computed)
      setAmount(computed)
    } else if (val && fuelTotalCost && !isNaN(l) && !isNaN(t)) {
      setFuelPricePerUnit((t / l).toFixed(4))
    }
  }

  function onPriceChange(val: string) {
    setFuelPricePerUnit(val)
    const p = parseFloat(val)
    const l = parseFloat(fuelLiters)
    const t = parseFloat(fuelTotalCost)
    if (val && fuelLiters && !isNaN(p) && !isNaN(l)) {
      const computed = (l * p).toFixed(2)
      setFuelTotalCost(computed)
      setAmount(computed)
    } else if (val && fuelTotalCost && !isNaN(p) && !isNaN(t)) {
      setFuelLiters((t / p).toFixed(3))
    }
  }

  function onTotalCostChange(val: string) {
    setFuelTotalCost(val)
    setAmount(val)
    const t = parseFloat(val)
    const l = parseFloat(fuelLiters)
    const p = parseFloat(fuelPricePerUnit)
    if (val && fuelLiters && !isNaN(t) && !isNaN(l)) {
      setFuelPricePerUnit((t / l).toFixed(4))
    } else if (val && fuelPricePerUnit && !isNaN(t) && !isNaN(p)) {
      setFuelLiters((t / p).toFixed(3))
    }
  }

  async function addCost(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const totalAmount = parseFloat(isFuel ? fuelTotalCost : amount)
    if (isNaN(totalAmount) || totalAmount <= 0) { setSaving(false); return }

    const costPayload = {
      trip_id: tripId,
      category,
      description: description.trim() || null,
      amount: totalAmount,
      currency,
      paid_by: paidBy,
      ...(isFuel ? {
        fuel_liters:         fuelLiters         ? parseFloat(fuelLiters)         : null,
        fuel_price_per_unit: fuelPricePerUnit   ? parseFloat(fuelPricePerUnit)   : null,
        fuel_unit:           fuelUnit,
        fuel_type:           fuelType,
        odometer:            odometer            ? parseFloat(odometer)           : null,
      } : {}),
    }

    const { data: cost } = await supabase.from('costs').insert(costPayload).select().single()
    if (!cost) { setSaving(false); return }

    const splits = members.map(m => {
      const share = splitMode === 'equal'
        ? totalAmount / members.length
        : parseFloat(customSplits[m.user_id] ?? '0') || 0
      return { cost_id: cost.id, user_id: m.user_id, share_amount: Math.round(share * 100) / 100 }
    })

    await supabase.from('cost_splits').insert(splits)

    const { data: newSplits } = await supabase
      .from('cost_splits').select('*, profile:profiles(*)').eq('cost_id', cost.id)

    setCosts(prev => [{
      ...cost,
      splits: (newSplits ?? []) as (CostSplit & { profile: Profile | null })[],
    }, ...prev])

    setSaving(false)
    setShowForm(false)
    resetForm()
  }

  function resetForm() {
    setDescription(''); setAmount(''); setCategory('other')
    setFuelLiters(''); setFuelPricePerUnit(''); setFuelTotalCost('')
    setFuelUnit('L'); setFuelType('gasoline'); setOdometer('')
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
      .eq('id', splitId).select().single()
    if (data) {
      setCosts(prev => prev.map(c =>
        c.id === costId
          ? { ...c, splits: c.splits.map(s => s.id === splitId ? { ...s, ...data } : s) }
          : c
      ))
    }
  }

  const balances: Record<string, number> = {}
  members.forEach(m => { balances[m.user_id] = 0 })
  costs.forEach(c => {
    balances[c.paid_by] = (balances[c.paid_by] ?? 0) + c.amount
    c.splits.forEach(s => {
      balances[s.user_id] = (balances[s.user_id] ?? 0) - s.share_amount
    })
  })

  const totalByCurrency = costs.reduce<Record<string, number>>((acc, c) => {
    acc[c.currency] = (acc[c.currency] ?? 0) + c.amount; return acc
  }, {})

  const inputCls = "w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"

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
            <button onClick={() => { setShowForm(false); resetForm() }}>
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          <form onSubmit={addCost} className="space-y-3">
            {/* Category + Paid by */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Category</label>
                <select value={category} onChange={e => setCategory(e.target.value)} className={inputCls + ' capitalize'}>
                  {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Paid by</label>
                <select value={paidBy} onChange={e => setPaidBy(e.target.value)} className={inputCls}>
                  {members.map(m => (
                    <option key={m.user_id} value={m.user_id}>{memberName(m.profile, m.user_id)}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Description</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={isFuel ? 'e.g. Fill-up highway A7' : 'e.g. Hotel night in Paris'}
                className={inputCls}
              />
            </div>

            {/* ── Fuel sub-fields ── */}
            {isFuel && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-3">
                <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
                  <Fuel className="w-3.5 h-3.5" /> Fuel details
                  <span className="font-normal text-amber-600">— fill any two, the third is computed</span>
                </p>

                {/* Fuel type + unit row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Fuel type</label>
                    <select value={fuelType} onChange={e => setFuelType(e.target.value)} className={inputCls + ' capitalize'}>
                      {FUEL_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Unit</label>
                    <select value={fuelUnit} onChange={e => setFuelUnit(e.target.value as FuelUnit)} className={inputCls}>
                      {FUEL_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>

                {/* The three interdependent fields */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Liters ({fuelUnit})</label>
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={fuelLiters}
                      onChange={e => onLitersChange(e.target.value)}
                      placeholder="0.000"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">{priceLabel(fuelUnit)}</label>
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={fuelPricePerUnit}
                      onChange={e => onPriceChange(e.target.value)}
                      placeholder="0.0000"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Total cost</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={fuelTotalCost}
                      onChange={e => onTotalCostChange(e.target.value)}
                      placeholder="0.00"
                      className={inputCls}
                    />
                  </div>
                </div>

                {/* Odometer */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Odometer (km) <span className="text-gray-400 font-normal">optional</span></label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={odometer}
                      onChange={e => setOdometer(e.target.value)}
                      placeholder="e.g. 45230"
                      className={inputCls}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Amount + currency (shown for non-fuel; for fuel, derived from fuelTotalCost) */}
            {!isFuel && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Amount</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0.00"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Currency</label>
                  <select value={currency} onChange={e => setCurrency(e.target.value)} className={inputCls}>
                    {['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            )}

            {/* Currency shown separately for fuel */}
            {isFuel && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Currency</label>
                  <select value={currency} onChange={e => setCurrency(e.target.value)} className={inputCls}>
                    {['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            )}

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

            {splitMode === 'equal' && (isFuel ? fuelTotalCost : amount) && (
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500">
                {members.map(m => (
                  <div key={m.user_id} className="flex justify-between">
                    <span>{memberName(m.profile, m.user_id)}</span>
                    <span className="font-medium">
                      {formatMoney(parseFloat(isFuel ? fuelTotalCost : amount) / members.length, currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {splitMode === 'custom' && (
              <div className="space-y-2">
                {members.map(m => (
                  <div key={m.user_id} className="flex items-center gap-2">
                    <span className="text-sm text-gray-600 flex-1">{memberName(m.profile, m.user_id)}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={customSplits[m.user_id] ?? ''}
                      onChange={e => setCustomSplits(prev => ({ ...prev, [m.user_id]: e.target.value }))}
                      placeholder="0.00"
                      className="w-24 text-sm border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => { setShowForm(false); resetForm() }}
                className="flex-1 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || (isFuel && !fuelTotalCost) || (!isFuel && !amount)}
                className="flex-1 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"
              >
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
                      <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                        c.category === 'fuel'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {c.category === 'fuel' && <Fuel className="w-3 h-3 inline mr-0.5" />}
                        {c.category}
                      </span>
                      <span className="font-semibold text-gray-900">{formatMoney(c.amount, c.currency)}</span>
                    </div>
                    {c.description && <p className="text-sm text-gray-600 mt-0.5">{c.description}</p>}
                    <FuelDetail c={c} />
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
                            className={s.settled ? 'text-green-500' : 'text-gray-300 hover:text-green-500'}
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
