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

test("auth copy explains what to do after email confirmation", () => {
  assert.match(appSource, /Confirm/);
  assert.match(appSource, /关闭确认页/);
  assert.match(appSource, /回到这里登录/);
});

test("profile wallet explains the MOB reward rules", () => {
  assert.match(appSource, /新账号首次登录/);
  assert.match(appSource, /1500 MOB/);
  assert.match(appSource, /每日首次登录/);
  assert.match(appSource, /30 MOB/);
  assert.match(appSource, /YES \/ NO 站队消耗 50 MOB/);
  assert.match(appSource, /自动补领/);
});

test("detail YES NO market uses the current post title", () => {
  assert.doesNotMatch(appSource, /Will this post go viral in 24 hours/);
  assert.match(appSource, /const marketQuestion = post\.title \|\| "Untitled post";/);
});
