"use strict";

const express = require("express");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue, FieldPath } = require("firebase-admin/firestore");
if (!getApps().length) initializeApp();

const db = getFirestore();

const app = express();

const DEFAULT_ALLOWED_ORIGINS = [
  "https://asistente-lobby.web.app",
  "https://asistente-lobby.firebaseapp.com",
  "https://www.leylobby.gob.cl",
  "https://leylobby.gob.cl",
  "http://localhost:5000",
  "http://127.0.0.1:5000"
];

const LOBBY_USER_FIELDS = [
  "id",
  "label",
  "nombres",
  "apellidos",
  "pasaporte",
  "pais",
  "medio",
  "telefono",
  "telefonoAlternativo",
  "email",
  "genero",
  "otroContacto",
  "tipo",
  "remunerado",
  "representado",
  "empleador",
  "cargoInstitucion",
  "ownerUid",
  "ownerEmail",
  "createdByUid",
  "updatedByUid",
  "active"
];
const REPRESENTADO_FIELDS = ["id", "nombre", "nombres", "apellidos", "tipo", "pasaporte", "identificacion", "identificador", "pais", "actividades", "giro", "domicilio", "region", "comuna", "representanteLegal", "naturaleza", "directorio", "active", "ownerUid"];

function sanitizeRepresentado(payload, mode) {
  const source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const data = {};
  for (const field of REPRESENTADO_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(source, field)) continue;
    if (field === "active") data.active = toBoolean(source.active, true);
    else if (typeof source[field] === "string") data[field] = source[field].trim();
    else throw Object.assign(new Error(`Campo invalido: ${field}`), { status: 400 });
  }
  if (mode === "create") {
    data.id = requireSafeId(data.id);
    data.nombre = requireString(data.nombre, "nombre");
    data.tipo = requireString(data.tipo, "tipo");
    data.active = data.active !== false;
    data.createdAt = FieldValue.serverTimestamp();
  }
  if (Object.prototype.hasOwnProperty.call(data, "nombre")) data.nombre = requireString(data.nombre, "nombre");
  if (Object.prototype.hasOwnProperty.call(data, "tipo") && !["persona_natural", "persona_juridica", "otras_entidades"].includes(data.tipo)) {
    throw Object.assign(new Error("Tipo de representado invalido"), { status: 400 });
  }
  data.updatedAt = FieldValue.serverTimestamp();
  return data;
}

function representedSearchText(data) {
  return normalize([data.id, data.nombre, data.nombres, data.apellidos, data.pasaporte, data.identificador].filter(Boolean).join(" "));
}

function getAllowedOrigins() {
  const configured = process.env.ALLOWED_ORIGINS;
  if (!configured) return DEFAULT_ALLOWED_ORIGINS;
  return configured.split(",").map((origin) => origin.trim()).filter(Boolean);
}

function isAllowedExtensionOrigin(origin) {
  return /^chrome-extension:\/\/[a-z]{32}$/.test(origin) ||
    /^moz-extension:\/\/[0-9a-f-]{36}$/.test(origin);
}

function isAllowedOrigin(origin) {
  return getAllowedOrigins().includes(origin) || isAllowedExtensionOrigin(origin);
}

function applyCors(req, res, next) {
  const origin = req.get("origin");
  const allowed = origin ? isAllowedOrigin(origin) : true;

  if (origin && allowed) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }

  res.set("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization,Content-Type");
  res.set("Access-Control-Max-Age", "3600");

  if (req.method === "OPTIONS") {
    res.status(origin && !allowed ? 403 : 204).send("");
    return;
  }

  if (origin && !allowed) {
    res.status(403).json({ ok: false, error: "Origen no autorizado" });
    return;
  }

  next();
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function normalize(value) {
  return String(value == null ? "" : value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function requireString(value, fieldName) {
  const text = String(value == null ? "" : value).trim();
  if (!text) {
    const error = new Error(`Campo requerido: ${fieldName}`);
    error.status = 400;
    throw error;
  }
  return text;
}

function requireSafeId(value) {
  const id = requireString(value, "id");
  if (!/^[a-zA-Z0-9_-]{2,80}$/.test(id)) {
    const error = new Error("El id solo puede contener letras, numeros, guion y guion bajo");
    error.status = 400;
    throw error;
  }
  return id;
}

function requireSafeUid(value) {
  const uid = requireString(value, "uid");
  if (!/^[a-zA-Z0-9_-]{2,128}$/.test(uid)) {
    const error = new Error("UID invalido");
    error.status = 400;
    throw error;
  }
  return uid;
}

function normalizeRole(value, fallback) {
  const role = String(value || fallback || "operator").trim().toLowerCase();
  if (!["admin", "operator", "disabled"].includes(role)) {
    const error = new Error("Rol invalido. Usa admin, operator o disabled");
    error.status = 400;
    throw error;
  }
  return role;
}

function toBoolean(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value == null || value === "") return fallback;
  const text = String(value).trim().toLowerCase();
  if (["true", "1", "si", "sí", "yes", "y"].includes(text)) return true;
  if (["false", "0", "no", "n"].includes(text)) return false;
  return fallback;
}

function publicLobbyUserSummary(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    label: data.label || data.id || doc.id,
    tipo: data.tipo || null,
    ownerUid: data.ownerUid || null,
    ownerEmail: data.ownerEmail || null,
    active: data.active !== false
  };
}

function adminLobbyUserSummary(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    label: data.label || data.id || doc.id,
    nombres: data.nombres || "",
    apellidos: data.apellidos || "",
    pasaporte: data.pasaporte || "",
    email: data.email || "",
    tipo: data.tipo || "",
    ownerUid: data.ownerUid || "",
    ownerEmail: data.ownerEmail || "",
    active: data.active !== false
  };
}

function fullLobbyUser(doc) {
  const data = doc.data();
  const user = {};
  for (const field of LOBBY_USER_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      user[field] = data[field];
    }
  }
  user.id = doc.id;
  return user;
}

function searchableValue(value) {
  if (Array.isArray(value)) {
    return value.join(" ");
  }
  if (value && typeof value === "object") {
    return Object.values(value).map(searchableValue).join(" ");
  }
  return value;
}

function buildSearchText(data) {
  return normalize([
    data.id,
    data.label,
    data.nombres,
    data.apellidos,
    data.pasaporte,
    data.email,
    data.tipo,
    data.ownerEmail,
    searchableValue(data.searchTerms),
    searchableValue(data.searchterms)
  ].filter(Boolean).join(" "));
}

function getSearchText(data) {
  return normalize(data.searchText || buildSearchText(data));
}

function sanitizeLobbyUserPayload(payload, mode) {
  const source = payload && typeof payload === "object" ? payload : {};
  const data = {};

  for (const field of LOBBY_USER_FIELDS) {
    if (!["ownerEmail", "createdByUid", "updatedByUid"].includes(field) &&
        Object.prototype.hasOwnProperty.call(source, field)) {
      data[field] = source[field];
    }
  }

  if (mode === "create") {
    data.id = requireSafeId(data.id);
    data.label = requireString(data.label, "label");
    data.active = toBoolean(data.active, true);
    data.createdAt = FieldValue.serverTimestamp();
  }

  if (Object.prototype.hasOwnProperty.call(data, "id")) {
    data.id = requireSafeId(data.id);
  }

  if (Object.prototype.hasOwnProperty.call(data, "label")) {
    data.label = requireString(data.label, "label");
  }

  if (Object.prototype.hasOwnProperty.call(data, "active")) {
    data.active = toBoolean(data.active, true);
  }

  if (Object.prototype.hasOwnProperty.call(data, "remunerado")) {
    data.remunerado = toBoolean(data.remunerado, false);
  }

  data.updatedAt = FieldValue.serverTimestamp();

  return data;
}

function isAdmin(req) {
  return req.auth && req.auth.role === "admin";
}

async function getOwnerMetadata(uid) {
  const ownerUid = requireSafeUid(uid);
  const ownerDoc = await db.collection("appUsers").doc(ownerUid).get();

  if (!ownerDoc.exists || ownerDoc.data().active !== true || ownerDoc.data().role === "disabled") {
    const error = new Error("El usuario dueño no existe o no esta activo");
    error.status = 400;
    throw error;
  }

  const owner = ownerDoc.data();
  return {
    ownerUid,
    ownerEmail: owner.email || ""
  };
}

async function applyLobbyUserOwnership(req, data, mode) {
  if (!isAdmin(req)) {
    data.ownerUid = req.auth.uid;
    data.ownerEmail = req.auth.email || "";
  } else if (mode === "create" || Object.prototype.hasOwnProperty.call(data, "ownerUid")) {
    const owner = await getOwnerMetadata(data.ownerUid);
    data.ownerUid = owner.ownerUid;
    data.ownerEmail = owner.ownerEmail;
  }

  if (mode === "create") {
    data.createdByUid = req.auth.uid;
  }
  data.updatedByUid = req.auth.uid;
  return data;
}

function canAccessLobbyUser(req, data) {
  return isAdmin(req) || data.ownerUid === req.auth.uid;
}

function applyLobbyUsersScope(req, query) {
  if (isAdmin(req)) return query;
  return query.where("ownerUid", "==", req.auth.uid);
}

async function findLobbyUsersPage(query, search, limit, cursor, summarize) {
  const users = [];
  let after = cursor;
  let nextCursor = null;
  // ponytail: substring search scans batches in Firestore; use a search index if the collection grows large.
  while (true) {
    let page = query.orderBy(FieldPath.documentId()).limit(200);
    if (after) page = page.startAfter(after);
    const snapshot = await page.get();
    for (const doc of snapshot.docs) {
      if (search && !getSearchText(doc.data()).includes(search)) continue;
      if (users.length === limit) return { users, nextCursor };
      users.push(summarize(doc));
      nextCursor = doc.id;
    }
    if (snapshot.size < 200) return { users, nextCursor: null };
    after = snapshot.docs[snapshot.size - 1].id;
  }
}

async function writeAudit(req, action, details) {
  const auth = req.auth || {};
  const body = {
    uid: auth.uid || null,
    email: auth.email || null,
    action,
    recordId: details && details.recordId ? details.recordId : null,
    success: Boolean(details && details.success),
    error: details && details.error ? String(details.error) : null,
    createdAt: FieldValue.serverTimestamp()
  };

  try {
    await db.collection("auditLogs").add(body);
  } catch (error) {
    console.error("audit log failed", error);
  }
}

async function getDecodedToken(req) {
  const header = req.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    const error = new Error("Token requerido");
    error.status = 401;
    throw error;
  }

  return getAuth().verifyIdToken(match[1]);
}

async function verifyFirebaseAuth(req, res, next) {
  try {
    const decoded = await getDecodedToken(req);
    req.auth = {
      uid: decoded.uid,
      email: decoded.email || null,
      displayName: decoded.name || null,
      decoded
    };
    next();
  } catch (error) {
    console.error("auth failed", error);
    res.status(error.status || 401).json({ ok: false, error: error.status ? error.message : "Token invalido" });
  }
}

async function authenticate(req, res, next) {
  try {
    const decoded = await getDecodedToken(req);
    req.auth = {
      uid: decoded.uid,
      email: decoded.email || null,
      displayName: decoded.name || null,
      decoded
    };

    const appUserDoc = await db.collection("appUsers").doc(req.auth.uid).get();

    if (!appUserDoc.exists) {
      await writeAudit(req, "auth", { success: false, error: "Usuario no autorizado" });
      res.status(403).json({ ok: false, error: "Usuario no autorizado" });
      return;
    }

    const appUser = appUserDoc.data();
    if (appUser.active !== true || appUser.role === "disabled") {
      req.auth = { uid: req.auth.uid, email: decoded.email || appUser.email || null };
      await writeAudit(req, "auth", { success: false, error: "Usuario desactivado" });
      res.status(403).json({ ok: false, error: "Usuario desactivado" });
      return;
    }

    req.auth = {
      uid: req.auth.uid,
      email: decoded.email || appUser.email || null,
      role: appUser.role || "operator",
      appUser
    };

    next();
  } catch (error) {
    console.error("auth failed", error);
    res.status(error.status || 401).json({ ok: false, error: error.status ? error.message : "Token invalido" });
  }
}

function requireRole(roles) {
  return asyncHandler(async (req, res, next) => {
    if (!roles.includes(req.auth.role)) {
      await writeAudit(req, "forbidden", { success: false, error: `Rol insuficiente: ${req.auth.role}` });
      res.status(403).json({ ok: false, error: "Permisos insuficientes" });
      return;
    }

    next();
  });
}

app.use(applyCors);
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "lobby-firebase-api" });
});

app.post("/api/access-requests", asyncHandler(verifyFirebaseAuth), asyncHandler(async (req, res) => {
  const uid = requireSafeUid(req.auth.uid);
  const appUserDoc = await db.collection("appUsers").doc(uid).get();

  if (appUserDoc.exists && appUserDoc.data().active === true && appUserDoc.data().role !== "disabled") {
    await writeAudit(req, "requestAccess", { recordId: uid, success: true });
    res.json({ ok: true, alreadyAuthorized: true, status: "active" });
    return;
  }

  const ref = db.collection("accessRequests").doc(uid);
  const existing = await ref.get();
  const base = {
    uid,
    email: req.auth.email || null,
    displayName: req.auth.displayName || null,
    status: "pending",
    decision: null,
    reviewedAt: null,
    reviewedBy: null,
    updatedAt: FieldValue.serverTimestamp()
  };

  if (!existing.exists) {
    base.requestedAt = FieldValue.serverTimestamp();
  }

  await ref.set(base, { merge: true });
  await writeAudit(req, "requestAccess", { recordId: uid, success: true });
  res.status(existing.exists ? 200 : 201).json({ ok: true, status: "pending" });
}));

app.use("/api", asyncHandler(authenticate));

app.get("/api/me", (req, res) => {
  res.json({
    ok: true,
    user: {
      uid: req.auth.uid,
      email: req.auth.email,
      role: req.auth.role
    }
  });
});

app.get("/api/access-requests", requireRole(["admin"]), asyncHandler(async (req, res) => {
  const status = String(req.query.status || "pending").trim().toLowerCase();
  const includeAll = status === "all";
  let query = db.collection("accessRequests").limit(500);

  if (!includeAll) {
    query = query.where("status", "==", status);
  }

  const snapshot = await query.get();
  const requests = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    requests.push({
      uid: doc.id,
      email: data.email || "",
      displayName: data.displayName || "",
      status: data.status || "pending",
      decision: data.decision || null,
      requestedAt: data.requestedAt && data.requestedAt.toMillis ? data.requestedAt.toMillis() : null,
      reviewedAt: data.reviewedAt && data.reviewedAt.toMillis ? data.reviewedAt.toMillis() : null,
      reviewedBy: data.reviewedBy || null
    });
  });

  requests.sort((a, b) => (b.requestedAt || 0) - (a.requestedAt || 0));
  await writeAudit(req, "listAccessRequests", { success: true });
  res.json({ ok: true, requests });
}));

app.post("/api/access-requests/:uid/approve", requireRole(["admin"]), asyncHandler(async (req, res) => {
  const uid = requireSafeUid(req.params.uid);
  const role = normalizeRole(req.body && req.body.role, "operator");
  if (role === "disabled") {
    res.status(400).json({ ok: false, error: "No puedes aprobar con rol disabled" });
    return;
  }

  const requestRef = db.collection("accessRequests").doc(uid);
  const requestDoc = await requestRef.get();
  let authUser = null;
  try {
    authUser = await getAuth().getUser(uid);
  } catch (error) {
    authUser = null;
  }

  const requestData = requestDoc.exists ? requestDoc.data() : {};
  const appUserRef = db.collection("appUsers").doc(uid);
  const appUserDoc = await appUserRef.get();
  const appUser = {
    uid,
    email: (authUser && authUser.email) || requestData.email || "",
    displayName: (authUser && authUser.displayName) || requestData.displayName || "",
    role,
    active: true,
    status: "active",
    approvedAt: FieldValue.serverTimestamp(),
    approvedBy: req.auth.uid,
    updatedAt: FieldValue.serverTimestamp()
  };

  if (!appUserDoc.exists) {
    appUser.createdAt = FieldValue.serverTimestamp();
  }

  await appUserRef.set(appUser, { merge: true });
  await requestRef.set({
    uid,
    email: appUser.email,
    displayName: appUser.displayName,
    status: "approved",
    decision: "approved",
    reviewedAt: FieldValue.serverTimestamp(),
    reviewedBy: req.auth.uid,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  await writeAudit(req, "approveAccessRequest", { recordId: uid, success: true });
  res.json({ ok: true, uid, role });
}));

app.post("/api/access-requests/:uid/reject", requireRole(["admin"]), asyncHandler(async (req, res) => {
  const uid = requireSafeUid(req.params.uid);
  await db.collection("accessRequests").doc(uid).set({
    status: "rejected",
    decision: "rejected",
    reviewedAt: FieldValue.serverTimestamp(),
    reviewedBy: req.auth.uid,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  await writeAudit(req, "rejectAccessRequest", { recordId: uid, success: true });
  res.json({ ok: true, uid });
}));

app.get("/api/app-users", requireRole(["admin"]), asyncHandler(async (req, res) => {
  const snapshot = await db.collection("appUsers").limit(500).get();
  const users = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    users.push({
      uid: doc.id,
      email: data.email || "",
      displayName: data.displayName || "",
      role: data.role || "operator",
      active: data.active === true,
      status: data.status || (data.active === true ? "active" : "disabled")
    });
  });

  users.sort((a, b) => String(a.email || a.uid).localeCompare(String(b.email || b.uid), "es"));
  await writeAudit(req, "listAppUsers", { success: true });
  res.json({ ok: true, users });
}));

app.post("/api/app-users", requireRole(["admin"]), asyncHandler(async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const uid = requireSafeUid(body.uid);
  const role = normalizeRole(body.role, "operator");
  const active = role !== "disabled" && toBoolean(body.active, true) === true;
  const data = {
    uid,
    email: String(body.email || "").trim(),
    displayName: String(body.displayName || "").trim(),
    role,
    active,
    status: active ? "active" : "disabled",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  };

  await db.collection("appUsers").doc(uid).set(data, { merge: false });
  await writeAudit(req, "createAppUser", { recordId: uid, success: true });
  res.status(201).json({ ok: true, uid });
}));

app.patch("/api/app-users/:uid", requireRole(["admin"]), asyncHandler(async (req, res) => {
  const uid = requireSafeUid(req.params.uid);
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const data = { updatedAt: FieldValue.serverTimestamp() };

  if (Object.prototype.hasOwnProperty.call(body, "email")) data.email = String(body.email || "").trim();
  if (Object.prototype.hasOwnProperty.call(body, "displayName")) data.displayName = String(body.displayName || "").trim();
  if (Object.prototype.hasOwnProperty.call(body, "role")) data.role = normalizeRole(body.role, "operator");
  if (Object.prototype.hasOwnProperty.call(body, "active")) data.active = toBoolean(body.active, true);

  if (data.role === "disabled") data.active = false;
  if (Object.prototype.hasOwnProperty.call(data, "active")) data.status = data.active ? "active" : "disabled";

  await db.collection("appUsers").doc(uid).set(data, { merge: true });
  await writeAudit(req, "updateAppUser", { recordId: uid, success: true });
  res.json({ ok: true, uid });
}));

app.post("/api/app-users/:uid/disable", requireRole(["admin"]), asyncHandler(async (req, res) => {
  const uid = requireSafeUid(req.params.uid);
  await db.collection("appUsers").doc(uid).set({
    active: false,
    status: "disabled",
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  await writeAudit(req, "disableAppUser", { recordId: uid, success: true });
  res.json({ ok: true, uid });
}));

app.post("/api/app-users/:uid/enable", requireRole(["admin"]), asyncHandler(async (req, res) => {
  const uid = requireSafeUid(req.params.uid);
  await db.collection("appUsers").doc(uid).set({
    active: true,
    status: "active",
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  await writeAudit(req, "enableAppUser", { recordId: uid, success: true });
  res.json({ ok: true, uid });
}));

app.get("/api/representados", requireRole(["admin", "operator"]), asyncHandler(async (req, res) => {
  const cursor = req.query.cursor ? requireSafeId(req.query.cursor) : null;
  const requestedLimit = Number(req.query.limit);
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 200) : 25;
  let query = applyLobbyUsersScope(req, db.collection("representados"));
  if (req.query.includeInactive !== "true") query = query.where("active", "==", true);
  if (isAdmin(req) && req.query.ownerUid) query = query.where("ownerUid", "==", requireSafeUid(req.query.ownerUid));
  const page = await findLobbyUsersPage(query, normalize(req.query.q || ""), limit, cursor, (doc) => Object.assign({}, doc.data(), { id: doc.id }));
  await writeAudit(req, "listRepresentados", { success: true });
  res.json({ ok: true, representados: page.users, nextCursor: page.nextCursor });
}));

app.get("/api/representados/migracion", requireRole(["admin"]), asyncHandler(async (req, res) => {
  const groups = new Map();
  const unresolved = [];
  let complete = true;
  async function scan(collection, visit) {
    let cursor = null, count = 0;
    do {
      const page = await findLobbyUsersPage(db.collection(collection), "", 500, cursor, (doc) => ({ id: doc.id, data: doc.data() }));
      page.users.forEach(visit);
      count += page.users.length;
      cursor = page.nextCursor;
      if (count >= 5000 && cursor) { complete = false; break; }
    } while (cursor);
  }
  function add(data, source, id) {
    if (!data || typeof data !== "object" || Array.isArray(data) || !Object.keys(data).length) return;
    const name = String(data.nombre || [data.nombres, data.apellidos].filter(Boolean).join(" ") || "").trim();
    const ownerUid = String(data.ownerUid || "").trim();
    if (!name || !ownerUid || !["persona_natural", "persona_juridica", "otras_entidades"].includes(data.tipo)) {
      unresolved.push({ source, id, reason: "Falta nombre, dueño o tipo valido" }); return;
    }
    const document = String(data.pasaporte || data.identificador || "").trim();
    const identity = document && /^[0-9.\s-]+[0-9kK]$/.test(document) ? document.replace(/[.\s-]/g, "").toLowerCase() : normalize(document || name);
    const key = JSON.stringify([ownerUid, identity]);
    if (!groups.has(key)) groups.set(key, { ownerUid, nombre: name, documento: data.pasaporte || data.identificador || "", entries: [] });
    groups.get(key).entries.push({ source, id, nombre: name, tipo: data.tipo });
  }
  await scan("lobbyUsers", (doc) => {
    const value = doc.data.representado;
    if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length) {
      add(Object.assign({}, value, { ownerUid: doc.data.ownerUid }), "solicitante", doc.id);
    } else if (value && (typeof value !== "object" || Array.isArray(value))) unresolved.push({ source: "solicitante", id: doc.id, reason: "Representado antiguo tiene formato invalido" });
  });
  await scan("representados", (doc) => add(doc.data, "catalogo", doc.id));
  const candidates = [...groups.values()].filter((group) => group.entries.some((entry) => entry.source === "solicitante"));
  await writeAudit(req, "previewRepresentadosMigration", { success: true });
  res.json({ ok: true, complete, candidates, unresolved, note: "Coincidencias por dueño y documento o nombre; revisar manualmente, no se ha escrito ningun dato." });
}));

app.post("/api/representados/import", requireRole(["admin", "operator"]), asyncHandler(async (req, res) => {
  const body = req.body || {};
  const items = Array.isArray(body.representados) ? body.representados : [];
  const mode = body.mode || "create";
  const dryRun = body.dryRun !== false;
  if (!items.length || items.length > 500 || !["create", "update", "upsert"].includes(mode)) {
    return res.status(400).json({ ok: false, error: "Importacion invalida: usa entre 1 y 500 representados y un modo valido" });
  }
  const results = [];
  for (const [index, item] of items.entries()) {
    try {
      const source = Object.assign({}, item);
      if (!source.ownerUid && body.ownerUid) source.ownerUid = body.ownerUid;
      const data = await applyLobbyUserOwnership(req, sanitizeRepresentado(source, "create"), "create");
      const action = await db.runTransaction(async (transaction) => {
        const ref = db.collection("representados").doc(data.id);
        const existing = await transaction.get(ref);
        if (existing.exists && !canAccessLobbyUser(req, existing.data())) throw new Error("Representado no disponible");
        if ((existing.exists && mode === "create") || (!existing.exists && mode === "update")) return "skip";
        if (existing.exists) {
          delete data.createdAt;
          delete data.createdByUid;
          if (isAdmin(req) && !Object.prototype.hasOwnProperty.call(item, "ownerUid")) { delete data.ownerUid; delete data.ownerEmail; }
          if (!Object.prototype.hasOwnProperty.call(source, "active")) delete data.active;
        }
        data.searchText = representedSearchText(Object.assign({}, existing.exists ? existing.data() : {}, data));
        if (!dryRun) transaction.set(ref, data, { merge: existing.exists });
        return existing.exists ? "update" : "create";
      });
      results.push({ index, id: data.id, ok: action !== "skip", action });
    } catch (error) { results.push({ index, id: item && item.id || null, ok: false, action: "error", error: error.message }); }
  }
  await writeAudit(req, "importRepresentados", { success: results.every((item) => item.action !== "error") });
  res.json({ ok: true, dryRun, results });
}));

app.get("/api/representados/:id", requireRole(["admin", "operator"]), asyncHandler(async (req, res) => {
  const id = requireSafeId(req.params.id);
  const doc = await db.collection("representados").doc(id).get();
  if (!doc.exists || (req.query.activeOnly === "true" && doc.data().active === false) || !canAccessLobbyUser(req, doc.data())) {
    await writeAudit(req, "getRepresentado", { recordId: id, success: false, error: "No encontrado" });
    return res.status(404).json({ ok: false, error: "Representado no encontrado" });
  }
  await writeAudit(req, "getRepresentado", { recordId: id, success: true });
  res.json({ ok: true, representado: Object.assign({}, doc.data(), { id }) });
}));

app.post("/api/representados", requireRole(["admin", "operator"]), asyncHandler(async (req, res) => {
  const data = await applyLobbyUserOwnership(req, sanitizeRepresentado(req.body, "create"), "create");
  data.searchText = representedSearchText(data);
  try { await db.collection("representados").doc(data.id).create(data); }
  catch (error) {
    if (error.code !== 6 && error.code !== "already-exists") throw error;
    return res.status(409).json({ ok: false, error: "Ya existe un representado con ese id" });
  }
  await writeAudit(req, "createRepresentado", { recordId: data.id, success: true });
  res.status(201).json({ ok: true, id: data.id });
}));

app.patch("/api/representados/:id", requireRole(["admin", "operator"]), asyncHandler(async (req, res) => {
  const id = requireSafeId(req.params.id);
  const data = await applyLobbyUserOwnership(req, sanitizeRepresentado(req.body, "update"), "update");
  delete data.id;
  const updated = await db.runTransaction(async (transaction) => {
    const ref = db.collection("representados").doc(id);
    const existing = await transaction.get(ref);
    if (!existing.exists || !canAccessLobbyUser(req, existing.data())) return false;
    data.searchText = representedSearchText(Object.assign({}, existing.data(), data, { id }));
    transaction.set(ref, data, { merge: true });
    return true;
  });
  if (!updated) return res.status(404).json({ ok: false, error: "Representado no encontrado" });
  await writeAudit(req, "updateRepresentado", { recordId: id, success: true });
  res.json({ ok: true, id });
}));

app.post("/api/representados/:id/disable", requireRole(["admin", "operator"]), asyncHandler(async (req, res) => {
  const id = requireSafeId(req.params.id);
  const updated = await db.runTransaction(async (transaction) => {
    const ref = db.collection("representados").doc(id);
    const existing = await transaction.get(ref);
    if (!existing.exists || !canAccessLobbyUser(req, existing.data())) return false;
    transaction.update(ref, { active: false, updatedByUid: req.auth.uid, updatedAt: FieldValue.serverTimestamp() });
    return true;
  });
  if (!updated) return res.status(404).json({ ok: false, error: "Representado no encontrado" });
  await writeAudit(req, "disableRepresentado", { recordId: id, success: true });
  res.json({ ok: true, id });
}));

app.get("/api/search-lobby-users", requireRole(["admin", "operator"]), asyncHandler(async (req, res) => {
  const q = normalize(req.query.q || "");
  const cursor = req.query.cursor ? requireSafeId(req.query.cursor) : null;
  const query = applyLobbyUsersScope(
    req,
    db.collection("lobbyUsers").where("active", "==", true)
  );
  const { users, nextCursor } = await findLobbyUsersPage(query, q, 25, cursor, publicLobbyUserSummary);
  await writeAudit(req, "searchLobbyUsers", { success: true });
  res.json({ ok: true, users, nextCursor, scanTruncated: false, resultsTruncated: Boolean(nextCursor) });
}));

app.get("/api/lobby-users", requireRole(["admin", "operator"]), asyncHandler(async (req, res) => {
  const q = normalize(req.query.q || "");
  const includeInactive = req.query.includeInactive === "true" || req.query.includeInactive === "1";
  const ownerUid = String(req.query.ownerUid || "").trim();
  const requestedLimit = Number(req.query.limit);
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 500) : 200;
  const cursor = req.query.cursor ? requireSafeId(req.query.cursor) : null;
  let query = applyLobbyUsersScope(req, db.collection("lobbyUsers"));

  if (!includeInactive) {
    query = query.where("active", "==", true);
  }

  if (ownerUid && isAdmin(req)) {
    query = query.where("ownerUid", "==", requireSafeUid(ownerUid));
  }

  const { users, nextCursor } = await findLobbyUsersPage(query, q, limit, cursor, adminLobbyUserSummary);
  await writeAudit(req, "listLobbyUsers", { success: true });
  res.json({ ok: true, users, nextCursor, scanTruncated: false });
}));

app.get("/api/lobby-users/:id", requireRole(["admin", "operator"]), asyncHandler(async (req, res) => {
  const id = requireSafeId(req.params.id);
  const doc = await db.collection("lobbyUsers").doc(id).get();

  if (!doc.exists || doc.data().active === false || !canAccessLobbyUser(req, doc.data())) {
    await writeAudit(req, "getLobbyUser", { recordId: id, success: false, error: "No encontrado" });
    res.status(404).json({ ok: false, error: "Usuario no encontrado" });
    return;
  }

  await writeAudit(req, "getLobbyUser", { recordId: id, success: true });
  res.json({ ok: true, user: fullLobbyUser(doc) });
}));

app.post("/api/lobby-users", requireRole(["admin", "operator"]), asyncHandler(async (req, res) => {
  const data = await applyLobbyUserOwnership(req, sanitizeLobbyUserPayload(req.body, "create"), "create");
  const id = data.id;
  data.searchText = buildSearchText(data);
  const ref = db.collection("lobbyUsers").doc(id);
  try {
    await ref.create(data);
  } catch (error) {
    if (error.code !== 6 && error.code !== "already-exists") throw error;
    await writeAudit(req, "createLobbyUser", { recordId: id, success: false, error: "Ya existe" });
    res.status(409).json({ ok: false, error: "Ya existe un usuario con ese id" });
    return;
  }
  await writeAudit(req, "createLobbyUser", { recordId: id, success: true });
  res.status(201).json({ ok: true, id });
}));

app.post("/api/lobby-users/import", requireRole(["admin", "operator"]), asyncHandler(async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const users = Array.isArray(body.users) ? body.users : [];
  const mode = body.mode || "upsert";
  const dryRun = body.dryRun !== false;
  const allowedModes = ["create", "update", "upsert"];

  if (!allowedModes.includes(mode)) {
    res.status(400).json({ ok: false, error: "Modo invalido. Usa create, update o upsert" });
    return;
  }

  if (!users.length) {
    res.status(400).json({ ok: false, error: "No hay usuarios para importar" });
    return;
  }

  if (users.length > 500) {
    res.status(400).json({ ok: false, error: "Maximo 500 usuarios por importacion" });
    return;
  }

  const results = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (let index = 0; index < users.length; index += 1) {
    const raw = users[index];

    try {
      const source = Object.assign({}, raw);
      if (body.ownerUid && !source.ownerUid) {
        source.ownerUid = body.ownerUid;
      }
      const data = await applyLobbyUserOwnership(req, sanitizeLobbyUserPayload(source, "create"), "create");
      const id = data.id;
      const ref = db.collection("lobbyUsers").doc(id);
      const outcome = await db.runTransaction(async (transaction) => {
        const existing = await transaction.get(ref);
        if (mode === "create" && existing.exists) return { error: "Ya existe" };
        if (mode === "update" && !existing.exists) return { error: "No existe" };
        const next = Object.assign({}, data);
        if (existing.exists) {
          if (!canAccessLobbyUser(req, existing.data())) {
            throw new Error("No puedes importar sobre un usuario de otro dueño");
          }
          delete next.createdAt;
          delete next.createdByUid;
          if (!Object.prototype.hasOwnProperty.call(source, "active")) delete next.active;
        }
        next.searchText = buildSearchText(Object.assign({}, existing.exists ? existing.data() : {}, next));
        if (!dryRun) transaction.set(ref, next, { merge: existing.exists });
        return { action: existing.exists ? "update" : "create" };
      });
      if (outcome.error) {
        skipped += 1;
        results.push({ index, id, ok: false, action: "skip", error: outcome.error });
        continue;
      }
      const action = outcome.action;

      if (action === "create") {
        created += 1;
      } else {
        updated += 1;
      }

      results.push({ index, id, ok: true, action });
    } catch (error) {
      failed += 1;
      results.push({
        index,
        id: raw && raw.id ? String(raw.id) : null,
        ok: false,
        action: "error",
        error: error && error.message ? error.message : String(error)
      });
    }
  }

  await writeAudit(req, "importLobbyUsers", {
    success: failed === 0,
    error: failed ? `Errores: ${failed}` : null
  });

  res.json({
    ok: true,
    dryRun,
    mode,
    summary: {
      total: users.length,
      created,
      updated,
      skipped,
      failed
    },
    results
  });
}));

app.patch("/api/lobby-users/:id", requireRole(["admin", "operator"]), asyncHandler(async (req, res) => {
  const id = requireSafeId(req.params.id);
  const data = await applyLobbyUserOwnership(req, sanitizeLobbyUserPayload(req.body, "update"), "update");
  delete data.id;

  if (Object.keys(data).length <= 1) {
    res.status(400).json({ ok: false, error: "No hay campos para actualizar" });
    return;
  }

  const ref = db.collection("lobbyUsers").doc(id);
  const updated = await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (!existing.exists || !canAccessLobbyUser(req, existing.data())) return false;
    const next = Object.assign({}, data);
    next.searchText = buildSearchText(Object.assign({}, existing.data(), next, { id }));
    transaction.set(ref, next, { merge: true });
    return true;
  });
  if (!updated) {
    await writeAudit(req, "updateLobbyUser", { recordId: id, success: false, error: "No encontrado" });
    res.status(404).json({ ok: false, error: "Usuario no encontrado" });
    return;
  }

  await writeAudit(req, "updateLobbyUser", { recordId: id, success: true });
  res.json({ ok: true, id });
}));

app.post("/api/lobby-users/:id/disable", requireRole(["admin", "operator"]), asyncHandler(async (req, res) => {
  const id = requireSafeId(req.params.id);
  const ref = db.collection("lobbyUsers").doc(id);
  const disabled = await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (!existing.exists || !canAccessLobbyUser(req, existing.data())) return false;
    transaction.update(ref, {
      active: false,
      updatedByUid: req.auth.uid,
      updatedAt: FieldValue.serverTimestamp()
    });
    return true;
  });
  if (!disabled) {
    await writeAudit(req, "disableLobbyUser", { recordId: id, success: false, error: "No encontrado" });
    res.status(404).json({ ok: false, error: "Usuario no encontrado" });
    return;
  }
  await writeAudit(req, "disableLobbyUser", { recordId: id, success: true });
  res.json({ ok: true, id });
}));

app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Ruta no encontrada" });
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  console.error(error);
  res.status(error.status || 500).json({
    ok: false,
    error: error.status ? error.message : "Error interno"
  });
});

module.exports = app;
