import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { name, phone, email, test, date, slot, collection } = req.body;

    try {
      const { data, error } = await supabase
        .from('bookings')
        .insert([{
          name,
          phone,
          email,
          test,
          appointment_date: date,
          time_slot: slot,
          collection_type: collection
        }]);

      if (error) throw error;
      
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
  return res.status(405).json({ error: 'Method not allowed' });
}
