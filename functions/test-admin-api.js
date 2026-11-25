"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const publicDir = path.join(__dirname, "../public");
const source = fs.readFileSync(path.join(publicDir, "admin.js"), "utf8");
const api = source.match(/async function api\(path, options = \{\}\) \{[\s\S]*?\n\}\n\nfunction showTab/);
assert(api, "No se encontro la funcion del portal");
const context = { window: {}, state: { currentUser: { getIdToken: async () => "token-prueba" } } };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(publicDir, "api-config.js"), "utf8"), context);
vm.runInContext(api[0].replace(/\n\nfunction showTab$/, "") + "\nthis.callApi = api;", context);

async function main() {
  context.fetch = async (url, options) => {
    assert.equal(url, "https://proyectolobby.onrender.com/api/me");
    assert.equal(options.headers.Authorization, "Bearer token-prueba");
    return { status: 200, ok: true, json: async () => ({ ok: true }) };
  };
  assert.equal((await context.callApi("/me")).ok, true);
  context.fetch = async () => ({ status: 503, ok: false, json: async () => { throw new Error("HTML"); } });
  await assert.rejects(context.callApi("/me"), /HTTP 503/);
  console.log("Conexion del portal a la API correcta");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
