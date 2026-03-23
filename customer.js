const APPOINTMENTS_KEY = "alshifaAppointments";
const CUSTOMER_SESSION_KEY = "alshifaCustomerSession";

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

function showMessage(el, text, status) {
  el.textContent = text;
  el.classList.remove("success", "error");
  if (status) {
    el.classList.add(status);
  }
}

function setupCustomerLoginPage() {
  const form = document.getElementById("customerLoginForm");
  if (!form) {
    return;
  }

  const message = document.getElementById("customerLoginMessage");

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      showMessage(message, "Please enter valid booking details.", "error");
      form.reportValidity();
      return;
    }

    const formData = new FormData(form);
    const bookingId = String(formData.get("bookingId")).trim();
    const phone = String(formData.get("phone")).trim();

    const appointment = getAppointments().find((item) => item.id === bookingId && item.phone === phone);

    if (!appointment) {
      showMessage(message, "Booking ID and phone do not match our records.", "error");
      return;
    }

    localStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify({ bookingId, phone }));
    window.location.href = "customer-dashboard.html";
  });
}

function statusBadge(status) {
  if (status === "Completed") {
    return '<span class="status-badge complete">Completed</span>';
  }
  return '<span class="status-badge pending">Pending</span>';
}

function setupCustomerDashboardPage() {
  const card = document.getElementById("customerCard");
  if (!card) {
    return;
  }

  const meta = document.getElementById("customerMeta");
  const logoutBtn = document.getElementById("customerLogoutBtn");

  const sessionRaw = localStorage.getItem(CUSTOMER_SESSION_KEY);
  if (!sessionRaw) {
    window.location.href = "customer-login.html";
    return;
  }

  let session;
  try {
    session = JSON.parse(sessionRaw);
  } catch {
    localStorage.removeItem(CUSTOMER_SESSION_KEY);
    window.location.href = "customer-login.html";
    return;
  }

  const appointment = getAppointments().find((item) => item.id === session.bookingId && item.phone === session.phone);

  if (!appointment) {
    card.innerHTML = "<p>Your appointment record is not available. Please login again.</p>";
  } else {
    const status = appointment.status || (appointment.report ? "Completed" : "Pending");
    const reportSection = appointment.report
      ? `
      <div class="report-actions">
        <a class="btn btn-outline" href="report-viewer.html?appointmentId=${encodeURIComponent(appointment.id)}">View Report</a>
        <a class="btn btn-primary" download="${appointment.report.fileName}" href="${appointment.report.content}">Download Report</a>
      </div>
      <p><strong>Report:</strong> ${appointment.report.fileName}</p>
      <p><strong>Uploaded:</strong> ${formatDateTime(appointment.report.uploadedAt)}</p>
      <p><strong>Doctor Note:</strong> ${appointment.report.note || "-"}</p>
      `
      : `
      <p class="form-note">Report is not uploaded yet. Please check again later or contact lab support.</p>
      `;

    meta.textContent = `Patient: ${appointment.name} | Booking ID: ${appointment.id}`;

    card.innerHTML = `
      <p><strong>Status:</strong> ${statusBadge(status)}</p>
      <p><strong>Test:</strong> ${appointment.test || "-"}</p>
      <p><strong>Appointment:</strong> ${appointment.date || "-"} at ${appointment.slot || "-"}</p>
      <p><strong>Collection:</strong> ${appointment.collection || "-"}</p>
      <p><strong>Booked At:</strong> ${formatDateTime(appointment.bookedAt)}</p>
      ${reportSection}
    `;
  }

  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem(CUSTOMER_SESSION_KEY);
    window.location.href = "customer-login.html";
  });
}

setupCustomerLoginPage();
setupCustomerDashboardPage();
