import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function assertEnv(name, value) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

export function createAnonSupabaseClient() {
  assertEnv('SUPABASE_URL', supabaseUrl);
  assertEnv('SUPABASE_ANON_KEY', supabaseAnonKey);

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export function createServiceSupabaseClient() {
  assertEnv('SUPABASE_URL', supabaseUrl);
  assertEnv('SUPABASE_SERVICE_ROLE_KEY', supabaseServiceRoleKey);

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export function extractBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}
