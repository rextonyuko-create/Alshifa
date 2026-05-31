const APPOINTMENTS_KEY = "alshifaAppointments";
const CUSTOMER_SESSION_KEY = "alshifaCustomerSession";
const DOCTOR_SESSION_KEY = "alshifaDoctorSession";

const loginSection = document.getElementById("loginSection");
const dashboardSection = document.getElementById("dashboardSection");

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

function showMessage(el, text, status) {
  if (!el) {
    return;
  }

  el.textContent = text;
  el.classList.remove("success", "error");
  if (status) {
    el.classList.add(status);
  }
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

function normalizeApiAppointment(payload) {
  if (!payload) {
    return null;
  }

  const latestReport = payload.report || (Array.isArray(payload.als_reports) ? payload.als_reports[0] : null);

  return {
    id: payload.booking_id || payload.id || "",
    bookingId: payload.booking_id || payload.id || "",
    name: payload.full_name || payload.name || "",
    phone: payload.phone || "",
    test: payload.test_name || payload.test || "",
    date: payload.appointment_date || payload.date || "",
    slot: payload.time_slot || payload.slot || "",
    collection: payload.collection_type || payload.collection || "",
    status: payload.status || (latestReport ? "Completed" : "Pending"),
    bookedAt: payload.booked_at || payload.bookedAt || "",
    report: latestReport ? {
      fileName: latestReport.file_name || latestReport.fileName || "",
      mimeType: latestReport.mime_type || latestReport.mimeType || "",
      content: latestReport.public_url || latestReport.publicUrl || "",
      note: latestReport.doctor_note || latestReport.note || "",
      uploadedAt: latestReport.uploaded_at || latestReport.uploadedAt || ""
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
  merged.phone = primary?.phone || fallback?.phone || "";
  merged.test = primary?.test || fallback?.test || "";
  merged.date = primary?.date || fallback?.date || "";
  merged.slot = primary?.slot || fallback?.slot || "";
  merged.collection = primary?.collection || fallback?.collection || "";
  merged.bookedAt = primary?.bookedAt || fallback?.bookedAt || "";
  merged.status = primary?.status || fallback?.status || (merged.report ? "Completed" : "Pending");
  merged.report = primary?.report || fallback?.report || null;

  return merged;
}

async function fetchAppointmentFromApi(bookingId, phone) {
  if (!window.alsCustomerLookup) {
    return null;
  }

  try {
    const response = await window.alsCustomerLookup(bookingId, phone);
    if (!response.ok) {
      return null;
    }

    const payload = Array.isArray(response.data) ? response.data[0] : response.data;
    return mergeAppointmentData(
      normalizeApiAppointment(payload),
      normalizeLocalAppointment(getStoredAppointments().find((item) => item.id === bookingId && item.phone === phone))
    );
  } catch {
    return null;
  }
}

async function fetchAppointmentForDashboard(session) {
  const localAppointment = normalizeLocalAppointment(
    getStoredAppointments().find((item) => item.id === session.bookingId && item.phone === session.phone)
  );

  if (window.alsCustomerLookup) {
    const apiAppointment = await fetchAppointmentFromApi(session.bookingId, session.phone);
    if (apiAppointment) {
      return mergeAppointmentData(apiAppointment, localAppointment);
    }
  }

  if (window.alsFetchAppointmentByBookingId && session.access_token) {
    try {
      const response = await window.alsFetchAppointmentByBookingId(session.access_token, session.bookingId);
      if (response.ok) {
        const payload = Array.isArray(response.data) ? response.data[0] : response.data;
        return mergeAppointmentData(normalizeApiAppointment(payload), localAppointment);
      }
    } catch {
      return localAppointment;
    }
  }

  return localAppointment;
}

function setupCustomerLoginPage() {
  const form = document.getElementById("customerLoginForm");
  if (!form) {
    return;
  }

  const message = document.getElementById("customerLoginMessage");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      showMessage(message, "Please enter valid booking details.", "error");
      form.reportValidity();
      return;
    }

    const formData = new FormData(form);
    const bookingId = String(formData.get("bookingId") || "").trim();
    const phone = String(formData.get("phone") || "").trim();

    showMessage(message, "Verifying...", "");

    const appointment = (await fetchAppointmentFromApi(bookingId, phone))
      || normalizeLocalAppointment(getStoredAppointments().find((item) => item.id === bookingId && item.phone === phone));

    if (!appointment) {
      showMessage(message, "Booking ID and phone do not match our records.", "error");
      return;
    }

    localStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify({
      bookingId,
      phone,
      appointment
    }));

    showMessage(message, "Login successful. Redirecting...", "success");
    window.location.href = "customer-dashboard.html";
  });
}

async function setupCustomerDashboardPage() {
  const card = document.getElementById("customerCard");
  if (!card) {
    return;
  }

  const meta = document.getElementById("customerMeta");
  const logoutBtn = document.getElementById("customerLogoutBtn");
  const rawSession = localStorage.getItem(CUSTOMER_SESSION_KEY);

  if (!rawSession) {
    window.location.href = "customer-login.html";
    return;
  }

  let session;
  try {
    session = JSON.parse(rawSession);
  } catch {
    localStorage.removeItem(CUSTOMER_SESSION_KEY);
    window.location.href = "customer-login.html";
    return;
  }

  const appointment = await fetchAppointmentForDashboard(session);

  if (!appointment) {
    card.innerHTML = "<p>Your appointment record is not available. Please login again.</p>";
    return;
  }

  if (meta) {
    meta.textContent = `Booking ID: ${appointment.id || "-"} | Phone: ${appointment.phone || "-"}`;
  }

  const report = appointment.report;
  const hasReport = Boolean(report && report.content);

  card.innerHTML = `
    <div class="details-grid">
      <p><strong>Patient:</strong> ${appointment.name || "-"}</p>
      <p><strong>Booking ID:</strong> ${appointment.id || "-"}</p>
      <p><strong>Phone:</strong> ${appointment.phone || "-"}</p>
      <p><strong>Test:</strong> ${appointment.test || "-"}</p>
      <p><strong>Date:</strong> ${appointment.date || "-"}</p>
      <p><strong>Slot:</strong> ${appointment.slot || "-"}</p>
      <p><strong>Collection:</strong> ${appointment.collection || "-"}</p>
      <p><strong>Status:</strong> ${appointment.status || "Pending"}</p>
    </div>
    <div class="report-section ${hasReport ? "" : "hidden"}" id="reportSection">
      <h3>Report Available</h3>
      <p id="reportNote">${report?.note || ""}</p>
      <p>
        <a class="btn btn-primary" id="reportLink" href="report-viewer.html?appointmentId=${encodeURIComponent(appointment.id || "")}">View Report</a>
      </p>
    </div>
    <div id="noReport" class="${hasReport ? "hidden" : ""}">
      <p>No report has been uploaded yet for this appointment.</p>
    </div>
  `;

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem(CUSTOMER_SESSION_KEY);
      window.location.href = "customer-login.html";
    });
  }
}

setupCustomerLoginPage();
setupCustomerDashboardPage();
