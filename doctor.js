const APPOINTMENTS_KEY = "alshifaAppointments";
const DOCTOR_SESSION_KEY = "alshifaDoctorSession";
const VALID_DOCTOR_ID = "doctor";
const VALID_PASSWORD = "alshifa123";

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

function setAppointments(list) {
  localStorage.setItem(APPOINTMENTS_KEY, JSON.stringify(list));
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

function setupDoctorLoginPage() {
  const form = document.getElementById("doctorLoginForm");
  if (!form) {
    return;
  }

  const messageBox = document.getElementById("doctorLoginMessage");

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      showMessage(messageBox, "Please enter doctor ID and password.", "error");
      form.reportValidity();
      return;
    }

    const formData = new FormData(form);
    const doctorId = String(formData.get("doctorId")).trim();
    const password = String(formData.get("password")).trim();

    if (doctorId === VALID_DOCTOR_ID && password === VALID_PASSWORD) {
      localStorage.setItem(DOCTOR_SESSION_KEY, "active");
      window.location.href = "doctor-dashboard.html";
      return;
    }

    showMessage(messageBox, "Invalid credentials. Please try again.", "error");
  });
}

function uniqueValues(list, key) {
  const values = new Set();
  list.forEach((item) => {
    if (item[key]) {
      values.add(item[key]);
    }
  });
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

function normalizeAppointments(rawAppointments) {
  return rawAppointments.map((row) => ({
    ...row,
    status: row.status || (row.report ? "Completed" : "Pending"),
    report: row.report || null
  }));
}

function statusBadge(status) {
  if (status === "Completed") {
    return '<span class="status-badge complete">Completed</span>';
  }
  return '<span class="status-badge pending">Pending</span>';
}

function setupDoctorDashboardPage() {
  const body = document.getElementById("appointmentsBody");
  if (!body) {
    return;
  }

  if (localStorage.getItem(DOCTOR_SESSION_KEY) !== "active") {
    window.location.href = "doctor-login.html";
    return;
  }

  const filterDate = document.getElementById("filterDate");
  const filterTest = document.getElementById("filterTest");
  const filterCollection = document.getElementById("filterCollection");
  const filterStatus = document.getElementById("filterStatus");
  const filterSearch = document.getElementById("filterSearch");
  const clearFiltersBtn = document.getElementById("clearFiltersBtn");
  const emptyState = document.getElementById("emptyState");
  const totalCount = document.getElementById("totalCount");
  const filteredCount = document.getElementById("filteredCount");
  const logoutBtn = document.getElementById("doctorLogoutBtn");

  const reportModal = document.getElementById("reportModal");
  const closeModalBtn = document.getElementById("closeModalBtn");
  const modalPatientInfo = document.getElementById("modalPatientInfo");
  const reportUploadForm = document.getElementById("reportUploadForm");
  const reportFileInput = document.getElementById("reportFileInput");
  const doctorNoteInput = document.getElementById("doctorNoteInput");
  const uploadMessage = document.getElementById("uploadMessage");
  const existingReportBox = document.getElementById("existingReportBox");

  let appointments = normalizeAppointments(getAppointments()).sort((a, b) => new Date(b.bookedAt) - new Date(a.bookedAt));
  let selectedAppointmentId = null;

  totalCount.textContent = String(appointments.length);

  uniqueValues(appointments, "test").forEach((testName) => {
    const option = document.createElement("option");
    option.value = testName;
    option.textContent = testName;
    filterTest.appendChild(option);
  });

  function persistAppointments() {
    setAppointments(appointments);
  }

  function findSelectedAppointment() {
    return appointments.find((item) => item.id === selectedAppointmentId) || null;
  }

  function openModal(appointmentId) {
    selectedAppointmentId = appointmentId;
    const appointment = findSelectedAppointment();
    if (!appointment) {
      return;
    }

    modalPatientInfo.textContent = `${appointment.name} | ${appointment.phone} | ${appointment.test} | ${appointment.date} ${appointment.slot}`;
    showMessage(uploadMessage, "", "");
    reportUploadForm.reset();

    if (appointment.report) {
      existingReportBox.classList.remove("hidden");
      existingReportBox.innerHTML = `
        <h3>Existing Report</h3>
        <p><strong>File:</strong> ${appointment.report.fileName}</p>
        <p><strong>Updated:</strong> ${formatDateTime(appointment.report.uploadedAt)}</p>
        <p><strong>Note:</strong> ${appointment.report.note || "-"}</p>
        <p>
          <a class="btn btn-outline" href="report-viewer.html?appointmentId=${encodeURIComponent(appointment.id)}">View</a>
          <a class="btn btn-primary" download="${appointment.report.fileName}" href="${appointment.report.content}">Download</a>
        </p>
      `;
    } else {
      existingReportBox.classList.add("hidden");
      existingReportBox.innerHTML = "";
    }

    reportModal.classList.remove("hidden");
  }

  function closeModal() {
    reportModal.classList.add("hidden");
    selectedAppointmentId = null;
  }

  function renderRows() {
    const dateValue = filterDate.value;
    const testValue = filterTest.value;
    const collectionValue = filterCollection.value;
    const statusValue = filterStatus.value;
    const searchValue = filterSearch.value.trim().toLowerCase();

    const filtered = appointments.filter((row) => {
      const matchesDate = !dateValue || row.date === dateValue;
      const matchesTest = !testValue || row.test === testValue;
      const matchesCollection = !collectionValue || row.collection === collectionValue;
      const matchesStatus = !statusValue || row.status === statusValue;
      const target = `${row.name || ""} ${row.phone || ""}`.toLowerCase();
      const matchesSearch = !searchValue || target.includes(searchValue);
      return matchesDate && matchesTest && matchesCollection && matchesStatus && matchesSearch;
    });

    filteredCount.textContent = String(filtered.length);
    body.innerHTML = "";

    if (!filtered.length) {
      emptyState.textContent = "No appointments found for selected filters.";
      return;
    }

    emptyState.textContent = "";

    filtered.forEach((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row.id || "-"}</td>
        <td><button type="button" class="patient-link" data-appointment-id="${row.id}">${row.name || "-"}</button></td>
        <td>${row.phone || "-"}</td>
        <td>${row.test || "-"}</td>
        <td>${row.date || "-"}</td>
        <td>${row.slot || "-"}</td>
        <td>${row.collection || "-"}</td>
        <td>${statusBadge(row.status)}</td>
        <td>${formatDateTime(row.bookedAt)}</td>
      `;
      body.appendChild(tr);
    });

    body.querySelectorAll(".patient-link").forEach((btn) => {
      btn.addEventListener("click", () => openModal(btn.dataset.appointmentId));
    });
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Failed to read file."));
      reader.readAsDataURL(file);
    });
  }

  reportUploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const appointment = findSelectedAppointment();

    if (!appointment) {
      showMessage(uploadMessage, "Appointment not found.", "error");
      return;
    }

    const file = reportFileInput.files && reportFileInput.files[0];
    if (!file) {
      showMessage(uploadMessage, "Please choose a report file.", "error");
      return;
    }

    try {
      const content = await fileToDataUrl(file);
      appointment.report = {
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        content,
        note: doctorNoteInput.value.trim(),
        uploadedAt: new Date().toISOString()
      };
      appointment.status = "Completed";
      persistAppointments();
      renderRows();
      openModal(appointment.id);
      showMessage(uploadMessage, "Report uploaded successfully and patient marked completed.", "success");
    } catch {
      showMessage(uploadMessage, "Unable to upload report. Please retry.", "error");
    }
  });

  [filterDate, filterTest, filterCollection, filterStatus, filterSearch].forEach((input) => {
    input.addEventListener("input", renderRows);
    input.addEventListener("change", renderRows);
  });

  clearFiltersBtn.addEventListener("click", () => {
    filterDate.value = "";
    filterTest.value = "";
    filterCollection.value = "";
    filterStatus.value = "";
    filterSearch.value = "";
    renderRows();
  });

  closeModalBtn.addEventListener("click", closeModal);
  reportModal.addEventListener("click", (event) => {
    if (event.target === reportModal) {
      closeModal();
    }
  });

  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem(DOCTOR_SESSION_KEY);
    window.location.href = "doctor-login.html";
  });

  renderRows();
}

setupDoctorLoginPage();
setupDoctorDashboardPage();
