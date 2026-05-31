// ── Supabase config ────────────────────────────────────────────────────────
const SUPABASE_URL      = "https://zzxemxfwngaxqipqikucw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6ZW14ZnduZ2F4cWlwcWlrdWN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxOTA2NDAsImV4cCI6MjA5NTc2NjY0MH0.2mw_EtCevpoombb1UK7Gxu-qXX9LW5tpBxqHX8gzkYI";

// ── DOM refs ────────────────────────────────────────────────────────────────
const bookingForm   = document.getElementById("bookingForm");
const dateInput     = document.getElementById("dateInput");
const slotSelect    = document.getElementById("slotSelect");
const bookingMessage = document.getElementById("bookingMessage");
const menuToggle    = document.querySelector(".menu-toggle");
const navLinks      = document.querySelector(".nav-links");

// ── Slots ───────────────────────────────────────────────────────────────────
const weekdaySlots = ["7:00 AM","7:30 AM","8:00 AM","8:30 AM","9:00 AM","10:00 AM","11:00 AM","12:00 PM","4:00 PM","5:00 PM"];
const sundaySlots  = ["8:00 AM","8:30 AM","9:00 AM","10:00 AM","11:00 AM","12:00 PM","1:00 PM"];

const today = new Date();
dateInput.min = today.toISOString().split("T")[0];

function setSlots() {
  const selected = dateInput.value;
  slotSelect.innerHTML = "";

  if (!selected) {
    slotSelect.innerHTML = '<option value="">Select date first</option>';
    return;
  }

  const selectedDate = new Date(`${selected}T00:00:00`);
  const slots = selectedDate.getDay() === 0 ? sundaySlots : weekdaySlots;

  slotSelect.innerHTML = '<option value="">Choose time slot</option>';
  slots.forEach((slot) => {
    const option = document.createElement("option");
    option.value = slot;
    option.textContent = slot;
    slotSelect.appendChild(option);
  });
}

function showMessage(text, status) {
  bookingMessage.textContent = text;
  bookingMessage.classList.remove("success", "error");
  if (status) bookingMessage.classList.add(status);
}

// ── Save booking directly to Supabase ───────────────────────────────────────
async function saveBookingToSupabase(record) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/bookings`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    body: JSON.stringify(record)
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.message || "Failed to save booking.");
  }

  const rows = await resp.json();
  return rows[0]; // returns the inserted row with its DB-generated id
}

// ── Events ──────────────────────────────────────────────────────────────────
dateInput.addEventListener("change", setSlots);

bookingForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!bookingForm.checkValidity()) {
    showMessage("Please complete all required fields correctly.", "error");
    bookingForm.reportValidity();
    return;
  }

  showMessage("Submitting booking…", "");

  const formData   = new FormData(bookingForm);
  const name       = formData.get("name");
  const phone      = formData.get("phone");
  const test       = formData.get("test");
  const date       = formData.get("date");
  const slot       = formData.get("slot");
  const collection = formData.get("collection");

  try {
    const inserted = await saveBookingToSupabase({
      name,
      phone,
      test,
      appointment_date: date,
      time_slot: slot,
      collection_type: collection,
      status: "Pending"
    });

    const bookingId = inserted ? String(inserted.id) : "N/A";
    showMessage(
      `Booked successfully! Your Booking ID: ${bookingId}. Use this ID + your phone number to view your report in Customer Login.`,
      "success"
    );
    bookingForm.reset();
    slotSelect.innerHTML = '<option value="">Select date first</option>';
  } catch (err) {
    showMessage("Booking failed: " + err.message, "error");
  }
});

menuToggle.addEventListener("click", () => {
  navLinks.classList.toggle("show");
});

navLinks.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => navLinks.classList.remove("show"));
});
