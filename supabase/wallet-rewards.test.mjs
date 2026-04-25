import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const signupBonusFunction = readFileSync(
  new URL("./functions/reconcile-signup-bonus/index.ts", import.meta.url),
  "utf8",
);
const virtualCoinSeed = readFileSync(
  new URL("./seed_virtual_coin_draft.sql", import.meta.url),
  "utf8",
);

test("signup bonus edge function grants 1500 MOB", () => {
  assert.match(signupBonusFunction, /const SIGNUP_BONUS_AMOUNT = 1500;/);
  assert.match(signupBonusFunction, /balance_after: wallet\.balance \+ SIGNUP_BONUS_AMOUNT/);
});

test("demo virtual coin seed uses the same starter amount", () => {
  assert.match(virtualCoinSeed, /'draft_seed_signup_bonus'::text,\s*1500::bigint/);
  assert.match(virtualCoinSeed, /'signup_bonus'::text as transaction_type,\s*1500::bigint as amount/);
});
