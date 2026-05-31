// ── Supabase config ────────────────────────────────────────────────────────
const SUPABASE_URL      = "https://zzxemxfwngaxqipqikucw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6ZW14ZnduZ2F4cWlwcWlrdWN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxOTA2NDAsImV4cCI6MjA5NTc2NjY0MH0.2mw_EtCevpoombb1UK7Gxu-qXX9LW5tpBxqHX8gzkYI";

async function fetchBookingByIdOnly(appointmentId) {
  const url =
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(appointmentId)}&select=*&limit=1`;
  const resp = await fetch(url, {
    headers: {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
    }
  });
  if (!resp.ok) throw new Error("Failed to fetch booking.");
  const rows = await resp.json();
  return rows.length ? rows[0] : null;
}

async function renderReportViewer() {
  const viewerBox = document.getElementById("viewerBox");
  const viewerMeta = document.getElementById("viewerMeta");
  if (!viewerBox) return;

  const params = new URLSearchParams(window.location.search);
  const appointmentId = params.get("appointmentId");

  if (!appointmentId) {
    viewerBox.innerHTML = "<p>Invalid report link.</p>";
    return;
  }

  viewerBox.innerHTML = "<p>Loading report…</p>";

  let row;
  try {
    row = await fetchBookingByIdOnly(appointmentId);
  } catch (err) {
    viewerBox.innerHTML = `<p style="color:#b93232;">Error loading report: ${err.message}</p>`;
    return;
  }

  if (!row) {
    viewerBox.innerHTML = "<p>Appointment not found.</p>";
    return;
  }

  viewerMeta.textContent = `Patient: ${row.name || "-"} | Booking ID: ${row.id || "-"}`;

  if (!row.report_url) {
    viewerBox.innerHTML = "<p>Report is not uploaded yet for this appointment.</p>";
    return;
  }

  const fileName = row.report_filename || "report";
  const isPdf    = fileName.toLowerCase().endsWith(".pdf");
  const isImage  = /\.(png|jpe?g|webp|gif)$/i.test(fileName);

  if (isPdf) {
    viewerBox.innerHTML = `
      <p><strong>Report:</strong> ${fileName}</p>
      <p><strong>Doctor Note:</strong> ${row.report_note || "-"}</p>
      <div class="pdf-frame-wrap">
        <iframe title="Patient Report PDF" src="${row.report_url}" class="pdf-frame"></iframe>
      </div>
      <p class="form-note">If preview does not load, use the download button below.</p>
      <p><a class="btn btn-primary" target="_blank" href="${row.report_url}">Download Report</a></p>
    `;
    return;
  }

  if (isImage) {
    viewerBox.innerHTML = `
      <p><strong>Report:</strong> ${fileName}</p>
      <p><strong>Doctor Note:</strong> ${row.report_note || "-"}</p>
      <img class="report-preview-image" src="${row.report_url}" alt="Patient report preview" />
      <p><a class="btn btn-primary" target="_blank" href="${row.report_url}">Download Report</a></p>
    `;
    return;
  }

  viewerBox.innerHTML = `
    <p><strong>Report:</strong> ${fileName}</p>
    <p>This file type cannot be previewed directly.</p>
    <p><a class="btn btn-primary" target="_blank" href="${row.report_url}">Download Report</a></p>
  `;
}

renderReportViewer();
