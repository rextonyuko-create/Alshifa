window.ALS_SUPABASE_URL = "https://zzemxfwngaqxipqikucw.supabase.co";
window.ALS_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6ZW14ZnduZ2F4cWlwcWlrdWN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxOTA2NDAsImV4cCI6MjA5NTc2NjY0MH0.2mw_ETcvoombb1UK7Gxu-qXX9LW5tpBxqHX8gzkYI";

function alsSupabaseHeaders(accessToken, extra = {}) {
  return {
    apikey: window.ALS_SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken || window.ALS_SUPABASE_ANON_KEY}`,
    ...extra
  };
}

async function alsSupabaseRequest(path, options = {}) {
  const response = await fetch(`${window.ALS_SUPABASE_URL}${path}`, {
    method: options.method || 'GET',
    headers: alsSupabaseHeaders(options.accessToken, options.headers || {}),
    body: options.body
  });

  const text = await response.text();
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') && text ? JSON.parse(text) : text;

  return { ok: response.ok, status: response.status, data };
}

async function alsAuthLogin(email, password) {
  return alsSupabaseRequest('/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
}

async function alsAuthGetUser(accessToken) {
  return alsSupabaseRequest('/auth/v1/user', {
    accessToken,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function alsCustomerLookup(bookingId, phone) {
  return alsSupabaseRequest('/rest/v1/rpc/als_customer_lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_booking_id: bookingId,
      p_phone: phone
    })
  });
}

async function alsInsertAppointment(payload) {
  return alsSupabaseRequest('/rest/v1/als_appointments?select=id,booking_id,full_name,phone,test_name,appointment_date,time_slot,collection_type,status,booked_at', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify([payload])
  });
}

async function alsFetchDoctorAppointments(accessToken) {
  return alsSupabaseRequest('/rest/v1/als_appointments?select=id,booking_id,full_name,phone,test_name,appointment_date,time_slot,collection_type,status,source,booked_at,updated_at,als_reports(id,file_name,mime_type,storage_bucket,storage_path,public_url,doctor_note,uploaded_by,uploaded_at,updated_at)&order=booked_at.desc', {
    accessToken
  });
}

async function alsFetchAppointmentByBookingId(accessToken, bookingId) {
  return alsSupabaseRequest(`/rest/v1/als_appointments?select=id,booking_id,full_name,phone,test_name,appointment_date,time_slot,collection_type,status,booked_at,updated_at,als_reports(id,file_name,mime_type,storage_bucket,storage_path,public_url,doctor_note,uploaded_by,uploaded_at,updated_at)&booking_id=eq.${encodeURIComponent(bookingId)}&limit=1`, {
    accessToken
  });
}

async function alsUploadReport(accessToken, appointmentUuid, bookingId, file, doctorNote) {
  const safeName = String(file.name || 'report').replace(/[^a-zA-Z0-9._-]+/g, '_');
  const storagePath = `${bookingId}/${Date.now()}-${safeName}`;
  const uploadResponse = await fetch(`${window.ALS_SUPABASE_URL}/storage/v1/object/als-reports/${encodeURIComponent(storagePath)}`, {
    method: 'POST',
    headers: {
      apikey: window.ALS_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      'x-upsert': 'true',
      'Content-Type': file.type || 'application/octet-stream'
    },
    body: await file.arrayBuffer()
  });

  const uploadText = await uploadResponse.text();
  if (!uploadResponse.ok) {
    throw new Error(uploadText || 'Failed to upload report file.');
  }

  const publicUrl = `${window.ALS_SUPABASE_URL}/storage/v1/object/public/als-reports/${encodeURIComponent(storagePath)}`;
  const reportPayload = {
    appointment_id: appointmentUuid,
    booking_id: bookingId,
    file_name: safeName,
    mime_type: file.type || 'application/octet-stream',
    storage_bucket: 'als-reports',
    storage_path: storagePath,
    public_url: publicUrl,
    doctor_note: String(doctorNote || '').trim(),
    uploaded_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const reportInsert = await alsSupabaseRequest('/rest/v1/als_reports?on_conflict=booking_id', {
    method: 'POST',
    accessToken,
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify([reportPayload])
  });

  if (!reportInsert.ok) {
    throw new Error(typeof reportInsert.data === 'string' ? reportInsert.data : (reportInsert.data?.message || 'Failed to save report metadata.'));
  }

  const statusUpdate = await alsSupabaseRequest(`/rest/v1/als_appointments?booking_id=eq.${encodeURIComponent(bookingId)}`, {
    method: 'PATCH',
    accessToken,
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify({ status: 'Completed' })
  });

  if (!statusUpdate.ok) {
    throw new Error(typeof statusUpdate.data === 'string' ? statusUpdate.data : (statusUpdate.data?.message || 'Failed to update appointment status.'));
  }

  await alsSupabaseRequest('/rest/v1/als_audit_logs', {
    method: 'POST',
    accessToken,
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify([{
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

  const refreshed = await alsFetchAppointmentByBookingId(accessToken, bookingId);
  if (refreshed.ok && Array.isArray(refreshed.data) && refreshed.data[0]) {
    return refreshed.data[0];
  }

  return {
    id: appointmentUuid,
    booking_id: bookingId,
    full_name: '',
    phone: '',
    test_name: '',
    appointment_date: '',
    time_slot: '',
    collection_type: '',
    status: 'Completed',
    booked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    als_reports: [{
      file_name: safeName,
      mime_type: file.type || 'application/octet-stream',
      public_url: publicUrl,
      doctor_note: String(doctorNote || '').trim(),
      uploaded_at: new Date().toISOString()
    }]
  };
}

window.alsSupabaseHeaders = alsSupabaseHeaders;
window.alsSupabaseRequest = alsSupabaseRequest;
window.alsAuthLogin = alsAuthLogin;
window.alsAuthGetUser = alsAuthGetUser;
window.alsCustomerLookup = alsCustomerLookup;
window.alsInsertAppointment = alsInsertAppointment;
window.alsFetchDoctorAppointments = alsFetchDoctorAppointments;
window.alsFetchAppointmentByBookingId = alsFetchAppointmentByBookingId;
window.alsUploadReport = alsUploadReport;
