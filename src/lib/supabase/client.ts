import { createBrowserClient } from '@supabase/ssr'
import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'

// Same generic-loss issue as server.ts — explicit return type restores .from() inference.
export function createClient(): SupabaseClient<Database> {
  const client = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return client as unknown as SupabaseClient<Database>
}
