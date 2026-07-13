import { createClient } from '@supabase/supabase-js'

// Fall back to a harmless placeholder so module load (and Next.js static
// prerendering during `next build`) never throws when the env vars are absent.
// Real values are inlined at build time from NEXT_PUBLIC_* for deployment, and
// read from .env.local during `next dev`. See .env.example.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

if (
  typeof window !== 'undefined' &&
  (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
) {
  // eslint-disable-next-line no-console
  console.warn('[supabase] NEXT_PUBLIC_SUPABASE_URL / ANON_KEY not set — auth is disabled. See .env.example.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
