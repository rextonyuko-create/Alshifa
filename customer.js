// ── Supabase config ────────────────────────────────────────────────────────
const SUPABASE_URL      = "https://zzxemxfwngaxqipqikucw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6ZW14ZnduZ2F4cWlwcWlrdWN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxOTA2NDAsImV4cCI6MjA5NTc2NjY0MH0.2mw_EtCevpoombb1UK7Gxu-qXX9LW5tpBxqHX8gzkYI";

const CUSTOMER_SESSION_KEY = "alshifaCustomerSession";

// ── Supabase helper ─────────────────────────────────────────────────────────
async function fetchBookingById(bookingId, phone) {
  const url =
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(bookingId)}&phone=eq.${encodeURIComponent(phone)}&select=*&limit=1`;
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

// ── Utilities ───────────────────────────────────────────────────────────────
function formatDateTime(iso) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function showMessage(el, text, status) {
  el.textContent = text;
  el.classList.remove("success", "error");
  if (status) el.classList.add(status);
}

function statusBadge(status) {
  if (status === "Completed")
    return '<span class="status-badge complete">Completed</span>';
  return '<span class="status-badge pending">Pending</span>';
}

// ── Customer login page ─────────────────────────────────────────────────────
function setupCustomerLoginPage() {
  const form = document.getElementById("customerLoginForm");
  if (!form) return;

  const message = document.getElementById("customerLoginMessage");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      showMessage(message, "Please enter valid booking details.", "error");
      form.reportValidity();
      return;
    }

    const formData  = new FormData(form);
    const bookingId = String(formData.get("bookingId")).trim();
    const phone     = String(formData.get("phone")).trim();

    showMessage(message, "Verifying…", "");

    try {
      const row = await fetchBookingById(bookingId, phone);

      if (!row) {
        showMessage(message, "Booking ID and phone do not match our records.", "error");
        return;
      }

      // Store minimal session info
      localStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify({ bookingId, phone }));
      window.location.href = "customer-dashboard.html";
    } catch (err) {
      showMessage(message, "Could not verify booking. Please try again.", "error");
    }
  });
}

// ── Customer dashboard page ─────────────────────────────────────────────────
async function setupCustomerDashboardPage() {
  const card = document.getElementById("customerCard");
  if (!card) return;

  const meta      = document.getElementById("customerMeta");
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

  card.innerHTML = "<p>Loading your appointment…</p>";

  try {
    const row = await fetchBookingById(session.bookingId, session.phone);

    if (!row) {
      card.innerHTML = "<p>Your appointment record is not available. Please login again.</p>";
    } else {
      const status = row.status || (row.report_url ? "Completed" : "Pending");

      const reportSection = row.report_url
        ? `
          <div class="report-actions">
            <a class="btn btn-outline" href="report-viewer.html?appointmentId=${encodeURIComponent(String(row.id))}">View Report</a>
            <a class="btn btn-primary" target="_blank" href="${row.report_url}">Download Report</a>
          </div>
          <p><strong>Report:</strong> ${row.report_filename || "-"}</p>
          <p><strong>Doctor Note:</strong> ${row.report_note || "-"}</p>
        `
        : `<p class="form-note">Report is not uploaded yet. Please check again later or contact lab support.</p>`;

      meta.textContent = `Patient: ${row.name} | Booking ID: ${row.id}`;

      card.innerHTML = `
        <p><strong>Status:</strong> ${statusBadge(status)}</p>
        <p><strong>Test:</strong> ${row.test || "-"}</p>
        <p><strong>Appointment:</strong> ${row.appointment_date || "-"} at ${row.time_slot || "-"}</p>
        <p><strong>Collection:</strong> ${row.collection_type || "-"}</p>
        <p><strong>Booked At:</strong> ${formatDateTime(row.created_at)}</p>
        ${reportSection}
      `;
    }
  } catch (err) {
    card.innerHTML = `<p style="color:#b93232;">Failed to load appointment: ${err.message}</p>`;
  }

  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem(CUSTOMER_SESSION_KEY);
    window.location.href = "customer-login.html";
  });
}

setupCustomerLoginPage();
setupCustomerDashboardPage();
