import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import TripClient from '@/components/TripClient'
import type { TripRole, TripMemberWithProfile } from '@/types/database'

interface Props {
  params: Promise<{ tripId: string }>
}

export default async function TripPage({ params }: Props) {
  const { tripId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Verify membership
  const { data: membership } = await supabase
    .from('trip_members')
    .select('role')
    .eq('trip_id', tripId)
    .eq('user_id', user.id)
    .single()

  if (!membership) notFound()

  const { data: trip } = await supabase
    .from('trips')
    .select('*')
    .eq('id', tripId)
    .single()

  if (!trip) notFound()

  const { data: stops } = await supabase
    .from('stops')
    .select('*')
    .eq('trip_id', tripId)
    .order('order_index', { ascending: true })

  const { data: members } = await supabase
    .from('trip_members')
    .select('*, profile:profiles(*)')
    .eq('trip_id', tripId)

  return (
    <TripClient
      trip={trip}
      initialStops={stops ?? []}
      members={(members ?? []) as TripMemberWithProfile[]}
      currentUserId={user.id}
      role={membership.role as TripRole}
    />
  )
}
