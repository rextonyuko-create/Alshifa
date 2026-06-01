import { createAnonSupabaseClient, createServiceSupabaseClient } from './_supabase.js';

function resolveEmail(input) {
  const value = String(input || '').trim().toLowerCase();
  if (!value) {
    return '';
  }
  if (value.includes('@')) {
    return value;
  }
  return `${value}@alshifa.local`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const doctorId = resolveEmail(req.body?.doctorId);
  const password = String(req.body?.password || '').trim();

  if (!doctorId || !password) {
    return res.status(400).json({ error: 'Doctor credentials are required.' });
  }

  try {
    const authClient = createAnonSupabaseClient();
    const { data, error } = await authClient.auth.signInWithPassword({
      email: doctorId,
      password
    });

    if (error || !data?.session || !data?.user) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const serviceClient = createServiceSupabaseClient();
    const { data: profile, error: profileError } = await serviceClient
      .from('als_staff_profiles')
      .select('id, role, display_name, is_active')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profileError || !profile || !profile.is_active) {
      return res.status(403).json({ error: 'This account is not enabled for staff access.' });
    }

    return res.status(200).json({
      success: true,
      session: data.session,
      user: {
        id: data.user.id,
        email: data.user.email
      },
      profile
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
