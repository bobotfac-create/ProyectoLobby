"use strict";

const { initializeApp, cert } = require("firebase-admin/app");
const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (raw) {
  let account;
  try {
    account = JSON.parse(raw);
    if (account.project_id !== "asistente-lobby") throw new Error("project");
    initializeApp({ credential: cert(account), projectId: "asistente-lobby" });
  } catch (error) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON invalido o de otro proyecto.");
  }
} else if (process.env.RENDER) {
  throw new Error("Falta FIREBASE_SERVICE_ACCOUNT_JSON para conectar Firebase en Render.");
}

const app = require("./app");
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT invalido.");
app.listen(port, "0.0.0.0", () => console.log(`API escuchando en puerto ${port}`));
