const bookingForm = document.getElementById("bookingForm");
const dateInput = document.getElementById("dateInput");
const slotSelect = document.getElementById("slotSelect");
const bookingMessage = document.getElementById("bookingMessage");
const menuToggle = document.querySelector(".menu-toggle");
const navLinks = document.querySelector(".nav-links");

const weekdaySlots = ["7:00 AM", "7:30 AM", "8:00 AM", "8:30 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "4:00 PM", "5:00 PM"];
const sundaySlots = ["8:00 AM", "8:30 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM"];
const APPOINTMENTS_KEY = "alshifaAppointments";

const today = new Date();
const toISODate = (date) => date.toISOString().split("T")[0];

dateInput.min = toISODate(today);

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
  if (status) {
    bookingMessage.classList.add(status);
  }
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

bookingForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!bookingForm.checkValidity()) {
    showMessage("Please complete all required fields correctly.", "error");
    bookingForm.reportValidity();
    return;
  }

  const formData = new FormData(bookingForm);
  const name = formData.get("name");
  const test = formData.get("test");
  const date = formData.get("date");
  const slot = formData.get("slot");
  const phone = formData.get("phone");
  const collection = formData.get("collection");

  saveAppointment({
    id: `APT-${Date.now()}`,
    name,
    phone,
    test,
    date,
    slot,
    collection,
    status: "Pending",
    report: null,
    bookedAt: new Date().toISOString()
  });

  const latestAppointments = getStoredAppointments();
  const bookingId = latestAppointments.length ? latestAppointments[latestAppointments.length - 1].id : "N/A";
  showMessage(`Booked successfully. ID: ${bookingId}. Use ID + phone in Customer Login to view reports.`, "success");
  bookingForm.reset();
  slotSelect.innerHTML = '<option value="">Select date first</option>';
});

menuToggle.addEventListener("click", () => {
  navLinks.classList.toggle("show");
});

navLinks.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => navLinks.classList.remove("show"));
});
