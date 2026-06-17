// GET /api/join/[token]
// Public endpoint — validates a token and returns trip info.
// Uses service role to bypass RLS (tokens are opaque credentials).
// Returns: { tripId, tripName, expiresAt, slotTaken, expired }

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  if (!token || token.length < 10) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  ) as any

  const { data: link, error } = await admin
    .from('trip_invite_links')
    .select('id, trip_id, expires_at, member_claimed_by, label')
    .eq('token', token)
    .single()

  if (error || !link) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 })
  }

  const typedLink = link as {
    id: string
    trip_id: string
    expires_at: string | null
    member_claimed_by: string | null
    label: string | null
  }

  const expired = typedLink.expires_at
    ? new Date(typedLink.expires_at) < new Date()
    : false

  // Fetch trip name
  const { data: trip } = await admin
    .from('trips')
    .select('title')
    .eq('id', typedLink.trip_id)
    .single()

  return NextResponse.json({
    tripId: typedLink.trip_id,
    tripName: (trip as { title: string } | null)?.title ?? 'Trip',
    expiresAt: typedLink.expires_at,
    slotTaken: !!typedLink.member_claimed_by,
    expired,
    label: typedLink.label,
  })
}
