'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FuelLog, Stop, FuelType, FuelUnit } from '@/types/database'
import { Fuel, Plus, Trash2, Loader2, X } from 'lucide-react'
import { format } from 'date-fns'

interface Props {
  tripId: string
  stops: Stop[]
  currentUserId: string
  canEdit: boolean
}

const FUEL_TYPES: { value: FuelType; label: string }[] = [
  { value: 'gasoline', label: '⛽ Gasoline' },
  { value: 'diesel',   label: '🛢 Diesel' },
  { value: 'lpg',      label: '🔵 LPG' },
  { value: 'electric', label: '⚡ Electric' },
  { value: 'other',    label: '🔧 Other' },
]

const FUEL_UNITS: { value: FuelUnit; label: string }[] = [
  { value: 'L',   label: 'Litres (L)' },
  { value: 'gal', label: 'Gallons (gal)' },
  { value: 'kWh', label: 'kWh' },
]

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD']

function formatCost(cost: number, currency: string) {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).format(cost)
}

export default function FuelTab({ tripId, stops, currentUserId, canEdit }: Props) {
  const supabase = createClient()
  const [logs, setLogs] = useState<FuelLog[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  // Form state
  const [fuelType, setFuelType] = useState<FuelType>('gasoline')
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState<FuelUnit>('L')
  const [cost, setCost] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [odometer, setOdometer] = useState('')
  const [notes, setNotes] = useState('')
  const [stopId, setStopId] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchLogs() }, [])

  async function fetchLogs() {
    setLoading(true)
    const { data } = await supabase
      .from('fuel_logs')
      .select('*')
      .eq('trip_id', tripId)
      .order('logged_at', { ascending: false })
    setLogs(data ?? [])
    setLoading(false)
  }

  async function addLog(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { data } = await supabase
      .from('fuel_logs')
      .insert({
        trip_id: tripId,
        fuel_type: fuelType,
        amount: parseFloat(amount),
        unit,
        cost: parseFloat(cost),
        currency,
        odometer: odometer ? parseFloat(odometer) : null,
        notes: notes.trim() || null,
        stop_id: stopId || null,
        logged_by: currentUserId,
      })
      .select()
      .single()

    if (data) setLogs(prev => [data, ...prev])
    setSaving(false)
    setShowForm(false)
    setAmount(''); setCost(''); setOdometer(''); setNotes(''); setStopId('')
  }

  async function deleteLog(id: string) {
    await supabase.from('fuel_logs').delete().eq('id', id)
    setLogs(prev => prev.filter(l => l.id !== id))
  }

  // Totals
  const totalCostByCurrency = logs.reduce<Record<string, number>>((acc, l) => {
    acc[l.currency] = (acc[l.currency] ?? 0) + l.cost
    return acc
  }, {})
  const totalVolume = logs.reduce((s, l) => s + l.amount, 0)

  const stopName = (id: string | null) =>
    id ? (stops.find(s => s.id === id)?.name ?? 'Unknown stop') : null

  return (
    <div className="max-w-2xl mx-auto p-6">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Refills</p>
          <p className="text-2xl font-bold text-gray-900">{logs.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Total volume</p>
          <p className="text-2xl font-bold text-gray-900">{totalVolume.toFixed(1)}<span className="text-sm font-normal text-gray-500 ml-1">units</span></p>
        </div>
        {Object.entries(totalCostByCurrency).map(([cur, total]) => (
          <div key={cur} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Total cost ({cur})</p>
            <p className="text-2xl font-bold text-gray-900">{formatCost(total, cur)}</p>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">Fuel log</h2>
        {canEdit && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> Add refill
          </button>
        )}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-gray-900">New refill</h3>
            <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-gray-400" /></button>
          </div>
          <form onSubmit={addLog} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Fuel type</label>
                <select
                  value={fuelType}
                  onChange={e => setFuelType(e.target.value as FuelType)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {FUEL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Unit</label>
                <select
                  value={unit}
                  onChange={e => setUnit(e.target.value as FuelUnit)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {FUEL_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Amount ({unit})</label>
                <input
                  type="number" required min="0" step="0.01"
                  value={amount} onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Odometer (km)</label>
                <input
                  type="number" min="0" step="0.1"
                  value={odometer} onChange={e => setOdometer(e.target.value)}
                  placeholder="optional"
                  className="w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Total cost</label>
                <input
                  type="number" required min="0" step="0.01"
                  value={cost} onChange={e => setCost(e.target.value)}
                  placeholder="0.00"
                  className="w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Currency</label>
                <select
                  value={currency}
                  onChange={e => setCurrency(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {stops.length > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">At stop (optional)</label>
                <select
                  value={stopId}
                  onChange={e => setStopId(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— No stop —</option>
                  {stops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Notes</label>
              <input
                type="text"
                value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Shell station on A1"
                className="w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={saving} className="flex-1 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Save
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Log list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Fuel className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No fuel logs yet</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {logs.map(log => (
            <li key={log.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                <Fuel className="w-4 h-4 text-orange-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900 capitalize">{log.fuel_type}</span>
                  <span className="text-sm text-gray-500">{log.amount} {log.unit}</span>
                  <span className="text-sm font-semibold text-gray-900">{formatCost(log.cost, log.currency)}</span>
                </div>
                <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                  <span>{format(new Date(log.logged_at), 'dd MMM yyyy, HH:mm')}</span>
                  {stopName(log.stop_id) && <span>· {stopName(log.stop_id)}</span>}
                  {log.odometer && <span>· {log.odometer} km</span>}
                </div>
                {log.notes && <p className="text-xs text-gray-500 mt-1">{log.notes}</p>}
              </div>
              {canEdit && (
                <button onClick={() => deleteLog(log.id)} className="p-1.5 text-gray-300 hover:text-red-500 shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
