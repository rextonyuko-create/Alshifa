const SUPABASE_URL = "https://zzxemxfwngaxqipqikucw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6ZW14ZnduZ2F4cWlwcWlrdWN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxOTA2NDAsImV4cCI6MjA5NTc2NjY0MH0.2mw_EtCevpoombb1UK7Gxu-qXX9LW5tpBxqHX8gzkYI";

const loginSection     = document.getElementById("loginSection");
const dashboardSection = document.getElementById("dashboardSection");

if (loginSection) {
  const loginForm    = document.getElementById("loginForm");
  const loginMessage = document.getElementById("loginMessage");

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const bookingId = document.getElementById("bookingId").value.trim();
    const phone     = document.getElementById("phone").value.trim();

    if (!bookingId || !phone) {
      loginMessage.textContent = "Please enter both Booking ID and Phone.";
      loginMessage.style.color = "red";
      return;
    }

    loginMessage.textContent = "Verifying...";
    loginMessage.style.color = "#555";

    try {
      const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(bookingId)}&phone=eq.${encodeURIComponent(phone)}&select=*`,
        {
          headers: {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
          }
        }
      );
      if (!resp.ok) throw new Error("Failed to verify.");
      const data = await resp.json();
      if (!data || data.length === 0) {
        loginMessage.textContent = "Booking not found. Check your ID and phone number.";
        loginMessage.style.color = "red";
        return;
      }
      const booking = data[0];
      sessionStorage.setItem("customerBooking", JSON.stringify(booking));
      window.location.href = "customer-dashboard.html";
    } catch (err) {
      loginMessage.textContent = "Error: " + err.message;
      loginMessage.style.color = "red";
    }
  });
}

if (dashboardSection) {
  const stored = sessionStorage.getItem("customerBooking");
  if (!stored) { window.location.href = "customer-login.html"; }

  const booking = JSON.parse(stored);

  document.getElementById("custName").textContent       = booking.name       || "-";
  document.getElementById("custPhone").textContent      = booking.phone      || "-";
  document.getElementById("custTest").textContent       = booking.test       || "-";
  document.getElementById("custDate").textContent       = booking.appointment_date || "-";
  document.getElementById("custSlot").textContent       = booking.time_slot  || "-";
  document.getElementById("custCollection").textContent = booking.collection_type  || "-";
  document.getElementById("custStatus").textContent     = booking.status     || "Pending";
  document.getElementById("custBookingId").textContent  = booking.id         || "-";

  const reportSection = document.getElementById("reportSection");
  const noReport      = document.getElementById("noReport");
  const reportLink    = document.getElementById("reportLink");
  const reportNote    = document.getElementById("reportNote");

  if (booking.report_url) {
    noReport.style.display     = "none";
    reportSection.style.display = "block";
    reportLink.href             = booking.report_url;
    reportLink.textContent      = booking.report_filename || "View Report";
    if (reportNote) reportNote.textContent = booking.report_note || "";
  } else {
    noReport.style.display      = "block";
    reportSection.style.display = "none";
  }

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      sessionStorage.removeItem("customerBooking");
      window.location.href = "customer-login.html";
    });
  }
}