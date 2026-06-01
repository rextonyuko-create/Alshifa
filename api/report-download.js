import { createServiceSupabaseClient } from './_supabase.js';

function normalizeFilename(name) {
  return String(name || 'report')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'report';
}

function contentDispositionFilename(name) {
  const safeName = normalizeFilename(name);
  return `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const bookingId = String(req.query?.bookingId || '').trim();
  const phone = String(req.query?.phone || '').trim();

  if (!bookingId) {
    return res.status(400).json({ error: 'bookingId is required.' });
  }

  try {
    const serviceClient = createServiceSupabaseClient();
    let query = serviceClient
      .from('als_appointments')
      .select(`
        id,
        booking_id,
        phone,
        als_reports (
          id,
          file_name,
          mime_type,
          storage_bucket,
          storage_path,
          public_url,
          uploaded_at
        )
      `)
      .eq('booking_id', bookingId)
      .maybeSingle();

    if (phone) {
      query = query.eq('phone', phone);
    }

    const { data: appointment, error: appointmentError } = await query;
    if (appointmentError) {
      throw appointmentError;
    }

    const report = Array.isArray(appointment?.als_reports) ? appointment.als_reports[0] : null;
    if (!appointment || !report?.storage_path) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    const { data: fileData, error: downloadError } = await serviceClient.storage
      .from(report.storage_bucket || 'als-reports')
      .download(report.storage_path);

    if (downloadError || !fileData) {
      throw downloadError || new Error('Unable to download report file.');
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    res.setHeader('Content-Type', report.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', contentDispositionFilename(report.file_name || 'report'));
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).send(buffer);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
