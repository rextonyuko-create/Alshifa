const APPOINTMENTS_KEY = "alshifaAppointments";

const bookingForm = document.getElementById("bookingForm");
const dateInput = document.getElementById("dateInput");
const slotSelect = document.getElementById("slotSelect");
const bookingMessage = document.getElementById("bookingMessage");
const menuToggle = document.querySelector(".menu-toggle");
const navLinks = document.querySelector(".nav-links");

const weekdaySlots = ["7:00 AM", "7:30 AM", "8:00 AM", "8:30 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "4:00 PM", "5:00 PM"];
const sundaySlots = ["8:00 AM", "8:30 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM"];

const today = new Date();
dateInput.min = today.toISOString().split("T")[0];

function showMessage(text, status) {
  bookingMessage.textContent = text;
  bookingMessage.classList.remove("success", "error");
  if (status) {
    bookingMessage.classList.add(status);
  }
}

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

function saveAppointment(record) {
  const appointments = getStoredAppointments();
  appointments.push(record);
  localStorage.setItem(APPOINTMENTS_KEY, JSON.stringify(appointments));
}

dateInput.addEventListener("change", setSlots);

bookingForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!bookingForm.checkValidity()) {
    showMessage("Please complete all required fields correctly.", "error");
    bookingForm.reportValidity();
    return;
  }

  const formData = new FormData(bookingForm);
  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const test = String(formData.get("test") || "").trim();
  const date = String(formData.get("date") || "").trim();
  const slot = String(formData.get("slot") || "").trim();
  const collection = String(formData.get("collection") || "").trim();
  const bookingId = `APT-${Date.now()}`;

  const localRecord = {
    id: bookingId,
    bookingId,
    name,
    phone,
    test,
    date,
    slot,
    collection,
    status: "Pending",
    report: null,
    bookedAt: new Date().toISOString(),
    source: "website"
  };

  saveAppointment(localRecord);

  try {
    if (window.alsInsertAppointment) {
      const response = await window.alsInsertAppointment({
        booking_id: bookingId,
        full_name: name,
        phone,
        test_name: test,
        appointment_date: date,
        time_slot: slot,
        collection_type: collection,
        status: "Pending",
        source: "website"
      });

      if (!response.ok) {
        throw new Error((response.data && response.data.message) || "Failed to save booking.");
      }
    }

    showMessage(`Booked successfully! Your Booking ID: ${bookingId}. Use this ID + your phone number to view your report in Customer Login.`, "success");
    bookingForm.reset();
    slotSelect.innerHTML = '<option value="">Select date first</option>';
  } catch (error) {
    console.error("Booking API Error:", error);
    showMessage(`Booked successfully! Your Booking ID: ${bookingId}. Use this ID + your phone number to view your report in Customer Login.`, "success");
    bookingForm.reset();
    slotSelect.innerHTML = '<option value="">Select date first</option>';
  }
});

if (menuToggle) {
  menuToggle.addEventListener("click", () => navLinks.classList.toggle("show"));
}

if (navLinks) {
  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => navLinks.classList.remove("show"));
  });
}
