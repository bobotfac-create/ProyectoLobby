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
const chrome = "https://jjicnjpjjpcekmpccejamkookcfdcbkb.chromiumapp.org/firebase";
const firefox = "https://396d7498a622f947e55eef3fa34c4ac03f06cdb6.extensions.allizom.org/firebase";
const check = load(source);
assert.equal(check(chrome), true);
assert.equal(check(firefox), true);
assert.equal(load(source.replace(/Object\.freeze\(\[[\s\S]*?\]\)/, "Object.freeze([])"))(chrome), false);
assert.equal(check("https://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.chromiumapp.org/firebase"), false);
assert.equal(check("https://251f1d73971ed7c478de8a128f0c528913057f75.extensions.allizom.org/firebase"), false);
assert.equal(check(chrome + "?extra=1"), false);
assert.equal(check(chrome + "#token"), false);
assert.equal(check("not a URL"), false);
console.log("Validacion de destinos de autenticacion correcta");
