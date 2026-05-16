import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

/**
 * Build a per-request supabase client using the caller's JWT, plus a service-role
 * client for log writes. Returns user_id derived from the JWT.
 */
export async function authedContext(req: Request): Promise<{
  userId: string;
  user: { id: string; email: string | null };
  userClient: SupabaseClient;
  adminClient: SupabaseClient;
}> {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    throw new Response(JSON.stringify({ error: 'missing bearer token' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const adminClient = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) {
    throw new Response(JSON.stringify({ error: 'invalid session' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  return {
    userId: data.user.id,
    user: { id: data.user.id, email: data.user.email ?? null },
    userClient,
    adminClient,
  };
}
