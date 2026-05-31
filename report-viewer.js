const SUPABASE_URL = "https://zzxemxfwngaxqipqikucw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6ZW14ZnduZ2F4cWlwcWlrdWN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxOTA2NDAsImV4cCI6MjA5NTc2NjY0MH0.2mw_EtCevpoombb1UK7Gxu-qXX9LW5tpBxqHX8gzkYI";

const params    = new URLSearchParams(window.location.search);
const bookingId = params.get("id");
const container = document.getElementById("reportContainer");

if (!bookingId) {
  container.innerHTML = "<p style='color:red'>No booking ID provided.</p>";
} else {
  fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(bookingId)}&select=*`,
    {
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
      }
    }
  )
  .then((r) => r.json())
  .then((data) => {
    if (!data || data.length === 0 || !data[0].report_url) {
      container.innerHTML = "<p>No report found for this booking.</p>";
      return;
    }
    const b = data[0];
    const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(b.report_filename || "");
    container.innerHTML = `
      <h3>Report for ${b.name}</h3>
      <p><strong>Test:</strong> ${b.test}</p>
      <p><strong>Date:</strong> ${b.appointment_date}</p>
      <p><strong>Note:</strong> ${b.report_note || "None"}</p>
      <div style="margin-top:16px">
        ${isImage
          ? `<img src="${b.report_url}" style="max-width:100%;border-radius:8px"/>`
          : `<iframe src="${b.report_url}" style="width:100%;height:80vh;border:none;border-radius:8px"></iframe>`
        }
      </div>
      <a href="${b.report_url}" download="${b.report_filename}" style="display:inline-block;margin-top:12px;padding:10px 20px;background:#1a73e8;color:#fff;border-radius:6px;text-decoration:none">
        Download Report
      </a>
    `;
  })
  .catch((err) => {
    container.innerHTML = `<p style="color:red">Error loading report: ${err.message}</p>`;
  });
}