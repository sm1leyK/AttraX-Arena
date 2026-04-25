import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(join(currentDir, "app.mjs"), "utf8");

test("wallet signup bonus is retried after email-confirmed login", () => {
  assert.match(appSource, /lastSignupBonusAttemptUserId/);
  assert.match(
    appSource,
    /reason === "signup"[\s\S]*state\.lastSignupBonusAttemptUserId !== state\.user\.id/,
  );
  assert.match(appSource, /invokeRewardFunction\("reconcile-signup-bonus", 3\)/);
});
