import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const app = initializeApp(window.LOBBY_FIREBASE_CONFIG);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

const state = {
  currentUser: null,
  currentRole: null,
  appUsers: [],
  importedUsers: [],
  editingId: null,
  userPages: { cursors: [null], index: 0, next: null, params: "" }
};
let usersRequestId = 0;

const els = {
  sessionLabel: document.querySelector("#sessionLabel"),
  sessionDetail: document.querySelector("#sessionDetail"),
  loginButton: document.querySelector("#loginButton"),
  logoutButton: document.querySelector("#logoutButton"),
  adminApp: document.querySelector("#adminApp"),
  accessSection: document.querySelector("#accessSection"),
  usersTitle: document.querySelector("#usersTitle"),
  searchInput: document.querySelector("#searchInput"),
  ownerFilterWrap: document.querySelector("#ownerFilterWrap"),
  ownerFilter: document.querySelector("#ownerFilter"),
  includeInactive: document.querySelector("#includeInactive"),
  searchButton: document.querySelector("#searchButton"),
  newButton: document.querySelector("#newButton"),
  usersTableBody: document.querySelector("#usersTableBody"),
  listStatus: document.querySelector("#listStatus"),
  usersPrevious: document.querySelector("#usersPrevious"),
  usersNext: document.querySelector("#usersNext"),
  formTitle: document.querySelector("#formTitle"),
  userForm: document.querySelector("#userForm"),
  ownerFieldWrap: document.querySelector("#ownerFieldWrap"),
  resetFormButton: document.querySelector("#resetFormButton"),
  formStatus: document.querySelector("#formStatus"),
  tabButtons: Array.from(document.querySelectorAll("[data-tab-target]")),
  tabPanels: Array.from(document.querySelectorAll("[data-tab-panel]")),
  importFile: document.querySelector("#importFile"),
  importMode: document.querySelector("#importMode"),
  importOwnerWrap: document.querySelector("#importOwnerWrap"),
  importOwnerUid: document.querySelector("#importOwnerUid"),
  dryRunButton: document.querySelector("#dryRunButton"),
  importButton: document.querySelector("#importButton"),
  importStatus: document.querySelector("#importStatus"),
  importPreview: document.querySelector("#importPreview"),
  includeReviewedAccess: document.querySelector("#includeReviewedAccess"),
  refreshAccessButton: document.querySelector("#refreshAccessButton"),
  accessRequestsTableBody: document.querySelector("#accessRequestsTableBody"),
  appUsersTableBody: document.querySelector("#appUsersTableBody"),
  accessStatus: document.querySelector("#accessStatus")
};

function setStatus(element, message, type) {
  element.textContent = message || "";
  element.className = "status" + (type ? " " + type : "");
}

function isAdminRole() {
  return state.currentRole === "admin";
}

function applyRoleUi() {
  const admin = isAdminRole();
  els.accessSection.classList.toggle("hidden", !admin);
  els.ownerFilterWrap.classList.toggle("hidden", !admin);
  els.ownerFieldWrap.classList.toggle("hidden", !admin);
  els.importOwnerWrap.classList.toggle("hidden", !admin);
  els.usersTitle.textContent = admin ? "Usuarios" : "Mis usuarios";
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function asBoolean(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value == null || value === "") return fallback;
  const text = String(value).trim().toLowerCase();
  if (["true", "1", "si", "sí", "yes", "y"].includes(text)) return true;
  if (["false", "0", "no", "n"].includes(text)) return false;
  return fallback;
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("es-CL", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

function ownerLabel(uid, email) {
  const user = state.appUsers.find((item) => item.uid === uid);
  if (user) return user.email || user.displayName || user.uid;
  return email || uid || "Sin dueño";
}

function setOptions(select, users, includeAll) {
  if (!select) return;
  const previous = select.value;
  select.innerHTML = "";

  if (includeAll) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Todos";
    select.appendChild(option);
  }

  users.forEach((user) => {
    const option = document.createElement("option");
    option.value = user.uid;
    option.textContent = ownerLabel(user.uid, user.email);
    select.appendChild(option);
  });

  if (previous && users.some((user) => user.uid === previous)) {
    select.value = previous;
  }
}

function populateOwnerControls() {
  const activeUsers = state.appUsers.filter((user) => user.active && user.role !== "disabled");
  setOptions(els.ownerFilter, state.appUsers, true);
  setOptions(els.userForm.elements.namedItem("ownerUid"), activeUsers, false);
  setOptions(els.importOwnerUid, activeUsers, false);
}

function cleanValue(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") {
    const text = value.trim();
    return text === "" ? undefined : text;
  }
  if (Array.isArray(value)) {
    const items = value.map(cleanValue).filter((item) => item !== undefined);
    return items.length ? items : undefined;
  }
  if (typeof value === "object") {
    const cleaned = {};
    Object.entries(value).forEach(([key, item]) => {
      const nextValue = cleanValue(item);
      if (nextValue !== undefined) cleaned[key] = nextValue;
    });
    return Object.keys(cleaned).length ? cleaned : undefined;
  }
  return value;
}

function cleanUser(user) {
  return cleanValue(user) || {};
}

function formValue(name) {
  const field = els.userForm.elements.namedItem(name);
  return field ? field.value : "";
}

function setFormValue(name, value) {
  const field = els.userForm.elements.namedItem(name);
  if (field) field.value = value == null ? "" : value;
}

function objectFromPrefix(form, prefix) {
  const object = {};
  const start = `${prefix}.`;

  for (const [key, value] of form.entries()) {
    if (!key.startsWith(start)) continue;
    setDotted(object, key.slice(start.length), value);
  }

  return cleanValue(object) || {};
}

function fillPrefixedFields(prefix, value) {
  const source = value && typeof value === "object" ? value : {};
  Array.from(els.userForm.elements).forEach((field) => {
    if (!field.name || !field.name.startsWith(`${prefix}.`)) return;
    const path = field.name.slice(prefix.length + 1).split(".");
    let cursor = source;

    for (const part of path) {
      cursor = cursor && typeof cursor === "object" ? cursor[part] : undefined;
    }

    field.value = cursor == null ? "" : cursor;
  });
}

async function api(path, options = {}) {
  if (!state.currentUser) {
    throw new Error("Debes iniciar sesion");
  }

  const token = await state.currentUser.getIdToken();
  const headers = Object.assign({}, options.headers || {}, {
    Authorization: `Bearer ${token}`
  });

  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${window.LOBBY_API_BASE_URL}${path}`, Object.assign({}, options, { headers }));
  const body = await response.json().catch(() => null);
  if (!body) throw new Error(`La API no devolvio una respuesta valida (HTTP ${response.status}).`);

  if (!response.ok || !body.ok) {
    throw new Error(body.error || `Error llamando API (HTTP ${response.status})`);
  }

  return body;
}

function showTab(name) {
  els.tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tabTarget === name);
  });

  els.tabPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.tabPanel === name);
  });
}

function userFromForm() {
  const form = new FormData(els.userForm);
  const representado = objectFromPrefix(form, "representado");
  if (representado.pais) representado.pais = representado.pais.toUpperCase();
  return cleanUser({
    id: formValue("id"),
    label: formValue("label"),
    ownerUid: formValue("ownerUid"),
    nombres: formValue("nombres"),
    apellidos: formValue("apellidos"),
    pasaporte: formValue("pasaporte"),
    pais: formValue("pais").toUpperCase(),
    medio: formValue("medio"),
    telefono: formValue("telefono"),
    telefonoAlternativo: formValue("telefonoAlternativo"),
    email: formValue("email"),
    genero: formValue("genero"),
    otroContacto: formValue("otroContacto"),
    tipo: formValue("tipo"),
    remunerado: asBoolean(formValue("remunerado"), false),
    cargoInstitucion: formValue("cargoInstitucion"),
    representado,
    empleador: objectFromPrefix(form, "empleador"),
    active: asBoolean(formValue("active"), true)
  });
}

function validateUserForm(user) {
  if (!user.id) {
    showTab("personal");
    throw new Error("El ID es requerido.");
  }
  if (!/^[a-zA-Z0-9_-]{2,80}$/.test(String(user.id))) {
    showTab("personal");
    throw new Error("El ID solo puede contener letras, numeros, guion y guion bajo.");
  }
  if (!user.label) {
    showTab("personal");
    throw new Error("La etiqueta visible es requerida.");
  }
  if (user.pais && !/^[A-Z]{3}$/.test(user.pais)) {
    showTab("personal");
    throw new Error("El pais debe usar un codigo ISO-3, por ejemplo CHL.");
  }
  ["telefono", "telefonoAlternativo"].forEach((field) => {
    if (user[field] && !/^\+56\d{9}$/.test(user[field])) {
      showTab("personal");
      throw new Error(`${field === "telefono" ? "Telefono" : "Telefono alternativo"} debe usar +569XXXXXXXX.`);
    }
  });
  if (user.representado && user.representado.pais && !/^[A-Z]{3}$/.test(user.representado.pais)) {
    showTab("representado");
    throw new Error("El pais del representado debe usar un codigo ISO-3, por ejemplo CHL.");
  }
  if (user.representado && user.representado.identificacion === "codigo" && !user.representado.identificador) {
    showTab("representado");
    throw new Error("Ingresa el codigo identificador del representado.");
  }
  if (isAdminRole() && !user.ownerUid) {
    showTab("personal");
    throw new Error("Selecciona el usuario dueño.");
  }
}

function fillForm(user) {
  const fields = els.userForm.elements;
  state.editingId = user ? user.id : null;
  els.formTitle.textContent = user ? `Editando ${user.id}` : "Nuevo usuario";
  fields.id.readOnly = Boolean(user);
  setFormValue("id", user && user.id ? user.id : "");
  setFormValue("label", user && user.label ? user.label : "");
  setFormValue("ownerUid", user && user.ownerUid ? user.ownerUid : "");
  setFormValue("nombres", user && user.nombres ? user.nombres : "");
  setFormValue("apellidos", user && user.apellidos ? user.apellidos : "");
  setFormValue("pasaporte", user && user.pasaporte ? user.pasaporte : "");
  setFormValue("pais", user && user.pais ? user.pais : "CHL");
  setFormValue("medio", user && user.medio ? user.medio : "");
  setFormValue("telefono", user && user.telefono ? user.telefono : "");
  setFormValue("telefonoAlternativo", user && user.telefonoAlternativo ? user.telefonoAlternativo : "");
  setFormValue("email", user && user.email ? user.email : "");
  setFormValue("genero", user && user.genero ? user.genero : "");
  setFormValue("otroContacto", user && user.otroContacto ? user.otroContacto : "");
  setFormValue("tipo", user && user.tipo ? user.tipo : "lobista");
  setFormValue("remunerado", user && user.remunerado === true ? "true" : "false");
  setFormValue("cargoInstitucion", user && user.cargoInstitucion ? user.cargoInstitucion : "");
  setFormValue("active", user && user.active === false ? "false" : "true");
  fillPrefixedFields("representado", user && user.representado);
  fillPrefixedFields("empleador", user && user.empleador);

  if (!user) {
    const ownerField = fields.ownerUid;
    if (isAdminRole() && ownerField && !ownerField.value && ownerField.options.length) {
      ownerField.selectedIndex = 0;
    }
    setFormValue("representado.pais", "CHL");
    setFormValue("empleador.pais", "CHL");
  }

  showTab("personal");
  setStatus(els.formStatus, "");
}

function renderUsers(users) {
  if (!users.length) {
    els.usersTableBody.innerHTML = '<tr><td colspan="8" class="muted">Sin resultados</td></tr>';
    return;
  }

  els.usersTableBody.innerHTML = users.map((user) => {
    const name = [user.nombres, user.apellidos].filter(Boolean).join(" ") || user.label;
    const status = user.active ? '<span class="pill on">Activo</span>' : '<span class="pill off">Inactivo</span>';
    return `
      <tr>
        <td><code>${escapeHtml(user.id)}</code></td>
        <td>${escapeHtml(name)}</td>
        <td>${escapeHtml(user.pasaporte)}</td>
        <td>${escapeHtml(user.email)}</td>
        <td>${escapeHtml(user.tipo)}</td>
        <td>${escapeHtml(ownerLabel(user.ownerUid, user.ownerEmail))}</td>
        <td>${status}</td>
        <td class="actions">
          <button class="secondary" type="button" data-action="edit" data-id="${escapeHtml(user.id)}">Editar</button>
          <button class="danger" type="button" data-action="disable" data-id="${escapeHtml(user.id)}">Desactivar</button>
        </td>
      </tr>`;
  }).join("");
}

async function loadUsers(direction) {
  const requestId = ++usersRequestId;
  setStatus(els.listStatus, "Cargando usuarios...");
  const previous = state.userPages;
  const cursors = direction ? previous.cursors.slice() : [null];
  const index = direction === "next" ? previous.index + 1 : direction === "previous" ? previous.index - 1 : 0;
  if (direction === "next") cursors[index] = previous.next;
  const params = new URLSearchParams(direction ? previous.params : "");
  if (!direction) {
    params.set("q", els.searchInput.value.trim());
    params.set("includeInactive", els.includeInactive.checked ? "true" : "false");
    if (isAdminRole() && els.ownerFilter.value) params.set("ownerUid", els.ownerFilter.value);
  }
  const baseParams = params.toString();
  if (cursors[index]) params.set("cursor", cursors[index]);
  els.usersPrevious.disabled = els.usersNext.disabled = els.searchButton.disabled = true;
  try {
    const response = await api(`/lobby-users?${params.toString()}`);
    if (requestId !== usersRequestId) return;
    state.userPages = { cursors: cursors.slice(0, index + 1), index, next: response.nextCursor || null, params: baseParams };
    renderUsers(response.users || []);
    setStatus(els.listStatus, `Pagina ${index + 1}: usuarios encontrados: ${(response.users || []).length}` +
      (response.scanTruncated ? ". Se reviso solo una parte de los registros; pueden faltar resultados." : ""), "ok");
  } finally {
    if (requestId === usersRequestId) {
      els.searchButton.disabled = false;
      els.usersPrevious.disabled = state.userPages.index === 0;
      els.usersNext.disabled = !state.userPages.next;
    }
  }
}

async function editUser(id) {
  setStatus(els.formStatus, "Cargando usuario...");
  const response = await api(`/lobby-users/${encodeURIComponent(id)}`);
  fillForm(response.user);
  window.scrollTo({ top: els.userForm.getBoundingClientRect().top + window.scrollY - 80, behavior: "smooth" });
  setStatus(els.formStatus, "Usuario cargado para edicion.", "ok");
}

async function disableUser(id) {
  if (!window.confirm(`Desactivar ${id}?`)) return;
  await api(`/lobby-users/${encodeURIComponent(id)}/disable`, { method: "POST" });
  setStatus(els.listStatus, `Usuario ${id} desactivado.`, "ok");
  await loadUsers();
}

function renderAccessRequests(requests) {
  if (!requests.length) {
    els.accessRequestsTableBody.innerHTML = '<tr><td colspan="5" class="muted">Sin solicitudes</td></tr>';
    return;
  }

  els.accessRequestsTableBody.innerHTML = requests.map((request) => {
    const statusClass = request.status === "pending" ? "off" : "on";
    const actions = request.status === "pending" ? `
      <button class="primary" type="button" data-access-action="approve-operator" data-uid="${escapeHtml(request.uid)}">Aprobar operador</button>
      <button class="secondary" type="button" data-access-action="approve-admin" data-uid="${escapeHtml(request.uid)}">Aprobar admin</button>
      <button class="danger" type="button" data-access-action="reject" data-uid="${escapeHtml(request.uid)}">Rechazar</button>
    ` : '<span class="muted">Revisada</span>';

    return `
      <tr>
        <td>${escapeHtml(request.email)}</td>
        <td>${escapeHtml(request.displayName)}</td>
        <td><code>${escapeHtml(request.uid)}</code><br><span class="muted">${escapeHtml(formatDate(request.requestedAt))}</span></td>
        <td><span class="pill ${statusClass}">${escapeHtml(request.status)}</span></td>
        <td class="actions">${actions}</td>
      </tr>`;
  }).join("");
}

function renderAppUsers(users) {
  if (!users.length) {
    els.appUsersTableBody.innerHTML = '<tr><td colspan="6" class="muted">Sin usuarios autorizados</td></tr>';
    return;
  }

  els.appUsersTableBody.innerHTML = users.map((user) => {
    const status = user.active ? '<span class="pill on">Activo</span>' : '<span class="pill off">Inactivo</span>';
    const roleActions = user.role === "admin" ?
      `<button class="secondary" type="button" data-app-user-action="role-operator" data-uid="${escapeHtml(user.uid)}">Hacer operador</button>` :
      `<button class="secondary" type="button" data-app-user-action="role-admin" data-uid="${escapeHtml(user.uid)}">Hacer admin</button>`;
    const statusAction = user.active ?
      `<button class="danger" type="button" data-app-user-action="disable" data-uid="${escapeHtml(user.uid)}">Desactivar</button>` :
      `<button class="primary" type="button" data-app-user-action="enable" data-uid="${escapeHtml(user.uid)}">Reactivar</button>`;

    return `
      <tr>
        <td>${escapeHtml(user.email)}</td>
        <td>${escapeHtml(user.displayName)}</td>
        <td><code>${escapeHtml(user.uid)}</code></td>
        <td>${escapeHtml(user.role)}</td>
        <td>${status}</td>
        <td class="actions">${roleActions}${statusAction}</td>
      </tr>`;
  }).join("");
}

async function loadAccessManagement() {
  setStatus(els.accessStatus, "Cargando accesos...");
  const status = els.includeReviewedAccess.checked ? "all" : "pending";
  const [requestsResponse, appUsersResponse] = await Promise.all([
    api(`/access-requests?status=${encodeURIComponent(status)}`),
    api("/app-users")
  ]);
  state.appUsers = appUsersResponse.users || [];
  populateOwnerControls();
  renderAccessRequests(requestsResponse.requests || []);
  renderAppUsers(state.appUsers);
  setStatus(
    els.accessStatus,
    `Solicitudes: ${(requestsResponse.requests || []).length}. Usuarios autorizados: ${(appUsersResponse.users || []).length}.`,
    "ok"
  );
}

async function approveAccessRequest(uid, role) {
  await api(`/access-requests/${encodeURIComponent(uid)}/approve`, {
    method: "POST",
    body: JSON.stringify({ role })
  });
  setStatus(els.accessStatus, `Acceso aprobado como ${role}.`, "ok");
  await loadAccessManagement();
}

async function rejectAccessRequest(uid) {
  if (!window.confirm(`Rechazar solicitud de ${uid}?`)) return;
  await api(`/access-requests/${encodeURIComponent(uid)}/reject`, { method: "POST" });
  setStatus(els.accessStatus, "Solicitud rechazada.", "ok");
  await loadAccessManagement();
}

async function updateAppUserRole(uid, role) {
  await api(`/app-users/${encodeURIComponent(uid)}`, {
    method: "PATCH",
    body: JSON.stringify({ role })
  });
  setStatus(els.accessStatus, `Rol actualizado a ${role}.`, "ok");
  await loadAccessManagement();
}

async function setAppUserActive(uid, active) {
  const action = active ? "enable" : "disable";
  if (!active && !window.confirm(`Desactivar acceso de ${uid}?`)) return;
  await api(`/app-users/${encodeURIComponent(uid)}/${action}`, { method: "POST" });
  setStatus(els.accessStatus, active ? "Usuario reactivado." : "Usuario desactivado.", "ok");
  await loadAccessManagement();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else if (char !== "\r") {
      value += char;
    }
  }

  row.push(value);
  rows.push(row);
  return rows.filter((items) => items.some((item) => String(item).trim() !== ""));
}

function parseCellValue(value, header) {
  const text = String(value == null ? "" : value).trim();
  if (!text) return "";
  const key = String(header || "").trim().toLowerCase();
  if (["active", "activo", "remunerado"].includes(key)) {
    return asBoolean(text, false);
  }
  if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
    try {
      return JSON.parse(text);
    } catch (error) {
      return text;
    }
  }
  return text;
}

function setDotted(target, key, value) {
  const parts = String(key).trim().split(".").filter(Boolean);
  if (!parts.length) return;
  let cursor = target;

  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (!cursor[part] || typeof cursor[part] !== "object" || Array.isArray(cursor[part])) {
      cursor[part] = {};
    }
    cursor = cursor[part];
  }

  cursor[parts[parts.length - 1]] = value;
}

function normalizeHeader(header) {
  const text = String(header || "").trim();
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const aliases = {
    activo: "active",
    apellidos: "apellidos",
    apellido: "apellidos",
    correo: "email",
    documento: "pasaporte",
    etiqueta: "label",
    nombre: "nombres",
    nombres: "nombres",
    pais: "pais",
    telefono: "telefono",
    "telefono alternativo": "telefonoAlternativo",
    telefono_alternativo: "telefonoAlternativo",
    telefonoalternativo: "telefonoAlternativo"
  };
  return aliases[normalized] || text;
}

function usersFromCsv(text) {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  if (rows.length < 2) return [];
  const headers = rows[0].map(normalizeHeader);

  return rows.slice(1).map((row) => {
    const user = {};
    headers.forEach((header, index) => {
      if (!header) return;
      const value = parseCellValue(row[index], header);
      if (value === "") return;
      setDotted(user, header, value);
    });
    user.active = asBoolean(user.active, true);
    user.remunerado = asBoolean(user.remunerado, false);
    return user;
  });
}

function usersFromJson(text) {
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.usuarios)) return parsed.usuarios;
  if (Array.isArray(parsed.users)) return parsed.users;
  if (parsed && typeof parsed === "object" && parsed.id) return [parsed];
  throw new Error("JSON debe ser un arreglo, { usuarios: [...] } o { users: [...] }");
}

function validateImportedUsers(users) {
  const errors = [];
  users.forEach((user, index) => {
    if (!user.id) errors.push(`Fila ${index + 1}: falta id`);
    if (!user.label) errors.push(`Fila ${index + 1}: falta label`);
    if (user.id && !/^[a-zA-Z0-9_-]{2,80}$/.test(String(user.id))) {
      errors.push(`Fila ${index + 1}: id invalido`);
    }
  });
  return errors;
}

function renderImportPreview(users, errors) {
  const rows = users.slice(0, 20).map((user, index) => `
    <tr>
      <td>${index + 1}</td>
      <td><code>${escapeHtml(user.id)}</code></td>
      <td>${escapeHtml(user.label)}</td>
      <td>${escapeHtml([user.nombres, user.apellidos].filter(Boolean).join(" "))}</td>
      <td>${escapeHtml(user.tipo)}</td>
      <td>${user.active === false ? "No" : "Si"}</td>
    </tr>`).join("");

  const errorHtml = errors.length
    ? `<p class="status error">Errores: ${escapeHtml(errors.slice(0, 5).join(" | "))}${errors.length > 5 ? " ..." : ""}</p>`
    : "";

  els.importPreview.innerHTML = `
    ${errorHtml}
    <table>
      <thead><tr><th>#</th><th>ID</th><th>Label</th><th>Nombre</th><th>Tipo</th><th>Activo</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="muted">Sin datos</td></tr>'}</tbody>
    </table>`;
}

async function loadImportFile() {
  const file = els.importFile.files[0];
  if (!file) {
    state.importedUsers = [];
    renderImportPreview([], []);
    setStatus(els.importStatus, "Selecciona un archivo CSV o JSON.");
    return;
  }

  const text = await file.text();
  const isJson = file.name.toLowerCase().endsWith(".json") || file.type.includes("json");
  const users = isJson ? usersFromJson(text) : usersFromCsv(text);
  const errors = validateImportedUsers(users);
  state.importedUsers = users;
  renderImportPreview(users, errors);
  setStatus(els.importStatus, `Archivo cargado: ${users.length} usuario(s).`, errors.length ? "error" : "ok");
}

async function submitImport(dryRun) {
  if (!state.importedUsers.length) {
    await loadImportFile();
  }

  const errors = validateImportedUsers(state.importedUsers);
  if (errors.length) {
    renderImportPreview(state.importedUsers, errors);
    setStatus(els.importStatus, "Corrige los errores antes de importar.", "error");
    return;
  }

  setStatus(els.importStatus, dryRun ? "Validando en servidor..." : "Importando...");
  const response = await api("/lobby-users/import", {
    method: "POST",
    body: JSON.stringify({
      mode: els.importMode.value,
      dryRun,
      ownerUid: isAdminRole() ? els.importOwnerUid.value : "",
      users: state.importedUsers
    })
  });

  const summary = response.summary;
  setStatus(
    els.importStatus,
    `${dryRun ? "Validacion" : "Importacion"}: ${summary.created} crear, ${summary.updated} actualizar, ${summary.skipped} omitidos, ${summary.failed} errores.`,
    summary.failed ? "error" : "ok"
  );

  if (!dryRun) {
    await loadUsers();
  }
}

els.loginButton.addEventListener("click", async () => {
  await signInWithPopup(auth, provider);
});

els.logoutButton.addEventListener("click", async () => {
  await signOut(auth);
});

els.searchButton.addEventListener("click", () => {
  loadUsers().catch((error) => setStatus(els.listStatus, error.message, "error"));
});

els.usersPrevious.addEventListener("click", () => {
  loadUsers("previous").catch((error) => setStatus(els.listStatus, error.message, "error"));
});
els.usersNext.addEventListener("click", () => {
  loadUsers("next").catch((error) => setStatus(els.listStatus, error.message, "error"));
});

els.searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    loadUsers().catch((error) => setStatus(els.listStatus, error.message, "error"));
  }
});

els.ownerFilter.addEventListener("change", () => {
  loadUsers().catch((error) => setStatus(els.listStatus, error.message, "error"));
});

els.newButton.addEventListener("click", () => fillForm(null));
els.resetFormButton.addEventListener("click", () => fillForm(null));

els.tabButtons.forEach((button) => {
  button.addEventListener("click", () => showTab(button.dataset.tabTarget));
});

els.usersTableBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = button.dataset.id;
  if (button.dataset.action === "edit") {
    editUser(id).catch((error) => setStatus(els.formStatus, error.message, "error"));
  } else if (button.dataset.action === "disable") {
    disableUser(id).catch((error) => setStatus(els.listStatus, error.message, "error"));
  }
});

els.userForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const user = userFromForm();
    validateUserForm(user);
    if (state.editingId) {
      await api(`/lobby-users/${encodeURIComponent(state.editingId)}`, {
        method: "PATCH",
        body: JSON.stringify(user)
      });
      setStatus(els.formStatus, "Usuario actualizado.", "ok");
    } else {
      await api("/lobby-users", {
        method: "POST",
        body: JSON.stringify(user)
      });
      setStatus(els.formStatus, "Usuario creado.", "ok");
      fillForm(null);
    }
    await loadUsers();
  } catch (error) {
    setStatus(els.formStatus, error.message, "error");
  }
});

els.importFile.addEventListener("change", () => {
  loadImportFile().catch((error) => setStatus(els.importStatus, error.message, "error"));
});

els.dryRunButton.addEventListener("click", () => {
  submitImport(true).catch((error) => setStatus(els.importStatus, error.message, "error"));
});

els.importButton.addEventListener("click", () => {
  submitImport(false).catch((error) => setStatus(els.importStatus, error.message, "error"));
});

els.refreshAccessButton.addEventListener("click", () => {
  loadAccessManagement()
    .then(loadUsers)
    .catch((error) => setStatus(els.accessStatus, error.message, "error"));
});

els.includeReviewedAccess.addEventListener("change", () => {
  loadAccessManagement().catch((error) => setStatus(els.accessStatus, error.message, "error"));
});

els.accessRequestsTableBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-access-action]");
  if (!button) return;
  const uid = button.dataset.uid;
  const action = button.dataset.accessAction;

  if (action === "approve-operator") {
    approveAccessRequest(uid, "operator").catch((error) => setStatus(els.accessStatus, error.message, "error"));
  } else if (action === "approve-admin") {
    approveAccessRequest(uid, "admin").catch((error) => setStatus(els.accessStatus, error.message, "error"));
  } else if (action === "reject") {
    rejectAccessRequest(uid).catch((error) => setStatus(els.accessStatus, error.message, "error"));
  }
});

els.appUsersTableBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-app-user-action]");
  if (!button) return;
  const uid = button.dataset.uid;
  const action = button.dataset.appUserAction;

  if (action === "role-operator") {
    updateAppUserRole(uid, "operator").catch((error) => setStatus(els.accessStatus, error.message, "error"));
  } else if (action === "role-admin") {
    updateAppUserRole(uid, "admin").catch((error) => setStatus(els.accessStatus, error.message, "error"));
  } else if (action === "disable") {
    setAppUserActive(uid, false).catch((error) => setStatus(els.accessStatus, error.message, "error"));
  } else if (action === "enable") {
    setAppUserActive(uid, true).catch((error) => setStatus(els.accessStatus, error.message, "error"));
  }
});

onAuthStateChanged(auth, async (user) => {
  state.currentUser = user;
  els.loginButton.classList.toggle("hidden", Boolean(user));
  els.logoutButton.classList.toggle("hidden", !user);
  els.adminApp.classList.toggle("hidden", !user);

  if (!user) {
    state.currentRole = null;
    state.appUsers = [];
    els.sessionLabel.textContent = "Sin sesion";
    els.sessionDetail.textContent = "Inicia sesion para continuar.";
    return;
  }

  els.sessionLabel.textContent = user.email || "Usuario autenticado";
  els.sessionDetail.textContent = "Validando permisos...";

  try {
    const me = await api("/me");
    if (!["admin", "operator"].includes(me.user.role)) {
      els.adminApp.classList.add("hidden");
      els.sessionDetail.textContent = `Rol ${me.user.role}. Este portal requiere admin u operator.`;
      return;
    }

    state.currentRole = me.user.role;
    applyRoleUi();
    els.sessionDetail.textContent = me.user.role === "admin" ? "Rol admin confirmado." : "Rol operator confirmado.";

    if (isAdminRole()) {
      await loadAccessManagement();
    }
    fillForm(null);
    await loadUsers();
  } catch (error) {
    els.adminApp.classList.add("hidden");
    els.sessionDetail.textContent = error.message;
  }
});
