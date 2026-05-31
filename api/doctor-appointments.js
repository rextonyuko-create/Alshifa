import { createAnonSupabaseClient, createServiceSupabaseClient, extractBearerToken } from './_supabase.js';

function normalizeAppointment(row) {
  const reports = Array.isArray(row.als_reports) ? row.als_reports : [];
  const report = reports[0] || null;

  return {
    id: row.booking_id,
    bookingId: row.booking_id,
    name: row.full_name,
    phone: row.phone,
    test: row.test_name,
    date: row.appointment_date,
    slot: row.time_slot,
    collection: row.collection_type,
    status: row.status,
    bookedAt: row.booked_at,
    updatedAt: row.updated_at,
    report: report
      ? {
          id: report.id,
          fileName: report.file_name,
          mimeType: report.mime_type,
          storageBucket: report.storage_bucket,
          storagePath: report.storage_path,
          publicUrl: report.public_url,
          note: report.doctor_note,
          uploadedAt: report.uploaded_at,
          updatedAt: report.updated_at,
          uploadedBy: report.uploaded_by
        }
      : null
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Missing access token.' });
  }

  try {
    const authClient = createAnonSupabaseClient();
    const { data: userData, error: userError } = await authClient.auth.getUser(token);

    if (userError || !userData?.user) {
      return res.status(401).json({ error: 'Invalid or expired session.' });
    }

    const serviceClient = createServiceSupabaseClient();
    const { data: profile, error: profileError } = await serviceClient
      .from('als_staff_profiles')
      .select('id, role, display_name, is_active')
      .eq('id', userData.user.id)
      .maybeSingle();

    if (profileError || !profile || !profile.is_active) {
      return res.status(403).json({ error: 'This account does not have staff access.' });
    }

    const { data, error } = await serviceClient
      .from('als_appointments')
      .select(`
        id,
        booking_id,
        full_name,
        phone,
        test_name,
        appointment_date,
        time_slot,
        collection_type,
        status,
        source,
        booked_at,
        updated_at,
        als_reports (
          id,
          file_name,
          mime_type,
          storage_bucket,
          storage_path,
          public_url,
          doctor_note,
          uploaded_by,
          uploaded_at,
          updated_at
        )
      `)
      .order('booked_at', { ascending: false });

    if (error) {
      throw error;
    }

    return res.status(200).json({
      success: true,
      profile,
      appointments: (data || []).map(normalizeAppointment)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
