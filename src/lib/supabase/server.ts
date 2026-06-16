import { createServerClient, type CookieMethodsServer } from '@supabase/ssr'
import { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { Database } from '@/types/database'

type CookieToSet = Parameters<NonNullable<CookieMethodsServer['setAll']>>[0][number]

// Explicit return type required: createServerClient<Database> loses its generic
// under Next.js 16 strict TypeScript, causing all .from() calls to infer `never`.
// The cast restores correct inference for every server component that calls this.
export async function createClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component - cookies are read-only; middleware refreshes session.
          }
        },
      },
    }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any as SupabaseClient<Database>
}
