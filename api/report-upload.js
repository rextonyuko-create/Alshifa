import { createAnonSupabaseClient, createServiceSupabaseClient, extractBearerToken } from './_supabase.js';

const REPORT_BUCKET = 'als-reports';

function normalizeFilename(name) {
  return String(name || 'report')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'report';
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid file payload.');
  }

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64')
  };
}

async function resolveAuthenticatedStaff(req, serviceClient) {
  const token = extractBearerToken(req);
  if (!token) {
    throw new Error('Missing access token.');
  }

  const authClient = createAnonSupabaseClient();
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData?.user) {
    throw new Error('Invalid or expired session.');
  }

  const { data: profile, error: profileError } = await serviceClient
    .from('als_staff_profiles')
    .select('id, role, display_name, is_active')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profileError || !profile || !profile.is_active) {
    throw new Error('This account does not have staff access.');
  }

  return { user: userData.user, profile };
}

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
          content: report.public_url,
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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { bookingId, fileName, mimeType, contentDataUrl, doctorNote } = req.body || {};

  if (!bookingId || !fileName || !mimeType || !contentDataUrl) {
    return res.status(400).json({ error: 'Missing required report upload fields.' });
  }

  try {
    const serviceClient = createServiceSupabaseClient();
    const { user } = await resolveAuthenticatedStaff(req, serviceClient);

    const { data: appointment, error: appointmentError } = await serviceClient
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
      .eq('booking_id', bookingId)
      .maybeSingle();

    if (appointmentError) {
      throw appointmentError;
    }

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found.' });
    }

    const { mimeType: parsedMimeType, buffer } = parseDataUrl(contentDataUrl);
    const safeName = normalizeFilename(fileName);
    const storagePath = `${bookingId}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await serviceClient.storage
      .from(REPORT_BUCKET)
      .upload(storagePath, buffer, {
        contentType: parsedMimeType || mimeType,
        upsert: true
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data: publicData } = serviceClient.storage
      .from(REPORT_BUCKET)
      .getPublicUrl(storagePath);

    const reportRow = {
      appointment_id: appointment.id,
      booking_id: bookingId,
      file_name: safeName,
      mime_type: parsedMimeType || mimeType,
      storage_bucket: REPORT_BUCKET,
      storage_path: storagePath,
      public_url: publicData?.publicUrl || null,
      doctor_note: String(doctorNote || '').trim(),
      uploaded_by: user.id,
      uploaded_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { error: reportError } = await serviceClient
      .from('als_reports')
      .upsert(reportRow, { onConflict: 'booking_id' });

    if (reportError) {
      throw reportError;
    }

    const { error: appointmentUpdateError } = await serviceClient
      .from('als_appointments')
      .update({ status: 'Completed' })
      .eq('booking_id', bookingId);

    if (appointmentUpdateError) {
      throw appointmentUpdateError;
    }

    await serviceClient.from('als_audit_logs').insert([{
      actor_user_id: user.id,
      action: 'report_uploaded',
      entity_type: 'als_appointments',
      entity_id: bookingId,
      payload: {
        booking_id: bookingId,
        file_name: safeName,
        storage_path: storagePath,
        report_bucket: REPORT_BUCKET
      }
    }]);

    const { data: refreshedAppointment, error: refreshError } = await serviceClient
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
      .eq('booking_id', bookingId)
      .maybeSingle();

    if (refreshError) {
      throw refreshError;
    }

    return res.status(200).json({
      success: true,
      appointment: normalizeAppointment(refreshedAppointment)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
