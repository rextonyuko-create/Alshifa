const APPOINTMENTS_KEY = "alshifaAppointments";
const DOCTOR_SESSION_KEY = "alshifaDoctorSession";
const TEMP_DOCTOR_ID = "doctor@alshifa.local";
const TEMP_DOCTOR_PASSWORD = "alshifa123";

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

function setStoredAppointments(list) {
  localStorage.setItem(APPOINTMENTS_KEY, JSON.stringify(list));
}

function resolveDoctorEmail(input) {
  const value = String(input || "").trim().toLowerCase();
  if (!value) {
    return "";
  }
  if (value.includes("@")) {
    return value;
  }
  return `${value}@alshifa.local`;
}

function showMessage(el, text, status) {
  if (!el) {
    return;
  }

  el.textContent = text;
  el.classList.remove("success", "error");
  if (status) {
    el.classList.add(status);
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

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}

function normalizeLocalAppointment(row) {
  if (!row) {
    return null;
  }

  const report = row.report
    ? {
        fileName: row.report.fileName || row.report.file_name || "",
        mimeType: row.report.mimeType || row.report.mime_type || "",
        content: row.report.content || row.report.publicUrl || row.report.public_url || "",
        note: row.report.note || row.report.doctor_note || "",
        uploadedAt: row.report.uploadedAt || row.report.uploaded_at || ""
      }
    : null;

  return {
    id: row.bookingId || row.booking_id || row.id || "",
    appointmentUuid: row.id || row.appointmentUuid || "",
    bookingId: row.bookingId || row.booking_id || row.id || "",
    name: row.name || row.full_name || "",
    phone: row.phone || "",
    test: row.test || row.test_name || "",
    date: row.date || row.appointment_date || "",
    slot: row.slot || row.time_slot || "",
    collection: row.collection || row.collection_type || "",
    status: row.status || (report ? "Completed" : "Pending"),
    bookedAt: row.bookedAt || row.booked_at || "",
    updatedAt: row.updatedAt || row.updated_at || "",
    source: row.source || "local",
    report
  };
}

function normalizeApiAppointment(row) {
  if (!row) {
    return null;
  }

  const report = Array.isArray(row.als_reports) ? row.als_reports[0] : row.report || null;

  return {
    id: row.booking_id || row.id || "",
    appointmentUuid: row.id || "",
    bookingId: row.booking_id || row.id || "",
    name: row.full_name || row.name || "",
    phone: row.phone || "",
    test: row.test_name || row.test || "",
    date: row.appointment_date || row.date || "",
    slot: row.time_slot || row.slot || "",
    collection: row.collection_type || row.collection || "",
    status: row.status || (report ? "Completed" : "Pending"),
    bookedAt: row.booked_at || row.bookedAt || "",
    updatedAt: row.updated_at || row.updatedAt || "",
    source: row.source || "supabase",
    report: report ? {
      fileName: report.file_name || report.fileName || "",
      mimeType: report.mime_type || report.mimeType || "",
      content: report.public_url || report.publicUrl || "",
      note: report.doctor_note || report.note || "",
      uploadedAt: report.uploaded_at || report.uploadedAt || "",
      storagePath: report.storage_path || report.storagePath || "",
      storageBucket: report.storage_bucket || report.storageBucket || ""
    } : null
  };
}

function mergeAppointmentRecords(apiRow, localRow) {
  const merged = {
    ...localRow,
    ...apiRow,
    report: apiRow.report || localRow?.report || null
  };

  merged.id = apiRow.id || localRow?.id || localRow?.bookingId || "";
  merged.bookingId = apiRow.bookingId || merged.id;
  merged.name = apiRow.name || localRow?.name || "";
  merged.phone = apiRow.phone || localRow?.phone || "";
  merged.test = apiRow.test || localRow?.test || "";
  merged.date = apiRow.date || localRow?.date || "";
  merged.slot = apiRow.slot || localRow?.slot || "";
  merged.collection = apiRow.collection || localRow?.collection || "";
  merged.bookedAt = apiRow.bookedAt || localRow?.bookedAt || "";
  merged.updatedAt = apiRow.updatedAt || localRow?.updatedAt || "";
  merged.status = apiRow.status || localRow?.status || (merged.report ? "Completed" : "Pending");
  merged.source = apiRow.source || localRow?.source || "supabase";
  merged.appointmentUuid = apiRow.appointmentUuid || localRow?.appointmentUuid || "";

  return merged;
}

function mergeAppointments(apiAppointments, localAppointments) {
  const byId = new Map();

  localAppointments.map(normalizeLocalAppointment).filter(Boolean).forEach((item) => {
    byId.set(item.id, item);
  });

  apiAppointments.map(normalizeApiAppointment).filter(Boolean).forEach((item) => {
    const existing = byId.get(item.id);
    byId.set(item.id, existing ? mergeAppointmentRecords(item, existing) : item);
  });

  return Array.from(byId.values()).sort((a, b) => new Date(b.bookedAt || 0) - new Date(a.bookedAt || 0));
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

function statusBadge(status) {
  if (status === "Completed") {
    return '<span class="status-badge complete">Completed</span>';
  }
  return '<span class="status-badge pending">Pending</span>';
}

async function loginStaff(doctorId, password) {
  if (window.alsAuthLogin) {
    try {
      const response = await window.alsAuthLogin(doctorId, password);
      if (!response.ok) {
        throw new Error((response.data && response.data.error_description) || "Unable to sign in.");
      }

      const session = response.data;
      const profileLookup = await window.alsSupabaseRequest(`/rest/v1/als_staff_profiles?id=eq.${encodeURIComponent(session.user.id)}&select=id,role,display_name,is_active`, {
        accessToken: session.access_token
      });

      if (!profileLookup.ok || !Array.isArray(profileLookup.data) || !profileLookup.data[0] || !profileLookup.data[0].is_active) {
        throw new Error("This account is not enabled for staff access.");
      }

      return {
        session,
        user: session.user,
        profile: profileLookup.data[0],
        mode: "supabase"
      };
    } catch (error) {
      if (doctorId === TEMP_DOCTOR_ID && password === TEMP_DOCTOR_PASSWORD) {
        return {
          session: {
            access_token: "",
            refresh_token: "",
            expires_at: null,
            user: {
              id: "local-doctor",
              email: TEMP_DOCTOR_ID
            }
          },
          user: {
            id: "local-doctor",
            email: TEMP_DOCTOR_ID
          },
          profile: {
            id: "local-doctor",
            role: "doctor",
            display_name: "Doctor",
            is_active: true
          },
          mode: "local"
        };
      }

      throw error;
    }
  }

  if (doctorId === TEMP_DOCTOR_ID && password === TEMP_DOCTOR_PASSWORD) {
    return {
      session: {
        access_token: "",
        refresh_token: "",
        expires_at: null,
        user: {
          id: "local-doctor",
          email: TEMP_DOCTOR_ID
        }
      },
      user: {
        id: "local-doctor",
        email: TEMP_DOCTOR_ID
      },
      profile: {
        id: "local-doctor",
        role: "doctor",
        display_name: "Doctor",
        is_active: true
      },
      mode: "local"
    };
  }

  throw new Error("Unable to sign in.");
}

async function fetchDoctorAppointments(accessToken) {
  const response = await window.alsFetchDoctorAppointments(accessToken);
  if (!response.ok) {
    const error = new Error((response.data && response.data.message) || "Unable to load appointments.");
    error.status = response.status;
    throw error;
  }

  return Array.isArray(response.data) ? response.data : [];
}

async function uploadReportToApi(accessToken, appointment, file, doctorNote) {
  const result = await window.alsUploadReport(accessToken, appointment.appointmentUuid || appointment.id, appointment.id, file, doctorNote);
  return result;
}

function setupDoctorLoginPage() {
  const form = document.getElementById("doctorLoginForm");
  if (!form) {
    return;
  }

  const messageBox = document.getElementById("doctorLoginMessage");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      showMessage(messageBox, "Please enter your staff email and password.", "error");
      form.reportValidity();
      return;
    }

    const formData = new FormData(form);
    const doctorId = resolveDoctorEmail(formData.get("doctorId"));
    const password = String(formData.get("password")).trim();

    try {
      const result = await loginStaff(doctorId, password);
      localStorage.setItem(DOCTOR_SESSION_KEY, JSON.stringify({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token,
        expires_at: result.session.expires_at,
        user: result.user,
        profile: result.profile,
        mode: result.mode
      }));
      window.location.href = "doctor-dashboard.html";
    } catch (error) {
      showMessage(messageBox, error.message || "Invalid credentials. Please try again.", "error");
    }
  });
}

async function setupDoctorDashboardPage() {
  const body = document.getElementById("appointmentsBody");
  if (!body) {
    return;
  }

  const sessionRaw = localStorage.getItem(DOCTOR_SESSION_KEY);
  if (!sessionRaw) {
    window.location.href = "doctor-login.html";
    return;
  }

  let session;
  try {
    session = JSON.parse(sessionRaw);
  } catch {
    localStorage.removeItem(DOCTOR_SESSION_KEY);
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

  let appointments = mergeAppointments([], getStoredAppointments());
  let selectedAppointmentId = null;

  function persistAppointments() {
    setStoredAppointments(appointments);
  }

  function findSelectedAppointment() {
    return appointments.find((item) => item.id === selectedAppointmentId) || null;
  }

  function renderReports() {
    const reportsBody = document.getElementById("reportsTbody");
    if (!reportsBody) {
      return;
    }

    const query = (document.getElementById("reportsSearch")?.value || "").toLowerCase();
    const filtered = appointments.filter((item) => item.report).filter((item) => {
      if (!query) {
        return true;
      }
      return item.name.toLowerCase().includes(query) ||
        item.phone.includes(query) ||
        item.test.toLowerCase().includes(query);
    });

    if (filtered.length === 0) {
      reportsBody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#888">No reports uploaded yet.</td></tr>';
      return;
    }

    reportsBody.innerHTML = filtered.map((item) => `
      <tr>
        <td>${item.name}</td>
        <td>${item.phone}</td>
        <td>${item.test}</td>
        <td>${item.date}</td>
        <td>${item.report.fileName}</td>
        <td>${item.report.note || "-"}</td>
        <td>${item.report.uploadedAt ? new Date(item.report.uploadedAt).toLocaleDateString() : "-"}</td>
        <td>
          <a href="${item.report.content}" target="_blank" class="action-btn" style="text-decoration:none">View</a>
          <a href="${item.report.content}" download="${item.report.fileName}" class="action-btn" style="text-decoration:none;margin-left:4px">Download</a>
        </td>
      </tr>
    `).join("");
  }

  function updateMetrics() {
    const completedCount = appointments.filter((item) => item.status === "Completed").length;
    const reportsCount = appointments.filter((item) => item.report).length;
    if (totalCount) {
      totalCount.textContent = String(appointments.length);
    }
    if (filteredCount) {
      const visibleRows = body.querySelectorAll("tr").length;
      filteredCount.textContent = String(visibleRows);
    }
    const pendingCard = document.getElementById("pendingAppointments");
    const completedCard = document.getElementById("completedAppointments");
    const reportsCard = document.getElementById("reportsUploaded");
    if (pendingCard) {
      pendingCard.textContent = String(appointments.filter((item) => item.status === "Pending").length);
    }
    if (completedCard) {
      completedCard.textContent = String(completedCount);
    }
    if (reportsCard) {
      reportsCard.textContent = String(reportsCount);
    }
  }

  function renderRows() {
    const query = (filterSearch?.value || "").toLowerCase();
    const dateValue = filterDate?.value || "";
    const testValue = filterTest?.value || "";
    const collectionValue = filterCollection?.value || "";
    const statusValue = filterStatus?.value || "";

    const filtered = appointments.filter((item) => {
      const matchDate = !dateValue || item.date === dateValue;
      const matchTest = !testValue || item.test === testValue;
      const matchCollection = !collectionValue || item.collection === collectionValue;
      const matchStatus = !statusValue || item.status === statusValue;
      const matchQuery = !query ||
        item.name.toLowerCase().includes(query) ||
        item.phone.includes(query) ||
        item.test.toLowerCase().includes(query);
      return matchDate && matchTest && matchCollection && matchStatus && matchQuery;
    });

    if (!filtered.length) {
      body.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#888">No appointments found.</td></tr>';
      if (emptyState) {
        emptyState.textContent = "No appointments match the current filters.";
      }
      updateMetrics();
      return;
    }

    if (emptyState) {
      emptyState.textContent = "";
    }

    body.innerHTML = filtered.map((item) => `
      <tr>
        <td>${item.bookingId || item.id}</td>
        <td><a href="#" class="patient-link" data-id="${item.id}" style="color:#1a73e8;text-decoration:underline;cursor:pointer">${item.name}</a></td>
        <td>${item.phone}</td>
        <td>${item.test}</td>
        <td>${item.date}</td>
        <td>${item.slot}</td>
        <td>${item.collection}</td>
        <td>${statusBadge(item.status)}</td>
        <td>${item.bookedAt ? formatDateTime(item.bookedAt) : "-"}</td>
      </tr>
    `).join("");

    body.querySelectorAll(".patient-link").forEach((el) => {
      el.addEventListener("click", (event) => {
        event.preventDefault();
        openModal(el.dataset.id);
      });
    });

    updateMetrics();
  }

  function openModal(appointmentId) {
    selectedAppointmentId = appointmentId;
    const appointment = findSelectedAppointment();
    if (!appointment || !reportModal) {
      return;
    }

    if (modalPatientInfo) {
      modalPatientInfo.textContent = `${appointment.name} | ${appointment.phone} | ${appointment.test} | ${appointment.date} ${appointment.slot}`;
    }

    if (reportUploadForm) {
      reportUploadForm.reset();
    }
    showMessage(uploadMessage, "", "");

    if (appointment.report) {
      existingReportBox.classList.remove("hidden");
      existingReportBox.innerHTML = `
        <h3>Existing Report</h3>
        <p><strong>File:</strong> ${appointment.report.fileName || "-"}</p>
        <p><strong>Updated:</strong> ${formatDateTime(appointment.report.uploadedAt)}</p>
        <p><strong>Note:</strong> ${appointment.report.note || "-"}</p>
        <p>
          <a class="btn btn-outline" href="report-viewer.html?appointmentId=${encodeURIComponent(appointment.id)}">View</a>
          <a class="btn btn-primary" download="${appointment.report.fileName || "report"}" href="${appointment.report.content || "#"}">Download</a>
        </p>
      `;
    } else {
      existingReportBox.classList.add("hidden");
      existingReportBox.innerHTML = "";
    }

    reportModal.classList.remove("hidden");
  }

  async function loadAppointments() {
    try {
      if (session?.access_token && window.alsFetchDoctorAppointments) {
        const apiAppointments = await fetchDoctorAppointments(session.access_token);
        appointments = mergeAppointments(apiAppointments, getStoredAppointments());
        persistAppointments();
      } else {
        appointments = mergeAppointments([], getStoredAppointments());
      }
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        localStorage.removeItem(DOCTOR_SESSION_KEY);
        window.location.href = "doctor-login.html";
        return;
      }

      appointments = mergeAppointments([], getStoredAppointments());
    }

    uniqueValues(appointments, "test").forEach((testName) => {
      const option = document.createElement("option");
      option.value = testName;
      option.textContent = testName;
      filterTest?.appendChild(option);
    });

    renderRows();
    renderReports();
    updateMetrics();
  }

  async function fetchDoctorAppointments(accessToken) {
    const response = await window.alsFetchDoctorAppointments(accessToken);
    if (!response.ok) {
      const error = new Error((response.data && response.data.message) || "Unable to load appointments.");
      error.status = response.status;
      throw error;
    }
    return Array.isArray(response.data) ? response.data : [];
  }

  reportUploadForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const appointment = findSelectedAppointment();

    if (!appointment) {
      showMessage(uploadMessage, "Appointment not found.", "error");
      return;
    }

    const file = reportFileInput?.files && reportFileInput.files[0];
    if (!file) {
      showMessage(uploadMessage, "Please select a file.", "error");
      return;
    }

    try {
      if (session?.access_token && window.alsUploadReport) {
        const updatedAppointment = await uploadReportToApi(session.access_token, appointment, file, doctorNoteInput?.value.trim() || "");
        const normalized = normalizeLocalAppointment(updatedAppointment);
        appointments = mergeAppointments([normalized], appointments.filter((item) => item.id !== normalized.id));
        persistAppointments();
        renderRows();
        renderReports();
        openModal(appointment.id);
        showMessage(uploadMessage, "Report uploaded successfully and patient marked completed.", "success");
      } else {
        const content = await fileToDataUrl(file);
        appointment.report = {
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          content,
          note: doctorNoteInput?.value.trim() || "",
          uploadedAt: new Date().toISOString()
        };
        appointment.status = "Completed";
        persistAppointments();
        renderRows();
        renderReports();
        openModal(appointment.id);
        showMessage(uploadMessage, "Report saved locally. Supabase upload is unavailable, so it is only available in this browser for now.", "error");
      }
    } catch (error) {
      try {
        const content = await fileToDataUrl(file);
        appointment.report = {
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          content,
          note: doctorNoteInput?.value.trim() || "",
          uploadedAt: new Date().toISOString()
        };
        appointment.status = "Completed";
        persistAppointments();
        renderRows();
        renderReports();
        openModal(appointment.id);
        showMessage(uploadMessage, error.message || "Supabase upload failed, so the report was saved locally in this browser.", "error");
      } catch {
        showMessage(uploadMessage, error.message || "Unable to upload report. Please retry.", "error");
      }
    }
  });

  closeModalBtn?.addEventListener("click", () => {
    reportModal.classList.add("hidden");
  });

  reportModal?.addEventListener("click", (event) => {
    if (event.target === reportModal) {
      reportModal.classList.add("hidden");
    }
  });

  logoutBtn?.addEventListener("click", () => {
    localStorage.removeItem(DOCTOR_SESSION_KEY);
    window.location.href = "doctor-login.html";
  });

  filterDate?.addEventListener("change", renderRows);
  filterTest?.addEventListener("change", renderRows);
  filterCollection?.addEventListener("change", renderRows);
  filterStatus?.addEventListener("change", renderRows);
  filterSearch?.addEventListener("input", renderRows);
  clearFiltersBtn?.addEventListener("click", () => {
    if (filterDate) filterDate.value = "";
    if (filterTest) filterTest.value = "";
    if (filterCollection) filterCollection.value = "";
    if (filterStatus) filterStatus.value = "";
    if (filterSearch) filterSearch.value = "";
    renderRows();
  });

  await loadAppointments();
}

setupDoctorLoginPage();
setupDoctorDashboardPage();
