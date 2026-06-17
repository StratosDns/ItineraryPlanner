import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'
  const joinToken = searchParams.get('joinToken')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // If there's a joinToken, claim the member slot before redirecting
      if (joinToken) {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const admin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
          ) as any

          const { data: link } = await admin
            .from('trip_invite_links')
            .select('id, trip_id, expires_at, member_claimed_by, role')
            .eq('token', joinToken)
            .single()

          if (link) {
            const typedLink = link as {
              id: string
              trip_id: string
              expires_at: string | null
              member_claimed_by: string | null
              role: string
            }

            const expired = typedLink.expires_at && new Date(typedLink.expires_at) < new Date()

            if (!expired && !typedLink.member_claimed_by) {
              // Check not already a member
              const { data: existing } = await admin
                .from('trip_members')
                .select('id')
                .eq('trip_id', typedLink.trip_id)
                .eq('user_id', user.id)
                .maybeSingle()

              if (!existing) {
                await admin.from('trip_members').insert({
                  trip_id: typedLink.trip_id,
                  user_id: user.id,
                  role: typedLink.role,
                  invited_by: null,
                })
              }

              await admin
                .from('trip_invite_links')
                .update({ member_claimed_by: user.id, member_claimed_at: new Date().toISOString() })
                .eq('id', typedLink.id)

              return NextResponse.redirect(`${origin}/trips/${typedLink.trip_id}`)
            }

            // Slot taken or expired — redirect to landing page with message
            return NextResponse.redirect(`${origin}/join/${joinToken}?claimed=true`)
          }
        }
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
