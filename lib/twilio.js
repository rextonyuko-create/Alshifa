function formatSampleCollection(collection) {
  const value = String(collection || '').trim().toLowerCase();
  if (!value) {
    return '';
  }

  if (value.includes('home')) {
    return 'Home';
  }

  return 'LabVisit';
}

function buildAdminMessage(appointment) {
  const patientName = String(appointment?.name || '').trim();
  const phone = String(appointment?.phone || '').trim();
  const testName = String(appointment?.test || '').trim();
  const appointmentDate = String(appointment?.date || '').trim();
  const appointmentTime = String(appointment?.slot || '').trim();
  const sampleCollection = formatSampleCollection(appointment?.collection);

  return [
    'New Appointment Received',
    '',
    `Patient: ${patientName}`,
    `Phone: ${phone}`,
    `Test: ${testName}`,
    '',
    `Date: ${appointmentDate}`,
    `Time: ${appointmentTime}`,
    '',
    `Sample Collection: ${sampleCollection}`,
    '',
    'Please check dashboard.'
  ].join('\n');
}

async function sendTwilioWhatsAppMessage({ to, body }) {
  const accountSid = String(process.env.TWILIO_ACCOUNT_SID || '').trim();
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || '').trim();
  const from = String(process.env.TWILIO_WHATSAPP_FROM || '').trim();
  const recipient = String(to || process.env.ADMIN_WHATSAPP || '').trim();

  if (!accountSid || !authToken || !from || !recipient) {
    throw new Error('Missing Twilio WhatsApp environment variables.');
  }

  const payload = new URLSearchParams();
  payload.set('From', from.startsWith('whatsapp:') ? from : `whatsapp:${from}`);
  payload.set('To', recipient.startsWith('whatsapp:') ? recipient : `whatsapp:${recipient}`);
  payload.set('Body', body);

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: payload.toString()
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || 'Twilio WhatsApp send failed.');
  }

  return text;
}

async function notifyAdminOnAppointment(appointment) {
  const message = buildAdminMessage(appointment);
  return sendTwilioWhatsAppMessage({
    to: process.env.ADMIN_WHATSAPP,
    body: message
  });
}

export { buildAdminMessage, formatSampleCollection, notifyAdminOnAppointment, sendTwilioWhatsAppMessage };
