import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(join(currentDir, "app.mjs"), "utf8");

test("auth client persists sessions for automatic login on return visits", () => {
  assert.match(appSource, /persistSession:\s*true/);
  assert.match(appSource, /autoRefreshToken:\s*true/);
  assert.match(appSource, /detectSessionInUrl:\s*true/);
  assert.match(appSource, /auth\.getSession\(\)/);
});

test("stored sessions leave the login page without another password entry", () => {
  assert.match(appSource, /function redirectAuthenticatedAuthRoute\(/);
  assert.match(appSource, /state\.initialRoutePage === "auth"/);
  assert.match(appSource, /navigate\("home", \{ replaceRoute: true \}\)/);
  assert.match(appSource, /redirectAuthenticatedAuthRoute\(\)/);
});

test("auth copy tells users login is kept on this device", () => {
  assert.match(appSource, /本设备会保持登录状态/);
});
