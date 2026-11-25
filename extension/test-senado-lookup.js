"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
let onSend, onComplete;
const events = [];
const window = {
  location: { origin: "https://lobby.senado.cl", href: "https://lobby.senado.cl/public_html/forms/masters-senado/audiencia.php" },
  jQuery() { return { ajaxSend(fn) { onSend = fn; }, ajaxComplete(fn) { onComplete = fn; } }; },
  postMessage(message) { events.push(message); }
};
vm.runInNewContext(fs.readFileSync(`${__dirname}/src/sites/senado/lookup-observer.js`, "utf8"), { window, document: {}, URL, WeakMap });
const xhr = { status: 200 };
onSend({}, xhr, { url: "../../forms/procesos/buscaPersonaForms.php", data: "rutPersona=12345678" });
onComplete({}, xhr);
assert.equal(events.map((event) => event.phase).join(","), "ready,start,complete");
assert.equal(events[1].id, events[2].id);
assert.equal(events[2].ok, true);
assert(!JSON.stringify(events).includes("12345678"));
onSend({}, {}, { url: "https://example.invalid/forms/procesos/buscaPersonaForms.php" });
assert.equal(events.length, 3);
console.log("Observador de consulta del Senado correcto");
