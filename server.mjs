import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');
const PUBLIC_DIR = __dirname;
const PORT = Number(process.env.PORT || 3000);

function loadEnvFile(path) {
  return readFile(path, 'utf8')
    .then((raw) => {
      raw.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
          return;
        }

        const idx = trimmed.indexOf('=');
        if (idx === -1) {
          return;
        }

        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
        process.env[key] = value;
      });
    })
    .catch(() => {});
}

function contentTypeFor(filePath) {
  const ext = extname(filePath).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon'
  })[ext] || 'application/octet-stream';
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  res.end(JSON.stringify(payload));
}

function parseCookies(cookieHeader) {
  const cookies = {};
  String(cookieHeader || '').split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) {
      return;
    }
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) {
      cookies[key] = decodeURIComponent(value);
    }
  });
  return cookies;
}

function normalizeFilename(name) {
  return String(name || 'report')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'report';
}

function encodeStoragePath(path) {
  return String(path || '')
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function contentDispositionFilename(name) {
  const safeName = normalizeFilename(name);
  return `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`;
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

function supabaseHeaders({ auth = false, contentType = false } = {}) {
  const headers = {
    apikey: process.env.SUPABASE_ANON_KEY || '',
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`
  };

  if (auth) {
    headers.Authorization = `Bearer ${process.env.SUPABASE_ANON_KEY || ''}`;
  }

  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  return headers;
}

async function supabaseFetch(path, options = {}) {
  const url = `${process.env.SUPABASE_URL}${path}`;
  try {
    const response = await fetch(url, options);
    const text = await response.text();
    const isJson = (response.headers.get('content-type') || '').includes('application/json');
    return {
      ok: response.ok,
      status: response.status,
      data: isJson && text ? JSON.parse(text) : text,
      raw: text
    };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      data: {
        message: `Unable to reach Supabase: ${error.message}`
      },
      raw: error.message
    };
  }
}

async function verifyStaffToken(token) {
  if (!token) {
    throw new Error('Missing access token.');
  }

  const userRes = await supabaseFetch('/auth/v1/user', {
    headers: {
      ...supabaseHeaders({ auth: true }),
      Authorization: `Bearer ${token}`
    }
  });

  if (!userRes.ok || !userRes.data?.id) {
    throw new Error('Invalid or expired session.');
  }

  const profileRes = await supabaseFetch(`/rest/v1/als_staff_profiles?id=eq.${encodeURIComponent(userRes.data.id)}&select=id,role,display_name,is_active`, {
    headers: supabaseHeaders()
  });

  if (!profileRes.ok || !Array.isArray(profileRes.data) || !profileRes.data[0] || !profileRes.data[0].is_active) {
    throw new Error('This account does not have staff access.');
  }

  return { user: userRes.data, profile: profileRes.data[0] };
}

async function handleBookings(req, res, url) {
  if (req.method === 'POST') {
    const body = await readJson(req);
    const requiredFields = ['name', 'phone', 'test', 'date', 'slot', 'collection'];
    const missing = requiredFields.some((field) => typeof body?.[field] !== 'string' || !body[field].trim());
    if (missing) {
      return json(res, 400, { error: 'Missing required booking fields.' });
    }

    const bookingCode = typeof body.bookingId === 'string' && body.bookingId.trim() ? body.bookingId.trim() : null;
    const payload = [{
      booking_id: bookingCode,
      full_name: body.name.trim(),
      phone: body.phone.trim(),
      test_name: body.test.trim(),
      appointment_date: body.date,
      time_slot: body.slot.trim(),
      collection_type: body.collection.trim(),
      status: 'Pending',
      source: 'website'
    }];

    const insertRes = await supabaseFetch('/rest/v1/als_appointments?select=id,booking_id,full_name,phone,test_name,appointment_date,time_slot,collection_type,status,booked_at', {
      method: 'POST',
      headers: {
        ...supabaseHeaders({ contentType: 'application/json' }),
        Prefer: 'return=representation'
      },
      body: JSON.stringify(payload)
    });

    if (!insertRes.ok) {
      return json(res, 500, { error: insertRes.data?.message || 'Failed to save booking' });
    }

    const data = Array.isArray(insertRes.data) ? insertRes.data[0] : insertRes.data;
    return json(res, 200, {
      success: true,
      booking: {
        id: data.id,
        bookingId: data.booking_id,
        name: data.full_name,
        phone: data.phone,
        test: data.test_name,
        date: data.appointment_date,
        slot: data.time_slot,
        collection: data.collection_type,
        status: data.status,
        bookedAt: data.booked_at
      }
    });
  }

  if (req.method === 'GET') {
    const bookingId = url.searchParams.get('bookingId');
    const phone = url.searchParams.get('phone');
    if (!bookingId) {
      return json(res, 400, { error: 'bookingId is required.' });
    }

    let path = `/rest/v1/als_appointments?select=id,booking_id,full_name,phone,test_name,appointment_date,time_slot,collection_type,status,booked_at,updated_at,als_reports(id,file_name,mime_type,storage_bucket,storage_path,public_url,doctor_note,uploaded_at)&booking_id=eq.${encodeURIComponent(bookingId)}&limit=1`;
    if (phone) {
      path += `&phone=eq.${encodeURIComponent(phone)}`;
    }

    const queryRes = await supabaseFetch(path, { headers: supabaseHeaders() });
    if (!queryRes.ok) {
      return json(res, 500, { error: queryRes.data?.message || 'Failed to load booking.' });
    }

    const data = Array.isArray(queryRes.data) ? queryRes.data[0] : queryRes.data;
    if (!data) {
      return json(res, 404, { error: 'Appointment not found.' });
    }

    return json(res, 200, { success: true, booking: data });
  }

  return json(res, 405, { error: 'Method not allowed' });
}

async function handleStaffLogin(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const body = await readJson(req);
  const doctorId = String(body?.doctorId || '').trim().toLowerCase();
  const password = String(body?.password || '').trim();
  if (!doctorId || !password) {
    return json(res, 400, { error: 'Doctor credentials are required.' });
  }

  const email = doctorId.includes('@') ? doctorId : `${doctorId}@alshifa.local`;

  const loginRes = await supabaseFetch('/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: {
      ...supabaseHeaders({ auth: true, contentType: 'application/json' })
    },
    body: JSON.stringify({ email, password })
  });

  if (!loginRes.ok) {
    return json(res, 401, { error: 'Invalid credentials.' });
  }

  const session = loginRes.data;
  const profileRes = await supabaseFetch(`/rest/v1/als_staff_profiles?id=eq.${encodeURIComponent(session.user.id)}&select=id,role,display_name,is_active`, {
    headers: supabaseHeaders()
  });

  if (!profileRes.ok || !Array.isArray(profileRes.data) || !profileRes.data[0] || !profileRes.data[0].is_active) {
    return json(res, 403, { error: 'This account is not enabled for staff access.' });
  }

  return json(res, 200, {
    success: true,
    session,
    user: {
      id: session.user.id,
      email: session.user.email
    },
    profile: profileRes.data[0]
  });
}

async function handleDoctorAppointments(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  try {
    await verifyStaffToken(token);
  } catch (error) {
    return json(res, 401, { error: error.message });
  }

  const path = '/rest/v1/als_appointments?select=id,booking_id,full_name,phone,test_name,appointment_date,time_slot,collection_type,status,source,booked_at,updated_at,als_reports(id,file_name,mime_type,storage_bucket,storage_path,public_url,doctor_note,uploaded_by,uploaded_at,updated_at)&order=booked_at.desc';
  const queryRes = await supabaseFetch(path, { headers: supabaseHeaders() });
  if (!queryRes.ok) {
    return json(res, 500, { error: queryRes.data?.message || 'Unable to load appointments.' });
  }

  const appointments = Array.isArray(queryRes.data) ? queryRes.data : [];
  const normalized = appointments.map((row) => {
    const report = Array.isArray(row.als_reports) ? row.als_reports[0] : null;
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
      report: report ? {
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
      } : null
    };
  });

  return json(res, 200, { success: true, appointments: normalized });
}

async function handleReportUpload(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  let staff;
  try {
    staff = await verifyStaffToken(token);
  } catch (error) {
    return json(res, 401, { error: error.message });
  }

  const body = await readJson(req);
  const { bookingId, fileName, mimeType, contentDataUrl, doctorNote } = body || {};
  if (!bookingId || !fileName || !mimeType || !contentDataUrl) {
    return json(res, 400, { error: 'Missing required report upload fields.' });
  }

  const appointmentRes = await supabaseFetch(`/rest/v1/als_appointments?id=not.is.null&booking_id=eq.${encodeURIComponent(bookingId)}&select=id,booking_id,full_name,phone,test_name,appointment_date,time_slot,collection_type,status,booked_at,updated_at,als_reports(id,file_name,mime_type,storage_bucket,storage_path,public_url,doctor_note,uploaded_by,uploaded_at,updated_at)&limit=1`, {
    headers: supabaseHeaders()
  });

  if (!appointmentRes.ok) {
    return json(res, 500, { error: appointmentRes.data?.message || 'Appointment not found.' });
  }

  const appointment = Array.isArray(appointmentRes.data) ? appointmentRes.data[0] : appointmentRes.data;
  if (!appointment) {
    return json(res, 404, { error: 'Appointment not found.' });
  }

  const { mimeType: parsedMimeType, buffer } = parseDataUrl(contentDataUrl);
  const safeName = normalizeFilename(fileName);
  const storagePath = `${bookingId}/${Date.now()}-${safeName}`;

  const uploadRes = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent('als-reports')}/${encodeURIComponent(storagePath)}`, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': parsedMimeType || mimeType,
      'x-upsert': 'true'
    },
    body: buffer
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    return json(res, 500, { error: text || 'Failed to upload report file.' });
  }

  const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/als-reports/${encodeURIComponent(storagePath)}`;
  const now = new Date().toISOString();

  const reportPayload = [{
    appointment_id: appointment.id,
    booking_id: bookingId,
    file_name: safeName,
    mime_type: parsedMimeType || mimeType,
    storage_bucket: 'als-reports',
    storage_path: storagePath,
    public_url: publicUrl,
    doctor_note: String(doctorNote || '').trim(),
    uploaded_by: staff.user.id,
    uploaded_at: now,
    updated_at: now
  }];

  const reportRes = await supabaseFetch('/rest/v1/als_reports?on_conflict=booking_id', {
    method: 'POST',
    headers: {
      ...supabaseHeaders({ contentType: 'application/json' }),
      Prefer: 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify(reportPayload)
  });

  if (!reportRes.ok) {
    return json(res, 500, { error: reportRes.data?.message || 'Failed to save report metadata.' });
  }

  const updateRes = await supabaseFetch(`/rest/v1/als_appointments?booking_id=eq.${encodeURIComponent(bookingId)}`, {
    method: 'PATCH',
    headers: {
      ...supabaseHeaders({ contentType: 'application/json' }),
      Prefer: 'return=representation'
    },
    body: JSON.stringify({ status: 'Completed' })
  });

  if (!updateRes.ok) {
    return json(res, 500, { error: updateRes.data?.message || 'Failed to update appointment status.' });
  }

  await supabaseFetch('/rest/v1/als_audit_logs', {
    method: 'POST',
    headers: {
      ...supabaseHeaders({ contentType: 'application/json' }),
      Prefer: 'return=minimal'
    },
    body: JSON.stringify([{
      actor_user_id: staff.user.id,
      action: 'report_uploaded',
      entity_type: 'als_appointments',
      entity_id: bookingId,
      payload: {
        booking_id: bookingId,
        file_name: safeName,
        storage_path: storagePath,
        report_bucket: 'als-reports'
      }
    }])
  });

  const finalRes = await supabaseFetch(`/rest/v1/als_appointments?select=id,booking_id,full_name,phone,test_name,appointment_date,time_slot,collection_type,status,booked_at,updated_at,als_reports(id,file_name,mime_type,storage_bucket,storage_path,public_url,doctor_note,uploaded_by,uploaded_at,updated_at)&booking_id=eq.${encodeURIComponent(bookingId)}&limit=1`, {
    headers: supabaseHeaders()
  });

  const finalAppointment = Array.isArray(finalRes.data) ? finalRes.data[0] : finalRes.data;
  return json(res, 200, {
    success: true,
    appointment: finalAppointment ? {
      id: finalAppointment.booking_id,
      bookingId: finalAppointment.booking_id,
      name: finalAppointment.full_name,
      phone: finalAppointment.phone,
      test: finalAppointment.test_name,
      date: finalAppointment.appointment_date,
      slot: finalAppointment.time_slot,
      collection: finalAppointment.collection_type,
      status: finalAppointment.status,
      bookedAt: finalAppointment.booked_at,
      updatedAt: finalAppointment.updated_at,
      report: Array.isArray(finalAppointment.als_reports) && finalAppointment.als_reports[0] ? {
        id: finalAppointment.als_reports[0].id,
        fileName: finalAppointment.als_reports[0].file_name,
        mimeType: finalAppointment.als_reports[0].mime_type,
        storageBucket: finalAppointment.als_reports[0].storage_bucket,
        storagePath: finalAppointment.als_reports[0].storage_path,
        content: finalAppointment.als_reports[0].public_url,
        publicUrl: finalAppointment.als_reports[0].public_url,
        note: finalAppointment.als_reports[0].doctor_note,
        uploadedAt: finalAppointment.als_reports[0].uploaded_at,
        updatedAt: finalAppointment.als_reports[0].updated_at,
        uploadedBy: finalAppointment.als_reports[0].uploaded_by
      } : null
    } : null
  });
}

async function handleReportDownload(req, res, url) {
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const bookingId = String(url.searchParams.get('bookingId') || '').trim();
  const phone = String(url.searchParams.get('phone') || '').trim();
  if (!bookingId) {
    return json(res, 400, { error: 'bookingId is required.' });
  }

  let path = `/rest/v1/als_appointments?select=id,booking_id,phone,als_reports(id,file_name,mime_type,storage_bucket,storage_path,public_url,uploaded_at)&booking_id=eq.${encodeURIComponent(bookingId)}&limit=1`;
  if (phone) {
    path += `&phone=eq.${encodeURIComponent(phone)}`;
  }

  const appointmentRes = await supabaseFetch(path, { headers: supabaseHeaders() });
  if (!appointmentRes.ok) {
    return json(res, 500, { error: appointmentRes.data?.message || 'Unable to load report.' });
  }

  const appointment = Array.isArray(appointmentRes.data) ? appointmentRes.data[0] : appointmentRes.data;
  const report = Array.isArray(appointment?.als_reports) ? appointment.als_reports[0] : null;
  if (!appointment || !report?.storage_path) {
    return json(res, 404, { error: 'Report not found.' });
  }

  const bucket = report.storage_bucket || 'als-reports';
  const objectUrl = `${process.env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeStoragePath(report.storage_path)}`;
  const fileRes = await fetch(objectUrl, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
    }
  });

  if (!fileRes.ok) {
    return json(res, fileRes.status === 404 ? 404 : 500, { error: 'Unable to download report file.' });
  }

  const buffer = Buffer.from(await fileRes.arrayBuffer());
  res.writeHead(200, {
    'Content-Type': report.mime_type || 'application/octet-stream',
    'Content-Disposition': contentDispositionFilename(report.file_name || 'report'),
    'Content-Length': String(buffer.length),
    'Cache-Control': 'private, no-store'
  });
  res.end(buffer);
  return undefined;
}

async function serveStatic(req, res, urlPath) {
  const safePath = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const relative = safePath === '/' ? '/index.html' : safePath;
  const filePath = join(PUBLIC_DIR, relative);

  try {
    let fileStat = await stat(filePath).catch(() => null);
    let finalPath = filePath;
    if (!fileStat || fileStat.isDirectory()) {
      if (fileStat?.isDirectory()) {
        finalPath = join(filePath, 'index.html');
        fileStat = await stat(finalPath).catch(() => null);
      } else if (!extname(filePath)) {
        finalPath = join(PUBLIC_DIR, 'index.html');
        fileStat = await stat(finalPath).catch(() => null);
      }
    }

    if (!fileStat || !fileStat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    res.writeHead(200, { 'Content-Type': contentTypeFor(finalPath) });
    createReadStream(finalPath).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

async function main() {
  await loadEnvFile(join(PUBLIC_DIR, '.env.local'));
  await loadEnvFile(join(PUBLIC_DIR, '.env.local'));

  const server = createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

      if (requestUrl.pathname === '/api/bookings') {
        return handleBookings(req, res, requestUrl);
      }

      if (requestUrl.pathname === '/api/staff-login') {
        return handleStaffLogin(req, res);
      }

      if (requestUrl.pathname === '/api/doctor-appointments') {
        return handleDoctorAppointments(req, res);
      }

      if (requestUrl.pathname === '/api/report-upload') {
        return handleReportUpload(req, res);
      }

      if (requestUrl.pathname === '/api/report-download') {
        return handleReportDownload(req, res, requestUrl);
      }

      return serveStatic(req, res, requestUrl.pathname);
    } catch (error) {
      console.error('[server error]', error);
      if (!res.headersSent) {
        return json(res, 500, { error: error.message || 'Internal server error' });
      }
      res.destroy();
      return undefined;
    }
  });

  server.listen(PORT, () => {
    console.log(`Alshifa is running at http://localhost:${PORT}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
