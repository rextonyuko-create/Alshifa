// ── Supabase config ────────────────────────────────────────────────────────
const SUPABASE_URL = "https://zzxemxfwngaxqipqikucw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6ZW14ZnduZ2F4cWlwcWlrdWN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxOTA2NDAsImV4cCI6MjA5NTc2NjY0MH0.2mw_EtCevpoombb1UK7Gxu-qXX9LW5tpBxqHX8gzkYI";
const STORAGE_BUCKET = "reports";

// ── Constants ───────────────────────────────────────────────────────────────
const DOCTOR_SESSION_KEY = "alshifaDoctorSession";
const VALID_DOCTOR_ID    = "doctor";
const VALID_PASSWORD     = "alshifa123";

// ── Supabase helpers ────────────────────────────────────────────────────────
async function sbFetch(path, options = {}) {
  const url = `${SUPABASE_URL}${path}`;
  const headers = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    ...options.headers
  };
  return fetch(url, { ...options, headers });
}

// Upload file to Supabase Storage and return public URL
async function uploadFileToStorage(file) {
  const ext = file.name.split(".").pop();
  const filePath = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const uploadResp = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${filePath}`,
    {
      method: "POST",
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "false"
      },
      body: file
    }
  );

  if (!uploadResp.ok) {
    const err = await uploadResp.json().catch(() => ({}));
    throw new Error(err.message || "File upload to storage failed.");
  }

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${filePath}`;
  return { publicUrl, filePath };
}

// Fetch all bookings from Supabase
async function fetchBookingsFromSupabase() {
  const resp = await sbFetch(
    "/rest/v1/bookings?select=*&order=created_at.desc",
    { method: "GET" }
  );
  if (!resp.ok) throw new Error("Failed to fetch bookings.");
  return resp.json();
}

// Update booking with report info
async function saveReportToSupabase(id, reportUrl, reportFilename, reportNote) {
  const resp = await sbFetch(
    `/rest/v1/bookings?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Prefer": "return=representation" },
      body: JSON.stringify({
        report_url: reportUrl,
        report_filename: reportFilename,
        report_note: reportNote,
        status: "Completed"
      })
    }
  );
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.message || "Failed to save report info.");
  }
  return resp.json();
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

function uniqueValues(list, key) {
  const values = new Set();
  list.forEach((item) => { if (item[key]) values.add(item[key]); });
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

function mapRow(row) {
  return {
    id: String(row.id),
    name: row.name,
    phone: row.phone,
    test: row.test,
    date: row.appointment_date,
    slot: row.time_slot,
    collection: row.collection_type,
    status: row.status || (row.report_url ? "Completed" : "Pending"),
    report: row.report_url
      ? {
          fileName: row.report_filename || "report",
          content: row.report_url,
          note: row.report_note || "",
          uploadedAt: row.updated_at || row.created_at || null,
          mimeType: (row.report_filename || "").toLowerCase().endsWith(".pdf")
            ? "application/pdf"
            : "image/jpeg"
        }
      : null,
    bookedAt: row.created_at || null
  };
}

// ── Doctor login page ───────────────────────────────────────────────────────
function setupDoctorLoginPage() {
  const form = document.getElementById("doctorLoginForm");
  if (!form) return;

  const messageBox = document.getElementById("doctorLoginMessage");

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      showMessage(messageBox, "Please enter doctor ID and password.", "error");
      form.reportValidity();
      return;
    }

    const formData  = new FormData(form);
    const doctorId  = String(formData.get("doctorId")).trim();
    const password  = String(formData.get("password")).trim();

    if (doctorId === VALID_DOCTOR_ID && password === VALID_PASSWORD) {
      localStorage.setItem(DOCTOR_SESSION_KEY, "active");
      window.location.href = "doctor-dashboard.html";
      return;
    }

    showMessage(messageBox, "Invalid credentials. Please try again.", "error");
  });
}

// ── Doctor dashboard page ───────────────────────────────────────────────────
async function setupDoctorDashboardPage() {
  const body = document.getElementById("appointmentsBody");
  if (!body) return;

  if (localStorage.getItem(DOCTOR_SESSION_KEY) !== "active") {
    window.location.href = "doctor-login.html";
    return;
  }

  const filterDate       = document.getElementById("filterDate");
  const filterTest       = document.getElementById("filterTest");
  const filterCollection = document.getElementById("filterCollection");
  const filterStatus     = document.getElementById("filterStatus");
  const filterSearch     = document.getElementById("filterSearch");
  const clearFiltersBtn  = document.getElementById("clearFiltersBtn");
  const emptyState       = document.getElementById("emptyState");
  const totalCount       = document.getElementById("totalCount");
  const filteredCount    = document.getElementById("filteredCount");
  const logoutBtn        = document.getElementById("doctorLogoutBtn");

  const reportModal      = document.getElementById("reportModal");
  const closeModalBtn    = document.getElementById("closeModalBtn");
  const modalPatientInfo = document.getElementById("modalPatientInfo");
  const reportUploadForm = document.getElementById("reportUploadForm");
  const reportFileInput  = document.getElementById("reportFileInput");
  const doctorNoteInput  = document.getElementById("doctorNoteInput");
  const uploadMessage    = document.getElementById("uploadMessage");
  const existingReportBox = document.getElementById("existingReportBox");

  // ── Load appointments from Supabase ──
  let appointments = [];
  body.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:1.5rem;">Loading appointments…</td></tr>`;

  try {
    const rows = await fetchBookingsFromSupabase();
    appointments = rows.map(mapRow);
  } catch (err) {
    body.innerHTML = `<tr><td colspan="9" style="color:#b93232;padding:1rem;">Failed to load appointments: ${err.message}</td></tr>`;
    return;
  }

  let selectedAppointmentId = null;
  totalCount.textContent = String(appointments.length);

  uniqueValues(appointments, "test").forEach((testName) => {
    const option = document.createElement("option");
    option.value = testName;
    option.textContent = testName;
    filterTest.appendChild(option);
  });

  function findSelectedAppointment() {
    return appointments.find((item) => item.id === selectedAppointmentId) || null;
  }

  function openModal(appointmentId) {
    selectedAppointmentId = appointmentId;
    const appointment = findSelectedAppointment();
    if (!appointment) return;

    modalPatientInfo.textContent =
      `${appointment.name} | ${appointment.phone} | ${appointment.test} | ${appointment.date} ${appointment.slot}`;
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
          <a class="btn btn-primary" target="_blank" href="${appointment.report.content}">Download</a>
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
    const dateValue       = filterDate.value;
    const testValue       = filterTest.value;
    const collectionValue = filterCollection.value;
    const statusValue     = filterStatus.value;
    const searchValue     = filterSearch.value.trim().toLowerCase();

    const filtered = appointments.filter((row) => {
      const matchesDate       = !dateValue       || row.date === dateValue;
      const matchesTest       = !testValue       || row.test === testValue;
      const matchesCollection = !collectionValue || row.collection === collectionValue;
      const matchesStatus     = !statusValue     || row.status === statusValue;
      const target            = `${row.name || ""} ${row.phone || ""}`.toLowerCase();
      const matchesSearch     = !searchValue     || target.includes(searchValue);
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

  // ── Report upload ──
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

    showMessage(uploadMessage, "Uploading file…", "");

    try {
      // 1. Upload file to Supabase Storage
      const { publicUrl } = await uploadFileToStorage(file);

      // 2. Save URL + note to bookings table in Supabase
      await saveReportToSupabase(appointment.id, publicUrl, file.name, doctorNoteInput.value.trim());

      // 3. Update local state so UI refreshes without a full reload
      appointment.report = {
        fileName: file.name,
        content: publicUrl,
        note: doctorNoteInput.value.trim(),
        uploadedAt: new Date().toISOString(),
        mimeType: file.type || "application/octet-stream"
      };
      appointment.status = "Completed";

      renderRows();
      openModal(appointment.id);
      showMessage(uploadMessage, "Report uploaded successfully! Patient can now view it.", "success");
    } catch (err) {
      showMessage(uploadMessage, "Upload failed: " + err.message, "error");
    }
  });

  // ── Filters ──
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
    if (event.target === reportModal) closeModal();
  });

  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem(DOCTOR_SESSION_KEY);
    window.location.href = "doctor-login.html";
  });

  renderRows();
}

setupDoctorLoginPage();
setupDoctorDashboardPage();
