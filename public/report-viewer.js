const APPOINTMENTS_KEY = "alshifaAppointments";
const CUSTOMER_SESSION_KEY = "alshifaCustomerSession";
const DOCTOR_SESSION_KEY = "alshifaDoctorSession";

function getStoredAppointments() {
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

function normalizeLocalAppointment(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id || row.bookingId || "",
    bookingId: row.bookingId || row.id || "",
    name: row.name || row.full_name || "",
    phone: row.phone || "",
    test: row.test || row.test_name || "",
    date: row.date || row.appointment_date || "",
    slot: row.slot || row.time_slot || "",
    collection: row.collection || row.collection_type || "",
    status: row.status || (row.report ? "Completed" : "Pending"),
    bookedAt: row.bookedAt || row.booked_at || "",
    report: row.report ? {
      fileName: row.report.fileName || row.report.file_name || "",
      mimeType: row.report.mimeType || row.report.mime_type || "",
      content: row.report.content || row.report.publicUrl || row.report.public_url || "",
      note: row.report.note || row.report.doctor_note || "",
      uploadedAt: row.report.uploadedAt || row.report.uploaded_at || ""
    } : null
  };
}

function mergeAppointmentData(primary, fallback) {
  if (!primary && !fallback) {
    return null;
  }

  const merged = {
    ...(fallback || {}),
    ...(primary || {})
  };

  merged.id = primary?.id || fallback?.id || fallback?.bookingId || "";
  merged.bookingId = primary?.bookingId || merged.id;
  merged.name = primary?.name || fallback?.name || "";
  merged.report = primary?.report || fallback?.report || null;

  return merged;
}

function normalizeApiAppointment(booking) {
  if (!booking) {
    return null;
  }

  const reports = Array.isArray(booking.als_reports)
    ? booking.als_reports
    : booking.als_reports
      ? [booking.als_reports]
      : [];
  const latestReport = reports[0] || null;

  return {
    id: booking.booking_id || booking.id,
    bookingId: booking.booking_id || booking.id,
    name: booking.full_name || booking.name || "",
    phone: booking.phone || "",
    test: booking.test_name || booking.test || "",
    date: booking.appointment_date || booking.date || "",
    slot: booking.time_slot || booking.slot || "",
    collection: booking.collection_type || booking.collection || "",
    status: booking.status || (latestReport ? "Completed" : "Pending"),
    bookedAt: booking.booked_at || booking.bookedAt || "",
    report: latestReport
      ? {
          fileName: latestReport.file_name || latestReport.fileName || "",
          mimeType: latestReport.mime_type || latestReport.mimeType || "",
          content: latestReport.public_url || latestReport.publicUrl || "",
          note: latestReport.doctor_note || latestReport.note || "",
          uploadedAt: latestReport.uploaded_at || latestReport.uploadedAt || ""
        }
      : booking.report || null
  };
}

async function fetchAppointmentFromApi(appointmentId) {
  try {
    const customerSessionRaw = localStorage.getItem(CUSTOMER_SESSION_KEY);
    if (customerSessionRaw && window.alsCustomerLookup) {
      const customerSession = JSON.parse(customerSessionRaw);
      const response = await window.alsCustomerLookup(appointmentId, customerSession.phone);
      if (response.ok) {
        const row = Array.isArray(response.data) ? response.data[0] : response.data;
        return mergeAppointmentData(
          normalizeApiAppointment({
            booking_id: row.booking_id,
            id: row.id,
            full_name: row.full_name,
            report: row.report ? [row.report] : []
          }),
          normalizeLocalAppointment(getStoredAppointments().find((item) => item.id === appointmentId))
        );
      }
    }

    const doctorSessionRaw = localStorage.getItem(DOCTOR_SESSION_KEY);
    if (doctorSessionRaw && window.alsFetchAppointmentByBookingId) {
      const doctorSession = JSON.parse(doctorSessionRaw);
      const response = await window.alsFetchAppointmentByBookingId(doctorSession.access_token, appointmentId);
      if (response.ok) {
        const row = Array.isArray(response.data) ? response.data[0] : response.data;
        return mergeAppointmentData(
          normalizeApiAppointment(row),
          normalizeLocalAppointment(getStoredAppointments().find((item) => item.id === appointmentId))
        );
      }
    }

    return normalizeLocalAppointment(getStoredAppointments().find((item) => item.id === appointmentId));
  } catch {
    return null;
  }
}

async function renderReportViewer() {
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

  const appointment = await fetchAppointmentFromApi(appointmentId)
    || normalizeLocalAppointment(getStoredAppointments().find((item) => item.id === appointmentId));

  if (!appointment) {
    viewerBox.innerHTML = "<p>Appointment not found.</p>";
    return;
  }

  if (viewerMeta) {
    viewerMeta.textContent = `Patient: ${appointment.name || "-"} | Booking ID: ${appointment.id || "-"}`;
  }

  if (!appointment.report || !appointment.report.content) {
    viewerBox.innerHTML = "<p>Report is not uploaded yet for this appointment.</p>";
    return;
  }

  const report = appointment.report;
  const isPdf = (report.mimeType || "").includes("pdf") || (report.fileName || "").toLowerCase().endsWith(".pdf");
  const isImage = (report.mimeType || "").startsWith("image/");

  if (isPdf) {
    viewerBox.innerHTML = `
      <p><strong>Report:</strong> ${report.fileName || "-"}</p>
      <p><strong>Uploaded:</strong> ${formatDateTime(report.uploadedAt)}</p>
      <div class="pdf-frame-wrap">
        <iframe title="Patient Report PDF" src="${report.content}" class="pdf-frame"></iframe>
      </div>
      <p><a class="btn btn-primary" download="${report.fileName || "report"}" href="${report.content}">Download Report</a></p>
    `;
    return;
  }

  if (isImage) {
    viewerBox.innerHTML = `
      <p><strong>Report:</strong> ${report.fileName || "-"}</p>
      <p><strong>Uploaded:</strong> ${formatDateTime(report.uploadedAt)}</p>
      <img class="report-preview-image" src="${report.content}" alt="Patient report preview" />
      <p><a class="btn btn-primary" download="${report.fileName || "report"}" href="${report.content}">Download Report</a></p>
    `;
    return;
  }

  viewerBox.innerHTML = `
    <p><strong>Report:</strong> ${report.fileName || "-"}</p>
    <p>This file type cannot be previewed directly.</p>
    <p><a class="btn btn-primary" download="${report.fileName || "report"}" href="${report.content}">Download Report</a></p>
  `;
}

renderReportViewer();
