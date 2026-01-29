import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Create Supabase client with service role key for admin operations
export function createSupabaseAdmin() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Create Supabase client with user's JWT for authenticated operations
export function createSupabaseClient(authHeader: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: authHeader },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Get user from JWT token
export async function getUserFromRequest(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw new Error('Missing authorization header');
  }

  const supabase = createSupabaseClient(authHeader);
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error('Invalid or expired token');
  }

  return { user, supabase };
}
