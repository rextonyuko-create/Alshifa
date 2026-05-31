// ── Supabase config ────────────────────────────────────────────────────────
const SUPABASE_URL      = "https://zzxemxfwngaxqipqikucw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6ZW14ZnduZ2F4cWlwcWlrdWN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxOTA2NDAsImV4cCI6MjA5NTc2NjY0MH0.2mw_EtCevpoombb1UK7Gxu-qXX9LW5tpBxqHX8gzkYI";
const STORAGE_BUCKET    = "reports";

const DOCTOR_SESSION_KEY = "alshifaDoctorSession";
const VALID_DOCTOR_ID    = "doctor";
const VALID_PASSWORD     = "alshifa123";

// ── Supabase REST helpers ───────────────────────────────────────────────────
function sbHeaders(extra = {}) {
  return {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    ...extra
  };
}

async function fetchAllBookings() {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?select=*&order=created_at.desc`,
    { headers: sbHeaders() }
  );
  if (!resp.ok) throw new Error("Failed to fetch bookings.");
  return resp.json();
}

async function patchBooking(id, fields) {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: sbHeaders({ "Prefer": "return=representation" }),
      body: JSON.stringify(fields)
    }
  );
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.message || "Failed to update booking.");
  }
  return resp.json();
}

async function uploadFileToStorage(file) {
  const ext      = file.name.split(".").pop();
  const filePath = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const resp = await fetch(
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

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.message || "File upload to storage failed.");
  }

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${filePath}`;
  return publicUrl;
}

// ── Utilities ───────────────────────────────────────────────────────────────
function formatDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleString();
}

function showMessage(el, text, status) {
  el.textContent = text;
  el.classList.remove("success", "error");
  if (status) el.classList.add(status);
}

function statusBadge(status) {
  return status === "Completed"
    ? '<span class="status-badge complete">Completed</span>'
    : '<span class="status-badge pending">Pending</span>';
}

function uniqueValues(list, key) {
  return [...new Set(list.map(i => i[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function mapRow(row) {
  return {
    id:         String(row.id),
    name:       row.name       || "-",
    phone:      row.phone      || "-",
    test:       row.test       || "-",
    date:       row.appointment_date  || "-",
    slot:       row.time_slot         || "-",
    collection: row.collection_type   || "-",
    status:     row.status || (row.report_url ? "Completed" : "Pending"),
    report: row.report_url ? {
      fileName:   row.report_filename || "report",
      content:    row.report_url,
      note:       row.report_note     || "",
      uploadedAt: row.updated_at      || row.created_at || null,
      mimeType:   (row.report_filename || "").toLowerCase().endsWith(".pdf")
                    ? "application/pdf" : "image/jpeg"
    } : null,
    bookedAt: row.created_at || null
  };
}

// ── Doctor login ────────────────────────────────────────────────────────────
function setupDoctorLoginPage() {
  const form = document.getElementById("doctorLoginForm");
  if (!form) return;
  const msg = document.getElementById("doctorLoginMessage");

  form.addEventListener("submit", e => {
    e.preventDefault();
    if (!form.checkValidity()) {
      showMessage(msg, "Please enter doctor ID and password.", "error");
      return;
    }
    const fd  = new FormData(form);
    const id  = String(fd.get("doctorId")).trim();
    const pwd = String(fd.get("password")).trim();

    if (id === VALID_DOCTOR_ID && pwd === VALID_PASSWORD) {
      localStorage.setItem(DOCTOR_SESSION_KEY, "active");
      window.location.href = "doctor-dashboard.html";
      return;
    }
    showMessage(msg, "Invalid credentials. Please try again.", "error");
  });
}

// ── Doctor dashboard ────────────────────────────────────────────────────────
async function setupDoctorDashboardPage() {
  const body = document.getElementById("appointmentsBody");
  if (!body) return;

  if (localStorage.getItem(DOCTOR_SESSION_KEY) !== "active") {
    window.location.href = "doctor-login.html";
    return;
  }

  // DOM refs — appointments tab
  const filterDate       = document.getElementById("filterDate");
  const filterTest       = document.getElementById("filterTest");
  const filterCollection = document.getElementById("filterCollection");
  const filterStatus     = document.getElementById("filterStatus");
  const filterSearch     = document.getElementById("filterSearch");
  const clearFiltersBtn  = document.getElementById("clearFiltersBtn");
  const emptyState       = document.getElementById("emptyState");
  const totalCount       = document.getElementById("totalCount");
  const totalCount2      = document.getElementById("totalCount2");
  const filteredCount    = document.getElementById("filteredCount");
  const pendingCount     = document.getElementById("pendingCount");
  const completedCount   = document.getElementById("completedCount");
  const reportsCount     = document.getElementById("reportsCount");
  const logoutBtn        = document.getElementById("doctorLogoutBtn");

  // DOM refs — modal
  const reportModal       = document.getElementById("reportModal");
  const closeModalBtn     = document.getElementById("closeModalBtn");
  const modalPatientInfo  = document.getElementById("modalPatientInfo");
  const reportUploadForm  = document.getElementById("reportUploadForm");
  const reportFileInput   = document.getElementById("reportFileInput");
  const doctorNoteInput   = document.getElementById("doctorNoteInput");
  const uploadMessage     = document.getElementById("uploadMessage");
  const existingReportBox = document.getElementById("existingReportBox");

  // DOM refs — reports tab
  const reportsBody       = document.getElementById("reportsBody");
  const reportSearch      = document.getElementById("reportSearch");
  const clearReportSearch = document.getElementById("clearReportSearch");
  const reportsEmptyState = document.getElementById("reportsEmptyState");

  // ── Tab switching ──
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    });
  });

  // ── Load all data from Supabase ──
  body.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:1.5rem;">Loading appointments…</td></tr>`;
  reportsBody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:1rem;">Loading reports…</td></tr>`;

  let appointments = [];
  try {
    const rows = await fetchAllBookings();
    appointments = rows.map(mapRow);
  } catch (err) {
    body.innerHTML = `<tr><td colspan="9" style="color:#b93232;padding:1rem;">Failed to load: ${err.message}</td></tr>`;
    return;
  }

  // ── Metrics ──
  const completed = appointments.filter(a => a.status === "Completed");
  const pending   = appointments.filter(a => a.status === "Pending");
  const withReport = appointments.filter(a => a.report);

  totalCount.textContent     = appointments.length;
  totalCount2.textContent    = appointments.length;
  pendingCount.textContent   = pending.length;
  completedCount.textContent = completed.length;
  reportsCount.textContent   = withReport.length;

  // ── Populate test filter ──
  uniqueValues(appointments, "test").forEach(t => {
    const opt = document.createElement("option");
    opt.value = t; opt.textContent = t;
    filterTest.appendChild(opt);
  });

  let selectedAppointmentId = null;

  // ── Modal open/close ──
  function openModal(appointmentId) {
    selectedAppointmentId = appointmentId;
    const apt = appointments.find(a => a.id === appointmentId);
    if (!apt) return;

    modalPatientInfo.textContent =
      `${apt.name} | ${apt.phone} | ${apt.test} | ${apt.date} ${apt.slot}`;
    showMessage(uploadMessage, "", "");
    reportUploadForm.reset();

    if (apt.report) {
      existingReportBox.classList.remove("hidden");
      existingReportBox.innerHTML = `
        <h3>Existing Report</h3>
        <p><strong>File:</strong> ${apt.report.fileName}</p>
        <p><strong>Uploaded:</strong> ${formatDateTime(apt.report.uploadedAt)}</p>
        <p><strong>Note:</strong> ${apt.report.note || "-"}</p>
        <div style="display:flex;gap:0.6rem;margin-top:0.5rem;flex-wrap:wrap;">
          <a class="btn btn-outline" href="report-viewer.html?appointmentId=${encodeURIComponent(apt.id)}">View</a>
          <a class="btn btn-primary" target="_blank" href="${apt.report.content}">Download</a>
        </div>`;
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

  // ── Render appointments table ──
  function renderAppointments() {
    const dateVal   = filterDate.value;
    const testVal   = filterTest.value;
    const colVal    = filterCollection.value;
    const statVal   = filterStatus.value;
    const srchVal   = filterSearch.value.trim().toLowerCase();

    const filtered = appointments.filter(row => {
      return (!dateVal  || row.date       === dateVal)
          && (!testVal  || row.test       === testVal)
          && (!colVal   || row.collection === colVal)
          && (!statVal  || row.status     === statVal)
          && (!srchVal  || `${row.name} ${row.phone}`.toLowerCase().includes(srchVal));
    });

    filteredCount.textContent = filtered.length;
    body.innerHTML = "";

    if (!filtered.length) {
      emptyState.textContent = "No appointments found for selected filters.";
      return;
    }
    emptyState.textContent = "";

    filtered.forEach(row => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row.id}</td>
        <td><button type="button" class="patient-link" data-id="${row.id}">${row.name}</button></td>
        <td>${row.phone}</td>
        <td>${row.test}</td>
        <td>${row.date}</td>
        <td>${row.slot}</td>
        <td>${row.collection}</td>
        <td>${statusBadge(row.status)}</td>
        <td>${formatDateTime(row.bookedAt)}</td>`;
      body.appendChild(tr);
    });

    body.querySelectorAll(".patient-link").forEach(btn =>
      btn.addEventListener("click", () => openModal(btn.dataset.id))
    );
  }

  // ── Render reports table ──
  function renderReports() {
    const q = (reportSearch.value || "").trim().toLowerCase();
    const withReports = appointments.filter(a => a.report);
    const filtered = q
      ? withReports.filter(a =>
          `${a.name} ${a.phone} ${a.test}`.toLowerCase().includes(q))
      : withReports;

    reportsBody.innerHTML = "";

    if (!filtered.length) {
      reportsEmptyState.textContent = q
        ? "No reports match your search."
        : "No reports uploaded yet.";
      return;
    }
    reportsEmptyState.textContent = "";

    filtered.forEach(row => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row.id}</td>
        <td>${row.name}</td>
        <td>${row.phone}</td>
        <td>${row.test}</td>
        <td>${row.date}</td>
        <td>${row.report.fileName}</td>
        <td>${row.report.note || "-"}</td>
        <td>${formatDateTime(row.report.uploadedAt)}</td>
        <td style="display:flex;gap:0.4rem;flex-wrap:wrap;">
          <a class="btn btn-outline" style="padding:0.3rem 0.7rem;font-size:0.8rem;"
             href="report-viewer.html?appointmentId=${encodeURIComponent(row.id)}">View</a>
          <a class="btn btn-primary" style="padding:0.3rem 0.7rem;font-size:0.8rem;"
             target="_blank" href="${row.report.content}">Download</a>
        </td>`;
      reportsBody.appendChild(tr);
    });
  }

  // ── Report upload ──
  reportUploadForm.addEventListener("submit", async e => {
    e.preventDefault();
    const apt = appointments.find(a => a.id === selectedAppointmentId);
    if (!apt) { showMessage(uploadMessage, "Appointment not found.", "error"); return; }

    const file = reportFileInput.files[0];
    if (!file) { showMessage(uploadMessage, "Please choose a report file.", "error"); return; }

    showMessage(uploadMessage, "Uploading file…", "");

    try {
      // 1. Upload to Supabase Storage
      const publicUrl = await uploadFileToStorage(file);

      // 2. Save URL to bookings table
      await patchBooking(apt.id, {
        report_url:      publicUrl,
        report_filename: file.name,
        report_note:     doctorNoteInput.value.trim(),
        status:          "Completed"
      });

      // 3. Update local state
      apt.report = {
        fileName:   file.name,
        content:    publicUrl,
        note:       doctorNoteInput.value.trim(),
        uploadedAt: new Date().toISOString(),
        mimeType:   file.type
      };
      apt.status = "Completed";

      // Refresh counts
      const withReport = appointments.filter(a => a.report);
      reportsCount.textContent   = withReport.length;
      completedCount.textContent = appointments.filter(a => a.status === "Completed").length;
      pendingCount.textContent   = appointments.filter(a => a.status === "Pending").length;

      renderAppointments();
      renderReports();
      openModal(apt.id);
      showMessage(uploadMessage, "Report uploaded successfully! Patient can now view it.", "success");
    } catch (err) {
      showMessage(uploadMessage, "Upload failed: " + err.message, "error");
    }
  });

  // ── Filter events ──
  [filterDate, filterTest, filterCollection, filterStatus, filterSearch].forEach(el => {
    el.addEventListener("input", renderAppointments);
    el.addEventListener("change", renderAppointments);
  });

  clearFiltersBtn.addEventListener("click", () => {
    filterDate.value = filterTest.value = filterCollection.value =
    filterStatus.value = filterSearch.value = "";
    renderAppointments();
  });

  reportSearch.addEventListener("input", renderReports);
  clearReportSearch.addEventListener("click", () => {
    reportSearch.value = "";
    renderReports();
  });

  closeModalBtn.addEventListener("click", closeModal);
  reportModal.addEventListener("click", e => { if (e.target === reportModal) closeModal(); });

  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem(DOCTOR_SESSION_KEY);
    window.location.href = "doctor-login.html";
  });

  renderAppointments();
  renderReports();
}

setupDoctorLoginPage();
setupDoctorDashboardPage();
