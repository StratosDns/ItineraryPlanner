// POST /api/invite-link
// Creates a new viewer invite link for a trip. Owner only.
// Body: { tripId: string, label?: string, expiresInHours?: number | null }

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { Database } from '@/types/database'

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const body = await request.json()
  const { tripId, label, expiresInHours } = body as {
    tripId: string
    label?: string
    expiresInHours?: number | null
  }

  if (!tripId) {
    return NextResponse.json({ error: 'Missing tripId' }, { status: 400 })
  }

  // Verify caller is authenticated
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  ) as any

  // Verify owner
  const { data: membership } = await admin
    .from('trip_members')
    .select('role')
    .eq('trip_id', tripId)
    .eq('user_id', user.id)
    .single()

  if ((membership as { role: string } | null)?.role !== 'owner') {
    return NextResponse.json({ error: 'Only the trip owner can generate invite links' }, { status: 403 })
  }

  const expiresAt = expiresInHours
    ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString()
    : null

  const { data: link, error } = await admin
    .from('trip_invite_links')
    .insert({
      trip_id: tripId,
      created_by: user.id,
      label: label ?? null,
      expires_at: expiresAt,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: (error as { message: string }).message }, { status: 500 })
  }

  return NextResponse.json({ link })
}
