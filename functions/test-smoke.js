"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const { api } = require("./index.js");

async function main() {
  const server = http.createServer(api);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    const health = await fetch(`${url}/api/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ok, true);
    const me = await fetch(`${url}/api/me`);
    assert.equal(me.status, 401);
    assert.equal((await me.json()).error, "Token requerido");
    console.log("Prueba HTTP con SDK real correcta");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
