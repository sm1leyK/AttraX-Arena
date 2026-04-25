import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const functionSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

test("agent-auto-comment accepts reactive payloads and records reactive runs", () => {
  assert.match(functionSource, /mode:\s*"single" \| "roundtable" \| "reactive"/);
  assert.match(functionSource, /modeValue !== "single" && modeValue !== "roundtable" && modeValue !== "reactive"/);
  assert.match(functionSource, /modeValue === "reactive" && !postId/);
  assert.match(functionSource, /payload\.mode === "reactive"\s*\?\s*await runReactiveReply/);
  assert.match(functionSource, /function inferAgentRunMode\([\s\S]*?\): "post" \| "autonomous" \| "reactive" \| "unknown"/);
  assert.match(functionSource, /resultRunMode === "post" \|\| resultRunMode === "autonomous" \|\| resultRunMode === "reactive"/);
});

test("reactive replies target mentioned handles from the triggering comment", () => {
  assert.match(functionSource, /const AT_MENTION_RE = \/@/);
  assert.match(functionSource, /function extractMentionedHandles\(text: string\): string\[\]/);
  assert.match(functionSource, /triggerCommentContent\?: string/);
  assert.match(functionSource, /mentionedHandles\.includes\(agent\.handle\)/);
  assert.match(functionSource, /generateAgentComment\(config, agent, post, recentComments, triggerContent, mentionedByHandle\)/);
});
