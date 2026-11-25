const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(require("node:path").join(__dirname, "admin.js"), "utf8");
const helpers = source.slice(source.indexOf("function formSnapshot()"), source.indexOf("function userFromForm()"));
const context = vm.createContext({
  els: { userForm: { value: "inicial" } },
  FormData: class {
    constructor(form) { this.form = form; }
    entries() { return [["label", this.form.value]]; }
  },
  window: { confirm: () => false },
  savedForm: null,
  savingForm: false
});
vm.runInContext(helpers, context);
context.savedForm = context.formSnapshot();
assert.equal(context.confirmDiscard(), true);
context.els.userForm.value = "editado";
assert.equal(context.confirmDiscard(), false);
context.window.confirm = () => true;
assert.equal(context.confirmDiscard(), true);
context.savingForm = true;
assert.equal(context.confirmDiscard(), false);
const formContext = vm.createContext({
  state: { hasLegacyRepresentado: false },
  els: { userForm: {} },
  FormData: class {},
  objectFromPrefix: (form, prefix) => prefix === "representado" ? { nombre: "Anterior", pais: "CHL" } : {},
  formValue: (name) => ({ id: "persona", label: "Persona", pais: "CHL", active: "true" })[name] || "",
  asBoolean: (value, fallback) => value === "true" ? true : fallback,
  cleanUser: (user) => user
});
vm.runInContext(source.slice(source.indexOf("function userFromForm()"), source.indexOf("function validateUserForm(")), formContext);
assert.equal(formContext.userFromForm().representado, undefined);
formContext.state.hasLegacyRepresentado = true;
assert.equal(formContext.userFromForm().representado.nombre, "Anterior");
console.log("Proteccion de cambios del portal: OK");
