const APPOINTMENTS_KEY = "alshifaAppointments";

function getAppointments() {
  const raw = localStorage.getItem(APPOINTMENTS_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatDateTime(iso) {
  if (!iso) {
    return "-";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
}

function renderReportViewer() {
  const viewerBox = document.getElementById("viewerBox");
  const viewerMeta = document.getElementById("viewerMeta");
  if (!viewerBox) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const appointmentId = params.get("appointmentId");

  if (!appointmentId) {
    viewerBox.innerHTML = "<p>Invalid report link.</p>";
    return;
  }

  const appointment = getAppointments().find((item) => item.id === appointmentId);
  if (!appointment) {
    viewerBox.innerHTML = "<p>Appointment not found.</p>";
    return;
  }

  viewerMeta.textContent = `Patient: ${appointment.name || "-"} | Booking ID: ${appointment.id || "-"}`;

  if (!appointment.report || !appointment.report.content) {
    viewerBox.innerHTML = "<p>Report is not uploaded yet for this appointment.</p>";
    return;
  }

  const report = appointment.report;
  const isPdf = (report.mimeType || "").includes("pdf") || report.fileName.toLowerCase().endsWith(".pdf");
  const isImage = (report.mimeType || "").startsWith("image/");

  if (isPdf) {
    viewerBox.innerHTML = `
      <p><strong>Report:</strong> ${report.fileName}</p>
      <p><strong>Uploaded:</strong> ${formatDateTime(report.uploadedAt)}</p>
      <div class="pdf-frame-wrap">
        <iframe title="Patient Report PDF" src="${report.content}" class="pdf-frame"></iframe>
      </div>
      <p class="form-note">If preview does not load on your browser, use download option below.</p>
      <p><a class="btn btn-primary" download="${report.fileName}" href="${report.content}">Download Report</a></p>
    `;
    return;
  }

  if (isImage) {
    viewerBox.innerHTML = `
      <p><strong>Report:</strong> ${report.fileName}</p>
      <p><strong>Uploaded:</strong> ${formatDateTime(report.uploadedAt)}</p>
      <img class="report-preview-image" src="${report.content}" alt="Patient report preview" />
      <p><a class="btn btn-primary" download="${report.fileName}" href="${report.content}">Download Report</a></p>
    `;
    return;
  }

  viewerBox.innerHTML = `
    <p><strong>Report:</strong> ${report.fileName}</p>
    <p>This file type cannot be previewed directly.</p>
    <p><a class="btn btn-primary" download="${report.fileName}" href="${report.content}">Download Report</a></p>
  `;
}

renderReportViewer();
