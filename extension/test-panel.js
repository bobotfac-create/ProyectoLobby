"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

class Node {
  constructor(tag) { this.tag = tag; this.attributes = {}; this.children = []; this.style = {}; this.value = ""; this.handlers = {}; }
  setAttribute(name, value) { this.attributes[name] = value; if (name === "id") this.id = value; if (name === "disabled") this.disabled = true; }
  appendChild(child) { this.children.push(child); return child; }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(name, handler) { this.handlers[name] = handler; }
  querySelector(selector) {
    const attr = /^\[([^\]]+)\]$/.exec(selector);
    for (const child of this.children) {
      if (attr && Object.hasOwn(child.attributes, attr[1])) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
}
const body = new Node("body");
function byId(node, id) {
  if (node.id === id) return node;
  for (const child of node.children) { const found = byId(child, id); if (found) return found; }
  return null;
}
const document = { body, createElement: (tag) => new Node(tag), createTextNode: (text) => Object.assign(new Node("#text"), { textContent: text }), getElementById: (id) => byId(body, id) };
const context = {
  document, console, Promise,
  AsistenteLobby: {
    config: {},
    payload: { EXAMPLE_DATA: { nombres: "Ejemplo" }, EXAMPLE_FULL_DATA: { solicitud: {}, usuarios: [{ label: "Ejemplo" }] }, normalizePayload: (payload) => ({ solicitud: payload.solicitud || payload, usuarios: payload.usuarios || [] }), userLabel: (user) => user.label },
    leylobby: { adapter: { detect: () => true, assistantActionLabel: "Abrir modal" } }
  },
  chrome: { runtime: { sendMessage(message, callback) { callback(message.type === "api:searchRepresentados" ? { ok: true, representados: [{ id: "r1", nombre: "Entidad", tipo: "persona_juridica", ownerUid: "privado" }], nextCursor: null } : message.type === "api:getRepresentado" ? { ok: true, representado: { id: "r1", nombre: "Entidad", tipo: "persona_juridica", active: true, ownerUid: "privado" } } : { authenticated: false }); } } },
  window: { addEventListener() {} },
  location: { hostname: "www.senado.cl" }
};
let source = fs.readFileSync(`${__dirname}/src/content.js`, "utf8");
source = source.replace("  if (!getAdapter()) return;", "  globalThis.panelTest = { createPanel: createPanel, showResult: showResult, loadRepresentados: loadRepresentados, selectedRepresentado: selectedRepresentado };\n  if (!getAdapter()) return;");
vm.runInNewContext(source, context);
const panel = context.panelTest.createPanel();
assert(panel.querySelector("[data-lobby-google-login]").handlers.click);
assert(panel.querySelector("[data-lobby-fill]").handlers.click);
assert(panel.querySelector("[data-lobby-search-next]").disabled);
assert.equal(panel.querySelector("[data-lobby-fill-assistant]").textContent, "Abrir modal");
assert.deepEqual(JSON.parse(panel.querySelector("[data-lobby-json]").value), { solicitud: {}, usuarios: [] });
assert.equal(panel.querySelector("[data-lobby-fill]").disabled, true);
panel.querySelector("[data-lobby-full-example]").handlers.click();
assert.match(panel.querySelector("[data-lobby-users-status]").textContent, /ejemplo/i);
assert.equal(panel.querySelector("[data-lobby-requester-select]").value, "");
panel.querySelector("[data-lobby-fill]").handlers.click();
assert.match(document.getElementById("asistente-lobby-result").children[3].children[0].textContent, /Selecciona un solicitante/);
const malicious = '<img src=x onerror="alert(1)">';
context.panelTest.showResult({ filled: [malicious], missing: [], notFound: [], warnings: [] });
const result = document.getElementById("asistente-lobby-result");
assert.equal(result.children[3].children[0].textContent, malicious);
assert.equal(result.children[3].children[0].children.length, 0);
assert.equal(result.children.length, 4);
const senadoBody = new Node("body");
const senadoDocument = { ...document, body: senadoBody, getElementById: (id) => byId(senadoBody, id) };
vm.runInNewContext(fs.readFileSync(`${__dirname}/src/content.js`, "utf8"), {
  ...context,
  document: senadoDocument,
  AsistenteLobby: { ...context.AsistenteLobby, leylobby: null, senado: { adapter: { id: "senado-audiencia", detect: () => true } } }
});
const senadoToggle = senadoDocument.getElementById("asistente-lobby-toggle");
assert(senadoToggle);
assert.match(senadoToggle.style.cssText, /top:18px/);
assert.doesNotMatch(senadoToggle.style.cssText, /bottom:18px/);
const frameBody = new Node("body");
const frameDocument = { ...document, body: frameBody, getElementById: (id) => byId(frameBody, id) };
vm.runInNewContext(fs.readFileSync(`${__dirname}/src/content.js`, "utf8"), {
  ...context,
  document: frameDocument,
  location: { hostname: "lobby.senado.cl" },
  window: { top: {}, addEventListener() {} },
  AsistenteLobby: { ...context.AsistenteLobby, leylobby: null, senado: { adapter: { id: "senado-audiencia", detect: () => true } } }
});
assert.equal(frameDocument.getElementById("asistente-lobby-toggle"), null);
context.panelTest.loadRepresentados(panel).then(async () => {
  const requester = panel.querySelector("[data-lobby-requester-represented]");
  const assistant = panel.querySelector("[data-lobby-assistant-represented]");
  assert.equal(requester.value, "");
  requester.value = "r0";
  panel.querySelector("[data-lobby-requester-representation-kind]").value = "legal";
  const selected = await context.panelTest.selectedRepresentado(panel, "requester-represented", {});
  assert.equal(selected.nombre, "Entidad");
  assert.equal(selected.tipoRepresentacion, "legal");
  assert.equal(selected.ownerUid, undefined);
  assert.throws(() => context.panelTest.selectedRepresentado(panel, "assistant-represented", {}), /Selecciona un representado/);
  assistant.value = "manual";
  assert.equal(context.panelTest.selectedRepresentado(panel, "assistant-represented", {}), null);
  assistant.value = "legacy";
  assert.equal(context.panelTest.selectedRepresentado(panel, "assistant-represented", { representado: { nombre: "Antiguo" } }).nombre, "Antiguo");
  console.log("Pruebas del panel correctas");
}).catch((error) => { console.error(error); process.exitCode = 1; });
