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
    payload: { EXAMPLE_FULL_DATA: { usuarios: [] }, normalizePayload: (payload) => payload, userLabel: (user) => user.label },
    leylobby: { adapter: { detect: () => true, assistantActionLabel: "Abrir modal" } }
  },
  chrome: { runtime: { sendMessage(message, callback) { callback({ authenticated: false }); } } },
  window: { addEventListener() {} }
};
let source = fs.readFileSync(`${__dirname}/src/content.js`, "utf8");
source = source.replace("  if (!getAdapter()) return;", "  globalThis.panelTest = { createPanel: createPanel, showResult: showResult };\n  if (!getAdapter()) return;");
vm.runInNewContext(source, context);
const panel = context.panelTest.createPanel();
assert(panel.querySelector("[data-lobby-google-login]").handlers.click);
assert(panel.querySelector("[data-lobby-fill]").handlers.click);
assert(panel.querySelector("[data-lobby-search-next]").disabled);
assert.equal(panel.querySelector("[data-lobby-fill-assistant]").textContent, "Abrir modal");
const malicious = '<img src=x onerror="alert(1)">';
context.panelTest.showResult({ filled: [malicious], missing: [], notFound: [], warnings: [] });
const result = document.getElementById("asistente-lobby-result");
assert.equal(result.children[1].children[0].textContent, malicious);
assert.equal(result.children[1].children[0].children.length, 0);
assert.equal(result.children.length, 8);
console.log("Pruebas del panel correctas");
