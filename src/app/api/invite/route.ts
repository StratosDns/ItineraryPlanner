import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { Database } from '@/types/database'

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const body = await request.json()
  const { tripId, email, role } = body

  if (!tripId || !email || !role) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  if (!['editor', 'viewer'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  // Auth — verify requester is owner
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

  const { data: membership } = await supabase
    .from('trip_members')
    .select('role')
    .eq('trip_id', tripId)
    .eq('user_id', user.id)
    .single()

  if (membership?.role !== 'owner') {
    return NextResponse.json({ error: 'Only the owner can invite members' }, { status: 403 })
  }

  // Admin client to look up user by email
  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: { users }, error: listErr } = await admin.auth.admin.listUsers()
  if (listErr) return NextResponse.json({ error: 'Failed to look up user' }, { status: 500 })

  const target = users.find(u => u.email === email)
  if (!target) {
    return NextResponse.json({
      error: `No account found for ${email}. Ask them to register first.`
    }, { status: 404 })
  }

  // Check not already a member
  const { data: existing } = await supabase
    .from('trip_members')
    .select('id')
    .eq('trip_id', tripId)
    .eq('user_id', target.id)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'This user is already a member' }, { status: 409 })
  }

  // Add member
  const { data: member, error: insertErr } = await admin
    .from('trip_members')
    .insert({ trip_id: tripId, user_id: target.id, role, invited_by: user.id })
    .select('*, profile:profiles(*)')
    .single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({ member })
}
