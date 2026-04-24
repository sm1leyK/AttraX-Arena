import test from "node:test";
import assert from "node:assert/strict";
import {
  PROJECT_SUBMISSION_DEADLINE_ISO,
  PROJECT_SUBMISSION_DEADLINE_LOCAL,
  SUPPORT_BOARD_MAX_DEADLINE_ISO,
  buildSupportDeadlineValidation,
  formatCountdownDuration,
  formatForDateTimeLocal,
  getProjectSubmissionCountdownSnapshot,
  loadProjectSubmissionDeadlineConfig,
  getMarketCountdownSnapshot,
  parseLocalDateTimeInput,
} from "./support-deadline.mjs";

test("validates support-board deadline bounds", () => {
  const now = new Date("2026-04-25T03:00:00.000Z");
  const tooSoon = new Date(now.getTime() + 14 * 60_000);
  const valid = new Date(now.getTime() + 15 * 60_000);
  const tooLate = new Date(new Date(SUPPORT_BOARD_MAX_DEADLINE_ISO).getTime() + 60_000);

  assert.equal(buildSupportDeadlineValidation(null, { now }).ok, false);
  assert.equal(buildSupportDeadlineValidation(tooSoon, { now }).ok, false);
  assert.equal(buildSupportDeadlineValidation(valid, { now }).ok, true);
  assert.equal(buildSupportDeadlineValidation(tooLate, { now }).ok, false);
});

test("formats and parses datetime-local values", () => {
  const date = new Date("2026-04-26T10:00:00.000Z");

  assert.match(formatForDateTimeLocal(date), /^2026-04-26T\d\d:00$/);
  assert.equal(parseLocalDateTimeInput("bad-value"), null);
  assert.ok(parseLocalDateTimeInput("2026-04-26T18:00") instanceof Date);
});

test("returns countdown snapshots with injected now", () => {
  const deadline = "2026-04-25T04:00:00.000Z";

  assert.deepEqual(getMarketCountdownSnapshot(deadline, { now: new Date("2026-04-25T03:59:59.000Z") }), {
    expired: false,
    live: true,
    pending: false,
    valueText: "00:00:01",
    statusText: "进行中",
  });

  assert.equal(getMarketCountdownSnapshot(deadline, { now: new Date("2026-04-25T04:00:00.000Z") }).expired, true);
  assert.equal(getMarketCountdownSnapshot("", { now: new Date("2026-04-25T04:00:00.000Z") }).pending, true);
  assert.equal(formatCountdownDuration(90_000), "00:01:30");
});

test("treats project submission deadline as 2026-04-25 24:00 China time", () => {
  assert.equal(PROJECT_SUBMISSION_DEADLINE_LOCAL, "2026-04-26T00:00:00+08:00");
  assert.equal(new Date(PROJECT_SUBMISSION_DEADLINE_LOCAL).toISOString(), PROJECT_SUBMISSION_DEADLINE_ISO);

  assert.deepEqual(getProjectSubmissionCountdownSnapshot({ now: new Date("2026-04-24T15:59:59.000Z") }), {
    expired: false,
    live: true,
    remainingMs: 86_401_000,
    days: 1,
    hours: 0,
    minutes: 0,
    seconds: 1,
    valueText: "1d 00:00:01",
  });

  assert.equal(
    getProjectSubmissionCountdownSnapshot({ now: new Date("2026-04-25T16:00:00.000Z") }).valueText,
    "00:00:00",
  );
  assert.equal(
    getProjectSubmissionCountdownSnapshot({ now: new Date("2026-04-25T16:00:00.000Z") }).expired,
    true,
  );
});

test("loads project submission deadline config from backend RPC", async () => {
  const calls = [];
  const supabase = {
    async rpc(name) {
      calls.push(name);
      return {
        error: null,
        data: [{
          deadline_at: "2026-04-25T16:00:00.000Z",
          deadline_local: "2026-04-26T00:00:00+08:00",
          timezone: "Asia/Shanghai",
          label: "2026年4月25日24时",
        }],
      };
    },
  };

  const config = await loadProjectSubmissionDeadlineConfig({ supabase });

  assert.deepEqual(calls, ["get_project_submission_deadline"]);
  assert.equal(config.source, "backend");
  assert.equal(config.deadlineIso, "2026-04-25T16:00:00.000Z");
  assert.equal(config.deadlineLocal, "2026-04-26T00:00:00+08:00");
  assert.equal(config.label, "2026年4月25日24时");
});

test("falls back to the local project deadline when backend config is unavailable", async () => {
  const supabase = {
    async rpc() {
      return { error: new Error("offline"), data: null };
    },
  };

  const config = await loadProjectSubmissionDeadlineConfig({ supabase });

  assert.equal(config.source, "fallback");
  assert.equal(config.deadlineIso, PROJECT_SUBMISSION_DEADLINE_ISO);
  assert.equal(config.deadlineLocal, PROJECT_SUBMISSION_DEADLINE_LOCAL);
});
