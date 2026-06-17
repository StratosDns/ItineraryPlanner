// PATCH /api/invite-link/[id]  — update label
// DELETE /api/invite-link/[id] — revoke (delete) link
// Both require the caller to be the trip owner.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { Database } from '@/types/database'

async function getAdminAndUser(cookieStore: Awaited<ReturnType<typeof cookies>>) {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  ) as any

  return { user, admin }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const cookieStore = await cookies()
  const { user, admin } = await getAdminAndUser(cookieStore)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { label } = body as { label: string }

  // Fetch the link to verify ownership
  const { data: link } = await admin
    .from('trip_invite_links')
    .select('trip_id')
    .eq('id', id)
    .single()

  if (!link) return NextResponse.json({ error: 'Link not found' }, { status: 404 })

  const { data: membership } = await admin
    .from('trip_members')
    .select('role')
    .eq('trip_id', (link as { trip_id: string }).trip_id)
    .eq('user_id', user.id)
    .single()

  if ((membership as { role: string } | null)?.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: updated, error } = await admin
    .from('trip_invite_links')
    .update({ label })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: (error as { message: string }).message }, { status: 500 })
  return NextResponse.json({ link: updated })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const cookieStore = await cookies()
  const { user, admin } = await getAdminAndUser(cookieStore)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: link } = await admin
    .from('trip_invite_links')
    .select('trip_id')
    .eq('id', id)
    .single()

  if (!link) return NextResponse.json({ error: 'Link not found' }, { status: 404 })

  const { data: membership } = await admin
    .from('trip_members')
    .select('role')
    .eq('trip_id', (link as { trip_id: string }).trip_id)
    .eq('user_id', user.id)
    .single()

  if ((membership as { role: string } | null)?.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await admin.from('trip_invite_links').delete().eq('id', id)
  if (error) return NextResponse.json({ error: (error as { message: string }).message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
