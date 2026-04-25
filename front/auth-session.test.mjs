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

test("stored sessions restore the authenticated UI before network follow-up work", () => {
  const refreshSessionBody = appSource.match(/async function refreshSession\(\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.notEqual(refreshSessionBody, "");

  const userAssignment = refreshSessionBody.indexOf("state.user = session?.user ?? null;");
  const uiRefresh = refreshSessionBody.indexOf("updateAuthUi();");
  const redirect = refreshSessionBody.indexOf("redirectAuthenticatedAuthRoute();");
  const walletSync = refreshSessionBody.indexOf("ensureWalletExperience");

  assert.ok(userAssignment >= 0);
  assert.ok(uiRefresh > userAssignment);
  assert.ok(redirect > userAssignment);
  assert.ok(walletSync > uiRefresh);
  assert.ok(walletSync > redirect);
});

test("auth copy tells users login is kept on this device", () => {
  assert.match(appSource, /本设备会保持登录状态/);
});
