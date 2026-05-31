import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

function isValidBookingPayload(body) {
  const requiredFields = ['name', 'phone', 'test', 'date', 'slot', 'collection'];
  return requiredFields.every((field) => typeof body?.[field] === 'string' && body[field].trim().length > 0);
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    if (!isValidBookingPayload(req.body)) {
      return res.status(400).json({ error: 'Missing required booking fields.' });
    }

    const { name, phone, test, date, slot, collection, bookingId } = req.body;
    const bookingCode = typeof bookingId === 'string' && bookingId.trim() ? bookingId.trim() : null;

    try {
      const { data, error } = await supabase
        .from('als_appointments')
        .insert([{
          booking_id: bookingCode,
          full_name: name.trim(),
          phone: phone.trim(),
          test_name: test.trim(),
          appointment_date: date,
          time_slot: slot.trim(),
          collection_type: collection.trim(),
          status: 'Pending',
          source: 'website'
        }])
        .select('id, booking_id, full_name, phone, test_name, appointment_date, time_slot, collection_type, status, booked_at')
        .single();

      if (error) throw error;

      return res.status(200).json({
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
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  if (req.method === 'GET') {
    const { bookingId, phone } = req.query;

    if (!bookingId) {
      return res.status(400).json({ error: 'bookingId is required.' });
    }

    try {
      let query = supabase
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
            uploaded_at
          )
        `)
        .eq('booking_id', bookingId)
        .maybeSingle();

      if (phone) {
        query = query.eq('phone', phone);
      }

      const { data, error } = await query;

      if (error) throw error;

      if (!data) {
        return res.status(404).json({ error: 'Appointment not found.' });
      }

      return res.status(200).json({ success: true, booking: data });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
