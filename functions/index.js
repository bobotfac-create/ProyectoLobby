"use strict";

const { setGlobalOptions } = require("firebase-functions/v2");
const { onRequest } = require("firebase-functions/v2/https");

setGlobalOptions({ region: "us-central1", maxInstances: 10 });
exports.api = onRequest(require("./app"));
