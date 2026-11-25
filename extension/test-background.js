"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

async function run(firefox, success) {
  let listener;
  const api = {
    storage: { session: { get(keys, callback) {
      const result = { asistenteLobbySession: { idToken: "test", expiresAt: Date.now() + 60000 } };
      if (callback) callback(result); else return Promise.resolve(result);
    } } },
    runtime: { onMessage: { addListener(fn) { listener = fn; } }, onConnect: { addListener() {} } }
  };
  const context = { console, URL, URLSearchParams, Date, Promise, fetch: async (url) => {
    assert.equal(url, "https://proyectolobby.onrender.com/api/search-lobby-users?q=prueba");
    if (success) return { status: 200, ok: true, json: async () => ({ ok: true, users: [{ id: "usuario-prueba" }] }) };
    return { status: 503, ok: false, json: async () => { throw new Error("HTML"); } };
  } };
  context[firefox ? "browser" : "chrome"] = api;
  vm.createContext(context);
  const load = (file) => vm.runInContext(fs.readFileSync(path.join(__dirname, "src", file), "utf8"), context);
  if (firefox) load("api-config.js");
  else context.importScripts = load;
  load("background.js");
  const response = await new Promise((resolve) => listener({ type: "api:searchLobbyUsers", query: "prueba" }, {}, resolve));
  assert.equal(response.ok, success);
  if (success) assert.equal(response.users[0].id, "usuario-prueba");
  else assert.match(response.error, /HTTP 503/);
}
Promise.all([run(false, false), run(true, false), run(false, true), run(true, true)])
  .then(() => console.log("Configuracion de API de extension correcta"))
  .catch((error) => { console.error(error); process.exitCode = 1; });
