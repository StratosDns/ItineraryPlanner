// /join/[token] — Landing page for invite links
// Server-rendered. Validates token via service role.
// Shows 2 options: Continue as visitor / Create account & join

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { MapPin, Eye, UserPlus, AlertCircle, Clock } from 'lucide-react'

interface LinkData {
  tripId: string
  tripName: string
  expiresAt: string | null
  slotTaken: boolean
  expired: boolean
}

async function fetchLinkData(token: string): Promise<LinkData | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  ) as any

  const { data: link, error } = await admin
    .from('trip_invite_links')
    .select('trip_id, expires_at, member_claimed_by')
    .eq('token', token)
    .single()

  if (error || !link) return null

  const typedLink = link as {
    trip_id: string
    expires_at: string | null
    member_claimed_by: string | null
  }

  const expired = typedLink.expires_at
    ? new Date(typedLink.expires_at) < new Date()
    : false

  const { data: trip } = await admin
    .from('trips')
    .select('title')
    .eq('id', typedLink.trip_id)
    .single()

  return {
    tripId: typedLink.trip_id,
    tripName: (trip as { title: string } | null)?.title ?? 'Trip',
    expiresAt: typedLink.expires_at,
    slotTaken: !!typedLink.member_claimed_by,
    expired,
  }
}

function formatExpiry(expiresAt: string): string {
  const d = new Date(expiresAt)
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  const diffH = Math.floor(diffMs / (1000 * 60 * 60))
  const diffD = Math.floor(diffH / 24)
  if (diffD > 1) return `Expires in ${diffD} days`
  if (diffH > 1) return `Expires in ${diffH} hours`
  return `Expires soon`
}

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ claimed?: string }>
}) {
  const { token } = await params
  const { claimed } = await searchParams
  const data = await fetchLinkData(token)

  // Check if current user is authenticated (for slot claiming without signup)
  let currentUserId: string | null = null
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    currentUserId = user?.id ?? null
  } catch {
    // not authenticated — fine
  }

  // Invalid token
  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex items-center gap-2 mb-8">
            <MapPin className="w-7 h-7 text-blue-600" />
            <span className="text-xl font-bold text-gray-900">RouteForge</span>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-8">
            <AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <h1 className="text-lg font-semibold text-gray-900 mb-2">Link not found</h1>
            <p className="text-sm text-gray-500">This invite link is invalid or has been revoked.</p>
          </div>
        </div>
      </div>
    )
  }

  // Expired
  if (data.expired) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex items-center gap-2 mb-8">
            <MapPin className="w-7 h-7 text-blue-600" />
            <span className="text-xl font-bold text-gray-900">RouteForge</span>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-8">
            <Clock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <h1 className="text-lg font-semibold text-gray-900 mb-2">Link expired</h1>
            <p className="text-sm text-gray-500">
              This invite link has expired. Ask the trip owner for a new one.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <MapPin className="w-7 h-7 text-blue-600" />
            <span className="text-xl font-bold text-gray-900">RouteForge</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-8">
          <div className="text-center mb-6">
            <p className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">
              You&apos;ve been invited to view
            </p>
            <h1 className="text-2xl font-bold text-gray-900">{data.tripName}</h1>
            {data.expiresAt && (
              <p className="text-xs text-gray-400 mt-1">{formatExpiry(data.expiresAt)}</p>
            )}
          </div>

          {/* Slot-taken message after redirect from callback */}
          {claimed === 'true' && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-amber-50 border border-amber-100 text-sm text-amber-700">
              The member slot for this link was already claimed. You can still view the trip as a visitor.
            </div>
          )}

          <div className="space-y-3">
            {/* Continue as visitor */}
            <Link
              href={`/viewer/${token}`}
              className="flex items-center gap-4 w-full rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:bg-blue-50 transition-colors group text-left"
            >
              <div className="w-10 h-10 rounded-full bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center shrink-0 transition-colors">
                <Eye className="w-5 h-5 text-gray-500 group-hover:text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Continue as visitor</p>
                <p className="text-xs text-gray-500 mt-0.5">View the route without an account</p>
              </div>
            </Link>

            {/* Sign up / claim slot */}
            {data.slotTaken ? (
              <div className="flex items-center gap-4 w-full rounded-xl border border-gray-100 p-4 bg-gray-50 opacity-70">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                  <UserPlus className="w-5 h-5 text-gray-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-500">Member slot taken</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Someone already joined via this link. Ask the owner for a direct invite.
                  </p>
                </div>
              </div>
            ) : currentUserId ? (
              // Authenticated user — claim slot via Server Action (inline logic, no internal fetch)
              <form
                action={async () => {
                  'use server'
                  const supabase = await createClient()
                  const { data: { user } } = await supabase.auth.getUser()
                  if (!user) redirect('/login')

                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const admin = createAdminClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.SUPABASE_SERVICE_ROLE_KEY!
                  ) as any

                  const { data: lnk } = await admin
                    .from('trip_invite_links')
                    .select('id, trip_id, expires_at, member_claimed_by, role')
                    .eq('token', token)
                    .single()

                  if (!lnk) redirect(`/join/${token}`)

                  const typedLnk = lnk as { id: string; trip_id: string; expires_at: string | null; member_claimed_by: string | null; role: string }
                  if (typedLnk.member_claimed_by) redirect(`/join/${token}?claimed=true`)
                  if (typedLnk.expires_at && new Date(typedLnk.expires_at) < new Date()) redirect(`/join/${token}`)

                  const { data: existing } = await admin
                    .from('trip_members')
                    .select('id')
                    .eq('trip_id', typedLnk.trip_id)
                    .eq('user_id', user.id)
                    .maybeSingle()

                  if (!existing) {
                    await admin.from('trip_members').insert({
                      trip_id: typedLnk.trip_id,
                      user_id: user.id,
                      role: typedLnk.role,
                      invited_by: null,
                    })
                  }

                  await admin
                    .from('trip_invite_links')
                    .update({ member_claimed_by: user.id, member_claimed_at: new Date().toISOString() })
                    .eq('id', typedLnk.id)

                  redirect(`/trips/${typedLnk.trip_id}`)
                }}
              >
                <button
                  type="submit"
                  className="flex items-center gap-4 w-full rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:bg-blue-50 transition-colors group text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-blue-600 group-hover:bg-blue-700 flex items-center justify-center shrink-0 transition-colors">
                    <UserPlus className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Join as viewer</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Add this trip to your account
                    </p>
                  </div>
                </button>
              </form>
            ) : (
              <Link
                href={`/register?joinToken=${token}`}
                className="flex items-center gap-4 w-full rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:bg-blue-50 transition-colors group text-left"
              >
                <div className="w-10 h-10 rounded-full bg-blue-600 group-hover:bg-blue-700 flex items-center justify-center shrink-0 transition-colors">
                  <UserPlus className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Create account &amp; join</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Sign up to join this trip as a viewer
                  </p>
                </div>
              </Link>
            )}
          </div>

          {!currentUserId && (
            <p className="text-center text-xs text-gray-400 mt-6">
              Already have an account?{' '}
              <Link
                href={`/login?next=/join/${token}`}
                className="text-blue-600 hover:underline"
              >
                Sign in
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
