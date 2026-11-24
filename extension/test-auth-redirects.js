"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname, "../public/extension-auth-redirects.js"), "utf8");
function load(script) {
  const context = { window: {}, URL };
  vm.runInNewContext(script, context);
  return context.window.isAllowedLobbyExtensionRedirect;
}
const allowed = "https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.chromiumapp.org/firebase";
assert.equal(load(source)(allowed), false);
const check = load(source.replace("Object.freeze([])", `Object.freeze([${JSON.stringify(allowed)}])`));
assert.equal(check(allowed), true);
assert.equal(check("https://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.chromiumapp.org/firebase"), false);
assert.equal(check(allowed + "?extra=1"), false);
assert.equal(check(allowed + "#token"), false);
assert.equal(check("not a URL"), false);
console.log("Validacion de destinos de autenticacion correcta");
