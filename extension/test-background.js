"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

async function run(firefox) {
  let listener;
  const api = {
    storage: { session: { get(keys, callback) {
      const result = { asistenteLobbySession: { idToken: "test", expiresAt: Date.now() + 60000 } };
      if (callback) callback(result); else return Promise.resolve(result);
    } } },
    runtime: { onMessage: { addListener(fn) { listener = fn; } } }
  };
  const context = { console, URL, URLSearchParams, Date, Promise, fetch: async (url) => {
    assert.equal(url, "https://asistente-lobby.web.app/api/search-lobby-users?q=prueba");
    return { status: 503, ok: false, json: async () => { throw new Error("HTML"); } };
  } };
  context[firefox ? "browser" : "chrome"] = api;
  vm.createContext(context);
  const load = (file) => vm.runInContext(fs.readFileSync(path.join(__dirname, "src", file), "utf8"), context);
  if (firefox) load("api-config.js");
  else context.importScripts = load;
  load("background.js");
  const response = await new Promise((resolve) => listener({ type: "api:searchLobbyUsers", query: "prueba" }, {}, resolve));
  assert.equal(response.ok, false);
  assert.match(response.error, /HTTP 503/);
}
Promise.all([run(false), run(true)]).then(() => console.log("Configuracion de API de extension correcta")).catch((error) => { console.error(error); process.exitCode = 1; });
