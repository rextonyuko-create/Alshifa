const SUPABASE_URL = "https://zzxemxfwngaxqipqikucw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6ZW14ZnduZ2F4cWlwcWlrdWN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxOTA2NDAsImV4cCI6MjA5NTc2NjY0MH0.2mw_EtCevpoombb1UK7Gxu-qXX9LW5tpBxqHX8gzkYI";

const DOCTOR_USERNAME = "doctor";
const DOCTOR_PASSWORD = "alshifa123";
const STORAGE_BUCKET  = "reports";

// ── helpers ──────────────────────────────────────────────────────────────────
function sbHeaders(extra = {}) {
  return {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    ...extra
  };
}

async function sbFetch(path, options = {}) {
  const resp = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: { ...sbHeaders(), ...(options.headers || {}) }
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.message || `Request failed: ${resp.status}`);
  }
  return resp.status === 204 ? null : resp.json();
}

// ── login page ───────────────────────────────────────────────────────────────
const loginSection    = document.getElementById("loginSection");
const dashboardSection = document.getElementById("dashboardSection");

if (loginSection) {
  const loginForm    = document.getElementById("loginForm");
  const loginMessage = document.getElementById("loginMessage");

  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const user = document.getElementById("username").value.trim();
    const pass = document.getElementById("password").value.trim();
    if (user === DOCTOR_USERNAME && pass === DOCTOR_PASSWORD) {
      sessionStorage.setItem("doctorLoggedIn", "true");
      window.location.href = "doctor-dashboard.html";
    } else {
      loginMessage.textContent = "Invalid username or password.";
      loginMessage.style.color = "red";
    }
  });
}

// ── dashboard ────────────────────────────────────────────────────────────────
if (dashboardSection) {
  if (sessionStorage.getItem("doctorLoggedIn") !== "true") {
    window.location.href = "doctor-login.html";
  }

  // DOM refs
  const logoutBtn         = document.getElementById("logoutBtn");
  const appointmentsTab   = document.getElementById("appointmentsTab");
  const reportsTab        = document.getElementById("reportsTab");
  const appointmentsPanel = document.getElementById("appointmentsPanel");
  const reportsPanel      = document.getElementById("reportsPanel");
  const searchInput       = document.getElementById("searchInput");
  const statusFilter      = document.getElementById("statusFilter");
  const appointmentsTbody = document.getElementById("appointmentsTbody");
  const reportsTbody      = document.getElementById("reportsTbody");
  const reportsSearch     = document.getElementById("reportsSearch");

  // modal refs
  const modal             = document.getElementById("appointmentModal");
  const modalClose        = document.getElementById("modalClose");
  const modalName         = document.getElementById("modalName");
  const modalPhone        = document.getElementById("modalPhone");
  const modalTest         = document.getElementById("modalTest");
  const modalDate         = document.getElementById("modalDate");
  const modalSlot         = document.getElementById("modalSlot");
  const modalCollection   = document.getElementById("modalCollection");
  const modalStatus       = document.getElementById("modalStatus");
  const modalBookedAt     = document.getElementById("modalBookedAt");
  const reportUploadSection = document.getElementById("reportUploadSection");
  const reportUploadForm  = document.getElementById("reportUploadForm");
  const reportFileInput   = document.getElementById("reportFile");
  const doctorNoteInput   = document.getElementById("doctorNote");
  const uploadMessage     = document.getElementById("uploadMessage");
  const existingReport    = document.getElementById("existingReport");
  const existingFileName  = document.getElementById("existingFileName");
  const existingNote      = document.getElementById("existingNote");
  const existingUploadedAt = document.getElementById("existingUploadedAt");
  const viewReportBtn     = document.getElementById("viewReportBtn");
  const downloadReportBtn = document.getElementById("downloadReportBtn");

  // metric cards
  const totalCard     = document.getElementById("totalAppointments");
  const pendingCard   = document.getElementById("pendingAppointments");
  const completedCard = document.getElementById("completedAppointments");
  const reportsCard   = document.getElementById("reportsUploaded");

  let appointments = [];
  let currentId   = null;

  // ── fetch all bookings from Supabase ──────────────────────────────────────
  async function fetchAppointments() {
    try {
      const data = await sbFetch("/rest/v1/bookings?select=*&order=created_at.desc");
      appointments = (data || []).map((row) => ({
        id:         String(row.id),
        name:       row.name       || "",
        phone:      row.phone      || "",
        test:       row.test       || "",
        date:       row.appointment_date || "",
        slot:       row.time_slot  || "",
        collection: row.collection_type  || "",
        status:     row.status     || (row.report_url ? "Completed" : "Pending"),
        bookedAt:   row.created_at || null,
        report: row.report_url ? {
          fileName:   row.report_filename || "report",
          content:    row.report_url,
          note:       row.report_note || "",
          uploadedAt: row.updated_at || row.created_at || null,
          mimeType:   (row.report_filename || "").endsWith(".pdf") ? "application/pdf" : "image/jpeg"
        } : null
      }));
      renderRows();
      renderReports();
      updateMetrics();
    } catch (err) {
      console.error("Failed to load appointments:", err);
      if (appointmentsTbody) {
        appointmentsTbody.innerHTML = `<tr><td colspan="7" style="color:red;text-align:center">Failed to load appointments: ${err.message}</td></tr>`;
      }
    }
  }

  // ── render appointments table ─────────────────────────────────────────────
  function renderRows() {
    if (!appointmentsTbody) return;
    const query  = (searchInput?.value || "").toLowerCase();
    const status = statusFilter?.value || "all";
    const filtered = appointments.filter((a) => {
      const matchQ = !query ||
        a.name.toLowerCase().includes(query) ||
        a.phone.includes(query) ||
        a.test.toLowerCase().includes(query);
      const matchS = status === "all" || a.status.toLowerCase() === status.toLowerCase();
      return matchQ && matchS;
    });

    if (filtered.length === 0) {
      appointmentsTbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888">No appointments found.</td></tr>';
      return;
    }

    appointmentsTbody.innerHTML = filtered.map((a) => `
      <tr>
        <td><a href="#" class="patient-link" data-id="${a.id}" style="color:#1a73e8;text-decoration:underline;cursor:pointer">${a.name}</a></td>
        <td>${a.phone}</td>
        <td>${a.test}</td>
        <td>${a.date}</td>
        <td>${a.slot}</td>
        <td><span class="status-badge ${a.status.toLowerCase()}">${a.status}</span></td>
        <td>
          <button class="action-btn upload-btn" data-id="${a.id}">
            ${a.report ? "Update Report" : "Upload Report"}
          </button>
        </td>
      </tr>
    `).join("");

    appointmentsTbody.querySelectorAll(".patient-link, .upload-btn").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        openModal(el.dataset.id);
      });
    });
  }

  // ── render reports table ──────────────────────────────────────────────────
  function renderReports() {
    if (!reportsTbody) return;
    const query = (reportsSearch?.value || "").toLowerCase();
    const withReports = appointments.filter((a) => a.report);
    const filtered = withReports.filter((a) =>
      !query ||
      a.name.toLowerCase().includes(query) ||
      a.phone.includes(query) ||
      a.test.toLowerCase().includes(query)
    );

    if (filtered.length === 0) {
      reportsTbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#888">No reports uploaded yet.</td></tr>';
      return;
    }

    reportsTbody.innerHTML = filtered.map((a) => `
      <tr>
        <td>${a.name}</td>
        <td>${a.phone}</td>
        <td>${a.test}</td>
        <td>${a.date}</td>
        <td>${a.report.fileName}</td>
        <td>${a.report.note || "-"}</td>
        <td>${a.report.uploadedAt ? new Date(a.report.uploadedAt).toLocaleDateString() : "-"}</td>
        <td>
          <a href="${a.report.content}" target="_blank" class="action-btn" style="text-decoration:none">View</a>
          <a href="${a.report.content}" download="${a.report.fileName}" class="action-btn" style="text-decoration:none;margin-left:4px">Download</a>
        </td>
      </tr>
    `).join("");
  }

  // ── update metric cards ───────────────────────────────────────────────────
  function updateMetrics() {
    if (totalCard)     totalCard.textContent     = appointments.length;
    if (pendingCard)   pendingCard.textContent   = appointments.filter((a) => a.status === "Pending").length;
    if (completedCard) completedCard.textContent = appointments.filter((a) => a.status === "Completed").length;
    if (reportsCard)   reportsCard.textContent   = appointments.filter((a) => a.report).length;
  }

  // ── open modal ────────────────────────────────────────────────────────────
  function openModal(id) {
    const a = appointments.find((x) => x.id === id);
    if (!a || !modal) return;
    currentId = id;

    modalName.textContent       = a.name;
    modalPhone.textContent      = a.phone;
    modalTest.textContent       = a.test;
    modalDate.textContent       = a.date;
    modalSlot.textContent       = a.slot;
    modalCollection.textContent = a.collection;
    modalStatus.textContent     = a.status;
    modalBookedAt.textContent   = a.bookedAt ? new Date(a.bookedAt).toLocaleString() : "N/A";

    if (a.report) {
      existingReport.style.display  = "block";
      reportUploadSection.style.display = "block";
      existingFileName.textContent  = a.report.fileName;
      existingNote.textContent      = a.report.note || "-";
      existingUploadedAt.textContent = a.report.uploadedAt ? new Date(a.report.uploadedAt).toLocaleString() : "-";
      viewReportBtn.href     = a.report.content;
      downloadReportBtn.href = a.report.content;
      downloadReportBtn.download = a.report.fileName;
    } else {
      existingReport.style.display = "none";
      reportUploadSection.style.display = "block";
    }

    uploadMessage.textContent = "";
    reportUploadForm.reset();
    modal.style.display = "flex";
  }

  // ── upload report ─────────────────────────────────────────────────────────
  reportUploadForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const appointment = appointments.find((x) => x.id === currentId);
    if (!appointment) { showMsg(uploadMessage, "Appointment not found.", "error"); return; }

    const file = reportFileInput.files && reportFileInput.files[0];
    if (!file) { showMsg(uploadMessage, "Please select a file.", "error"); return; }

    showMsg(uploadMessage, "Uploading...", "");

    try {
      // 1. Upload file to Supabase Storage
      const filePath = `${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
      const uploadResp = await fetch(
        `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${filePath}`,
        {
          method: "POST",
          headers: {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
            "Content-Type": file.type,
            "x-upsert": "true"
          },
          body: file
        }
      );
      if (!uploadResp.ok) {
        const errData = await uploadResp.json().catch(() => ({}));
        throw new Error(errData.message || "File upload failed");
      }

      // 2. Get public URL
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${filePath}`;

      // 3. Save URL to bookings table
      await sbFetch(`/rest/v1/bookings?id=eq.${appointment.id}`, {
        method: "PATCH",
        headers: { "Prefer": "return=representation" },
        body: JSON.stringify({
          report_url:      publicUrl,
          report_filename: file.name,
          report_note:     doctorNoteInput.value.trim(),
          status:          "Completed"
        })
      });

      // 4. Update local state
      appointment.report = {
        fileName:   file.name,
        content:    publicUrl,
        note:       doctorNoteInput.value.trim(),
        uploadedAt: new Date().toISOString(),
        mimeType:   file.type
      };
      appointment.status = "Completed";

      renderRows();
      renderReports();
      updateMetrics();
      openModal(currentId);
      showMsg(uploadMessage, "Report uploaded successfully!", "success");
    } catch (err) {
      showMsg(uploadMessage, "Upload failed: " + err.message, "error");
    }
  });

  function showMsg(el, text, type) {
    el.textContent = text;
    el.style.color = type === "error" ? "red" : type === "success" ? "green" : "#555";
  }

  // ── tabs ──────────────────────────────────────────────────────────────────
  appointmentsTab.addEventListener("click", () => {
    appointmentsTab.classList.add("active");
    reportsTab.classList.remove("active");
    appointmentsPanel.style.display = "block";
    reportsPanel.style.display = "none";
  });

  reportsTab.addEventListener("click", () => {
    reportsTab.classList.add("active");
    appointmentsTab.classList.remove("active");
    reportsPanel.style.display = "block";
    appointmentsPanel.style.display = "none";
    renderReports();
  });

  // ── filters ───────────────────────────────────────────────────────────────
  searchInput?.addEventListener("input", renderRows);
  statusFilter?.addEventListener("change", renderRows);
  reportsSearch?.addEventListener("input", renderReports);

  // ── modal close ───────────────────────────────────────────────────────────
  modalClose.addEventListener("click", () => { modal.style.display = "none"; });
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });

  // ── logout ────────────────────────────────────────────────────────────────
  logoutBtn.addEventListener("click", () => {
    sessionStorage.removeItem("doctorLoggedIn");
    window.location.href = "doctor-login.html";
  });

  // ── init ──────────────────────────────────────────────────────────────────
  fetchAppointments();
}
