"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function field(value = "") {
  return { value, disabled: false, readOnly: false, dispatchEvent(event) { if (this.onEvent) this.onEvent(event); } };
}
const selectors = {};
const form = "#main.formulario-audiencia #form1";
const authority = selectors["#seleccion select"] = field("0");
const type = selectors["select.select_tipo"] = field("1");
for (const id of ["rut", "pasaporte", "nombres", "apellido", "correo", "telefono", "materia_tratar", "observacion_adicional", "id_remuneracion_1", "id_remuneracion_2"]) selectors["#" + id] = field();
const natural = ["#Nombre_persona_natural", "#rut_persona_natural", "#pasaporte_natural", "#naturaleza_representacion"];
const legal = ["#razon", "#giro_persona_juridica", "#domicilio", "#rut_persona_juridica", "#naturaleza_representacion"];
const entity = ["#nombres_sin_personalidad", "#giro_sin_personalidad", "#domicilio_sin_personalidad", "#rut_sin_personalidad", "#naturaleza_representacion"];
const represented = Object.fromEntries([...new Set([...natural, ...legal, ...entity])].map((id) => [id, field()]));
const region = field("00");
region.options = [{ value: "00", textContent: "--Seleccione--" }, { value: "13", textContent: "Region Metropolitana de Santiago" }];
const comuna = field();
comuna.options = [{ value: "0", textContent: "--Seleccione--" }, { value: "13101", textContent: "Santiago" }];
const container = { innerHTML: "antes", querySelector: () => comuna };
region.onEvent = (event) => { if (event.type === "change") container.innerHTML = "actualizado"; };
const document = { querySelector(selector) {
  if (selector === form) return {};
  if (!selector.startsWith(form + " ")) return null;
  const key = selector.slice(form.length + 1);
  if (key === "#entidades #region") return region;
  if (key === "#entidades #seleccion_comuna") return container;
  if (key === "#entidades #seleccion_comuna select") return comuna;
  if (key.startsWith("#entidades ")) {
    const id = key.slice("#entidades ".length);
    const allowed = { "1": natural, "2": legal, "3": entity }[type.value];
    return allowed && allowed.includes(id) ? represented[id] : null;
  }
  return selectors[key] || null;
} };
const listeners = new Set();
const window = {
  setTimeout, clearTimeout, location: { origin: "https://lobby.senado.cl" },
  addEventListener(type, handler) { if (type === "message") listeners.add(handler); },
  removeEventListener(type, handler) { if (type === "message") listeners.delete(handler); }
};
function notify(phase, id = 0, ok = true) {
  for (const handler of [...listeners]) handler({ source: window, origin: window.location.origin, data: { source: "asistente-lobby-senado-lookup", phase, id, ok } });
}
document.createElement = () => ({ remove() {} });
document.documentElement = { appendChild(script) { notify("ready"); if (script.onload) script.onload(); } };
let found = false;
let lookupSuccess = true;
let requestId = 0;
selectors["#rut"].focus = function () { document.activeElement = this; };
selectors["#rut"].blur = function () {
  document.activeElement = null;
  const id = ++requestId;
  notify("start", id);
  setTimeout(() => {
    for (const [key, value] of Object.entries({ "#nombres": "Nombre Senado", "#apellido": "Apellido Senado", "#correo": "senado@example.invalid", "#telefono": "123456" })) {
      selectors[key].readOnly = found;
      selectors[key].value = found ? value : "";
    }
    notify("complete", id, lookupSuccess);
  }, 0);
};
const context = { document, location: { hostname: "lobby.senado.cl", pathname: "/public_html/forms/masters-senado/audiencia.php" }, Event: class { constructor(type) { this.type = type; } }, window, chrome: { runtime: { getURL: (path) => path } }, Promise };
vm.createContext(context);
for (const path of ["src/shared/payload.js", "src/sites/senado/form-filler.js"]) vm.runInContext(fs.readFileSync(`${__dirname}/${path}`, "utf8"), context);
const adapter = context.AsistenteLobby.senado.adapter;

(async () => {
  assert.equal(adapter.detect(), true);
  const payload = { solicitud: { referencia: "Materia" }, usuarios: [{ nombres: "Ana", pasaporte: "12345678-5", pais: "CHL", remunerado: false, representado: { tipo: "persona_juridica", nombre: "Empresa", pais: "CHL", pasaporte: "12345678-5", giro: "Servicios", region: "Metropolitana", comuna: "Santiago" } }] };
  let result = await adapter.fillMainForm(payload, 0);
  assert.match(result.warnings[0], /Selecciona primero la autoridad/);
  assert.equal(selectors["#nombres"].value, "");
  authority.value = "42";
  result = await adapter.fillMainForm(payload, 0);
  assert.equal(selectors["#rut"].value, "12.345.678-5");
  assert.equal(selectors["#id_remuneracion_1"].checked, true);
  assert.equal(type.value, "2");
  assert.equal(represented["#razon"].value, "Empresa");
  assert.equal(comuna.value, "13101");
  assert(result.warnings.some((value) => value.includes("fantasia")));
  found = true;
  payload.usuarios[0].email = "portal@example.invalid";
  result = await adapter.fillMainForm(payload, 0);
  assert.equal(selectors["#nombres"].value, "Nombre Senado");
  assert.equal(selectors["#correo"].value, "senado@example.invalid");
  assert(result.recovered.some((value) => value.includes("nombres")));
  assert(result.warnings.some((value) => value.includes("difiere")));
  lookupSuccess = false;
  result = await adapter.fillMainForm(payload, 0);
  assert.equal(selectors["#nombres"].value, "Nombre Senado");
  assert(result.warnings.some((value) => value.includes("consulta de RUT del Senado fallo")));
  lookupSuccess = true;
  found = false;
  payload.usuarios[0].representado = { tipo: "otras_entidades", nombre: "Entidad", giro: "Comunidad" };
  await adapter.fillMainForm(payload, 0);
  assert.equal(type.value, "3");
  assert.equal(represented["#nombres_sin_personalidad"].value, "Entidad");
  payload.usuarios[0].representado = { tipo: "persona_natural", nombre: "Persona", pais: "ARG", pasaporte: "AB123" };
  result = await adapter.fillMainForm(payload, 0);
  assert.equal(represented["#pasaporte_natural"].value, "AB123");
  payload.usuarios[0].pasaporte = "12345678-0";
  result = await adapter.fillMainForm(payload, 0);
  assert(result.warnings.some((value) => value.includes("RUT no valido")));
  payload.usuarios[0].pasaporte = "";
  selectors["#correo"].disabled = true;
  const correoAnterior = selectors["#correo"].value;
  payload.usuarios[0].email = "ana@example.invalid";
  result = await adapter.fillMainForm(payload, 0);
  assert.equal(selectors["#correo"].value, correoAnterior);
  assert(result.missing.some((value) => value.includes("correo")));
  result = await adapter.fillAssistant({ nombres: "Otra persona" });
  assert.equal(selectors["#nombres"].value, "Ana");
  assert(result.warnings.some((value) => value.includes("manualmente")));
  console.log("Pruebas del adaptador Senado correctas");
})().catch((error) => { console.error(error); process.exitCode = 1; });
