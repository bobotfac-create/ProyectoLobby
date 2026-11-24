"use strict";
const assert = require("node:assert/strict");
const net = require("node:net");
const { spawn, spawnSync } = require("node:child_process");

async function main() {
  const env = { ...process.env, RENDER: "true", FIREBASE_SERVICE_ACCOUNT_JSON: "secret-malformado" };
  const invalid = spawnSync(process.execPath, ["server.js"], { cwd: __dirname, env, encoding: "utf8" });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /FIREBASE_SERVICE_ACCOUNT_JSON invalido/);
  assert(!invalid.stderr.includes(env.FIREBASE_SERVICE_ACCOUNT_JSON));

  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const localEnv = { ...process.env, PORT: String(port), GCLOUD_PROJECT: "asistente-lobby" };
  delete localEnv.RENDER;
  delete localEnv.FIREBASE_SERVICE_ACCOUNT_JSON;
  const child = spawn(process.execPath, ["server.js"], { cwd: __dirname, env: localEnv });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("API no inicio a tiempo")), 10000);
      child.stdout.once("data", () => { clearTimeout(timer); resolve(); });
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`API termino: ${code}`)); });
    });
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
    console.log("Servidor independiente y validacion de credenciales correctos");
  } finally {
    child.kill();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
