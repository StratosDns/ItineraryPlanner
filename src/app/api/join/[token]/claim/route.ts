// POST /api/join/[token]/claim
// Claims the member slot on a link for the authenticated user.
// Called after signup when joinToken cookie is present.
// Returns: { tripId } on success
// Fails gracefully if slot already claimed — returns slotTaken: true.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { Database } from '@/types/database'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const cookieStore = await cookies()

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

  const { data: link, error: fetchErr } = await admin
    .from('trip_invite_links')
    .select('id, trip_id, expires_at, member_claimed_by, role')
    .eq('token', token)
    .single()

  if (fetchErr || !link) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 })
  }

  const typedLink = link as {
    id: string
    trip_id: string
    expires_at: string | null
    member_claimed_by: string | null
    role: string
  }

  // Check expiry
  if (typedLink.expires_at && new Date(typedLink.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This link has expired', expired: true }, { status: 410 })
  }

  // Check if slot already claimed
  if (typedLink.member_claimed_by) {
    return NextResponse.json({ slotTaken: true, tripId: typedLink.trip_id }, { status: 409 })
  }

  // Check if user is already a member (e.g. also has a direct invite)
  const { data: existing } = await admin
    .from('trip_members')
    .select('id')
    .eq('trip_id', typedLink.trip_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!existing) {
    // Add as viewer
    const { error: insertErr } = await admin
      .from('trip_members')
      .insert({
        trip_id: typedLink.trip_id,
        user_id: user.id,
        role: typedLink.role,
        invited_by: null,
      })

    if (insertErr) {
      return NextResponse.json({ error: (insertErr as { message: string }).message }, { status: 500 })
    }
  }

  // Mark slot claimed
  await admin
    .from('trip_invite_links')
    .update({ member_claimed_by: user.id, member_claimed_at: new Date().toISOString() })
    .eq('id', typedLink.id)

  return NextResponse.json({ ok: true, tripId: typedLink.trip_id })
}
