import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const functionSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

test("analyze-post resolves the active LLM provider from backend secrets", () => {
  assert.match(functionSource, /ACTIVE_LLM_PROVIDER/);
  assert.match(functionSource, /function resolveLensConfig\(\)/);
  assert.match(functionSource, /ORBITAI_API_KEY/);
  assert.match(functionSource, /DEEPSEEK_API_KEY/);
  assert.match(functionSource, /api:\s*"chat_completions"/);
  assert.match(functionSource, /api:\s*LENS\.api/);
  assert.match(functionSource, /OPENAI_LENS_MODEL/);
  assert.doesNotMatch(functionSource, /const OPENAI_API_KEY =/);
});
