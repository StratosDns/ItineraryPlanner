'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Map, DollarSign, Users } from 'lucide-react'
import { Trip, TripMemberWithProfile, TripRole, TripRouteWithCreator } from '@/types/database'
import StopsTab from '@/components/stops/StopsTab'
import CostsTab from '@/components/CostsTab'
import MembersTab from '@/components/MembersTab'

interface Props {
  trip: Trip
  initialRoutes: TripRouteWithCreator[]
  members: TripMemberWithProfile[]
  currentUserId: string
  role: TripRole
}

type Tab = 'route' | 'costs' | 'members'

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'route',   label: 'Route',   icon: Map },
  { id: 'costs',   label: 'Costs',   icon: DollarSign },
  { id: 'members', label: 'Members', icon: Users },
]

export default function TripClient({ trip, initialRoutes, members, currentUserId, role }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('route')
  const canEdit = role === 'owner' || role === 'editor'

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4">
          <div className="h-14 flex items-center gap-3">
            <Link href="/dashboard" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex-1 min-w-0">
              <h1 className="font-semibold text-gray-900 truncate">{trip.title}</h1>
              {trip.description && (
                <p className="text-xs text-gray-500 truncate">{trip.description}</p>
              )}
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
              role === 'owner' ? 'bg-purple-100 text-purple-700'
              : role === 'editor' ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-600'
            }`}>{role}</span>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 pb-0">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Tab content */}
      <div className="flex-1">
        {activeTab === 'route' && (
          <StopsTab
            tripId={trip.id}
            initialRoutes={initialRoutes}
            canEdit={canEdit}
            currentUserId={currentUserId}
          />
        )}
        {activeTab === 'costs' && (
          <CostsTab
            tripId={trip.id}
            members={members}
            currentUserId={currentUserId}
            canEdit={canEdit}
          />
        )}
        {activeTab === 'members' && (
          <MembersTab
            tripId={trip.id}
            members={members}
            currentUserId={currentUserId}
            role={role}
          />
        )}
      </div>
    </div>
  )
}
