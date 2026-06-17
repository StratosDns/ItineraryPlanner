// GET /api/join/[token]/trip-data
// Returns routes + stops (public fields only) for a valid, unexpired token.
// No auth required — token is the credential.
// Strips: notes, route_notes (viewer restriction).

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  ) as any

  // Validate token
  const { data: link, error: linkErr } = await admin
    .from('trip_invite_links')
    .select('trip_id, expires_at')
    .eq('token', token)
    .single()

  if (linkErr || !link) {
    return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  }

  const typedLink = link as { trip_id: string; expires_at: string | null }

  if (typedLink.expires_at && new Date(typedLink.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Link expired', expired: true }, { status: 410 })
  }

  // Fetch trip
  const { data: trip } = await admin
    .from('trips')
    .select('id, title, description')
    .eq('id', typedLink.trip_id)
    .single()

  // Fetch routes (ordered)
  const { data: routes } = await admin
    .from('routes')
    .select('id, name, order_index')
    .eq('trip_id', typedLink.trip_id)
    .order('order_index', { ascending: true })

  // Fetch stops — exclude notes and route_notes
  const { data: stops } = await admin
    .from('stops')
    .select('id, route_id, trip_id, order_index, name, address, lat, lng, created_at')
    .eq('trip_id', typedLink.trip_id)
    .order('order_index', { ascending: true })

  // Fetch map_notes (sticky notes are visible to viewers per spec)
  const { data: mapNotes } = await admin
    .from('map_notes')
    .select('id, route_id, lat, lng, content, color, created_at')
    .eq('trip_id', typedLink.trip_id)

  return NextResponse.json({
    trip,
    routes: routes ?? [],
    stops: stops ?? [],
    mapNotes: mapNotes ?? [],
  })
}
