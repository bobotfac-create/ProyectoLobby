"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const records = new Map();
const routes = {};
const app = { use() {}, get: route("GET"), post: route("POST"), patch: route("PATCH") };
function route(method) {
  return (path, ...handlers) => { routes[`${method} ${path}`] = handlers.at(-1); };
}
function ref(collection, id) {
  const key = `${collection}/${id}`;
  return {
    key,
    async create(data) {
      if (records.has(key)) throw Object.assign(new Error("exists"), { code: 6 });
      records.set(key, data);
    }
  };
}
function snapshot(reference) {
  return { exists: records.has(reference.key), data: () => records.get(reference.key) };
}
const db = {
  collection(name) {
    const filters = [];
    let limit = Infinity;
    let after = null;
    const query = {
      doc: (id) => ref(name, id), add: async () => {},
      where(field, operator, value) { filters.push([field, value]); return this; },
      orderBy() { return this; },
      startAfter(value) { after = value; return this; },
      limit(value) { limit = value; return this; },
      async get() {
        const docs = [...records.entries()].filter(([key, data]) => key.startsWith(`${name}/`) && (!after || key.slice(name.length + 1) > after) && filters.every(([field, value]) => data[field] === value))
          .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
          .slice(0, limit).map(([key, data]) => ({ id: key.slice(name.length + 1), data: () => data }));
        return { docs, size: docs.length, forEach: (fn) => docs.forEach(fn) };
      }
    };
    return query;
  },
  async runTransaction(callback) {
    return callback({
      get: async (reference) => snapshot(reference),
      set: (reference, data, options) => records.set(reference.key, options.merge ? { ...records.get(reference.key), ...data } : data),
      update: (reference, data) => records.set(reference.key, { ...records.get(reference.key), ...data })
    });
  }
};
const express = () => app;
express.json = () => () => {};
const modules = {
  express,
  "firebase-admin/app": { initializeApp() {}, getApps: () => [] },
  "firebase-admin/auth": { getAuth() {} },
  "firebase-admin/firestore": { getFirestore: () => db, FieldValue: { serverTimestamp: () => "timestamp" }, FieldPath: { documentId: () => "__name__" } },
  "firebase-functions/v2": { setGlobalOptions() {} },
  "firebase-functions/v2/https": { onRequest: (handler) => handler }
};
let source = fs.readFileSync(`${__dirname}/app.js`, "utf8");
// Invoke the actual route handlers directly, without Express's next() adapter.
source = source.replace(/function asyncHandler\(handler\) \{[\s\S]*?\n\}/, "function asyncHandler(handler) { return handler; }");
vm.runInNewContext(source, { require: (name) => modules[name], module: { exports: {} }, process, console });

async function request(routeName, body, id, query = {}) {
  const req = { body, query, params: { id }, auth: { uid: "operator1", email: "owner@example.com", role: "operator" } };
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
  await routes[routeName](req, res);
  return res;
}

async function main() {
  records.set("lobbyUsers/user1", { id: "user1", label: "Anterior", nombres: "Camila", active: false, ownerUid: "operator1", createdByUid: "original" });
  const imported = await request("POST /api/lobby-users/import", { users: [{ id: "user1", label: "Actual", createdByUid: "falso" }], dryRun: false });
  assert.equal(imported.body.summary.updated, 1);
  const updated = records.get("lobbyUsers/user1");
  assert.equal(updated.active, false);
  assert.equal(updated.createdByUid, "original");
  assert.match(updated.searchText, /camila/);
  assert.match(updated.searchText, /actual/);

  await request("PATCH /api/lobby-users/:id", { createdByUid: "falso", ownerEmail: "falso", label: "Editado" }, "user1");
  assert.equal(records.get("lobbyUsers/user1").createdByUid, "original");
  assert.equal(records.get("lobbyUsers/user1").ownerEmail, "owner@example.com");
  const duplicate = await request("POST /api/lobby-users", { id: "user1", label: "Duplicado" });
  assert.equal(duplicate.statusCode, 409);
  records.set("lobbyUsers/user2", { id: "user2", label: "Ajeno", ownerUid: "operator2", active: true });
  const simulated = await request("POST /api/lobby-users/import", { users: [{ id: "user1", label: "Simulado" }] });
  assert.equal(simulated.body.dryRun, true);
  assert.equal(records.get("lobbyUsers/user1").label, "Editado");
  const foreignImport = await request("POST /api/lobby-users/import", { users: [{ id: "user2", label: "Ajeno" }], dryRun: false });
  assert.equal(foreignImport.body.summary.failed, 1);
  assert.equal(records.get("lobbyUsers/user2").ownerUid, "operator2");
  const denied = await request("POST /api/lobby-users/:id/disable", {}, "user2");
  assert.equal(denied.statusCode, 404);
  assert.equal(records.get("lobbyUsers/user2").active, true);
  for (let i = 0; i < 201; i++) records.set(`lobbyUsers/item${i}`, { label: `Persona ${i}`, ownerUid: "operator1", active: true });
  const search = await request("GET /api/search-lobby-users", null, null, { q: "persona" });
  assert.equal(search.body.users.length, 25);
  assert.equal(search.body.scanTruncated, false);
  assert.equal(search.body.resultsTruncated, true);
  const searchNext = await request("GET /api/search-lobby-users", null, null, { q: "persona", cursor: search.body.nextCursor });
  assert.equal(searchNext.body.users.length, 25);
  assert.notEqual(search.body.users[24].id, searchNext.body.users[0].id);
  const seen = new Set();
  let cursor = null;
  do {
    const page = await request("GET /api/search-lobby-users", null, null, { q: "persona", cursor });
    page.body.users.forEach((user) => { assert(!seen.has(user.id)); seen.add(user.id); });
    cursor = page.body.nextCursor;
  } while (cursor);
  assert.equal(seen.size, 201);
  const foreign = await request("GET /api/search-lobby-users", null, null, { q: "ajeno" });
  assert.equal(foreign.body.users.length, 0);
  await assert.rejects(() => request("GET /api/search-lobby-users", null, null, { cursor: "../bad" }), /id solo/);
  records.set("lobbyUsers/zz-last", { label: "Unica despues de 200", ownerUid: "operator1", active: true });
  const sparse = await request("GET /api/search-lobby-users", null, null, { q: "unica despues" });
  assert.equal(sparse.body.users[0].id, "zz-last");
  assert.equal(sparse.body.nextCursor, null);
  const list = await request("GET /api/lobby-users", null, null, { q: "no existe", limit: "200" });
  assert.equal(list.body.users.length, 0);
  assert.equal(list.body.scanTruncated, false);
  const limited = await request("GET /api/lobby-users", null, null, { limit: "-5" });
  assert.equal(limited.body.users.length, 200);
  const lastPage = await request("GET /api/lobby-users", null, null, { cursor: limited.body.nextCursor, limit: "200" });
  assert.equal(lastPage.body.users.length, 2);
  assert.equal(lastPage.body.nextCursor, null);
  console.log("Pruebas de integridad correctas");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
