"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const mainUrl = "https://www.senado.cl/transparencia/lobby/audiencia";
const frameUrl = "https://lobby.senado.cl/public_html/forms/masters-senado/audiencia.php";

async function test(firefox) {
  let backgroundListener, onConnect, frameListener;
  const disconnect = [];
  const requests = [];
  const port = { name: "senado-formulario", sender: { tab: { id: 10 }, frameId: 7, url: frameUrl }, onDisconnect: { addListener(fn) { disconnect.push(fn); } } };
  const api = {
    runtime: {
      id: "extension-id",
      onConnect: { addListener(fn) { onConnect = fn; } },
      onMessage: { addListener(fn) { backgroundListener = fn; } }
    },
    tabs: { sendMessage(tabId, message, options, callback) {
      requests.push({ tabId, message, options });
      const promise = new Promise((resolve) => frameListener(message, { id: "extension-id" }, resolve));
      if (callback) promise.then(callback); else return promise;
    } }
  };
  const context = { console, URL, URLSearchParams, Promise, Map, Number, LOBBY_API_BASE_URL: "https://example.invalid/api" };
  context[firefox ? "browser" : "chrome"] = api;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "src/background.js"), "utf8"), context);
  const frame = {
    window: { top: {}, setTimeout() {} }, Promise,
    AsistenteLobby: { senado: { adapter: { detect: () => true, fillMainForm: async (data, index) => ({ filled: [data.usuarios[index].nombres], missing: [], notFound: [], warnings: [] }) } } }
  };
  frame[firefox ? "browser" : "chrome"] = { runtime: { id: "extension-id", connect: () => { onConnect(port); return port; }, onMessage: { addListener(fn) { frameListener = fn; } } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "src/sites/senado/frame-bridge.js"), "utf8"), frame);
  const invoke = (message, sender) => new Promise((resolve) => backgroundListener(message, sender, resolve));
  const message = { type: "senado:fill", data: { usuarios: [{ nombres: "Prueba" }] }, requesterIndex: 0 };
  const sender = { tab: { id: 10 }, frameId: 0, url: mainUrl };
  const response = await invoke(message, sender);
  assert.equal(response.ok, true);
  assert.equal(response.result.filled[0], "Prueba");
  assert.equal(requests[0].tabId, 10);
  assert.equal(requests[0].options.frameId, 7);
  const pageWindow = {};
  pageWindow.top = pageWindow;
  const page = {
    window: pageWindow, location: { hostname: "www.senado.cl", pathname: "/transparencia/lobby/audiencia" }, Promise,
    AsistenteLobby: { payload: { normalizePayload: (data) => data } }
  };
  page[firefox ? "browser" : "chrome"] = { runtime: { sendMessage(request, callback) {
    const promise = invoke(request, sender);
    if (callback) promise.then(callback); else return promise;
  } } };
  vm.createContext(page);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "src/sites/senado/page-adapter.js"), "utf8"), page);
  assert.equal(page.AsistenteLobby.senado.adapter.detect(), true);
  const result = await page.AsistenteLobby.senado.adapter.fillMainForm({ solicitud: {}, usuarios: [{ nombres: "Uno" }, { nombres: "Dos" }] }, 1);
  assert.equal(result.filled[0], "Dos");
  assert.equal(requests[1].message.data.usuarios.length, 1);
  assert.equal((await invoke(message, { ...sender, url: "https://example.invalid/" })).ok, false);
  assert.equal((await invoke(message, { ...sender, tab: { id: 11 } })).ok, false);
  assert.equal(frameListener({ type: "senado:fillFrame" }, { id: "otro" }, () => {}), false);
  disconnect.forEach((fn) => fn());
  assert.equal((await invoke(message, sender)).ok, false);
}
Promise.all([test(true), test(false)]).then(() => console.log("Comunicacion Senado entre frames correcta"))
  .catch((error) => { console.error(error); process.exitCode = 1; });
