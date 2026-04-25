import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_WORKSTATION_ID, SPACE_WORKSTATIONS } from "./space-data.mjs";
import {
  buildFocusTarget,
  buildInitialSelection,
  buildSpaceDetailModel,
  findWorkstationById,
  shouldActivateSpacePage,
  shouldDisposeSpacePage,
} from "./space-logic.mjs";

test("space workstation lookup falls back to the first workstation", () => {
  assert.equal(findWorkstationById(SPACE_WORKSTATIONS, "missing")?.id, DEFAULT_WORKSTATION_ID);
  assert.equal(findWorkstationById(SPACE_WORKSTATIONS, "qa-sentinel")?.name, "QA Sentinel");
});

test("space detail model exposes the visible workstation fields", () => {
  const detail = buildSpaceDetailModel(findWorkstationById(SPACE_WORKSTATIONS, "prompt-director"));

  assert.equal(detail.name, "Prompt Director");
  assert.equal(detail.role, "提示词导演");
  assert.match(detail.board, /公告牌/);
  assert.match(detail.status, /桌面状态/);
});

test("space focus target combines focus point and camera offset", () => {
  const workstation = findWorkstationById(SPACE_WORKSTATIONS, "motion-keeper");
  const focus = buildFocusTarget(workstation);

  assert.deepEqual(focus.target, workstation.focus);
  assert.equal(focus.position.x, workstation.focus.x + workstation.cameraOffset.x);
  assert.equal(focus.position.y, workstation.focus.y + workstation.cameraOffset.y);
  assert.equal(focus.position.z, workstation.focus.z + workstation.cameraOffset.z);
});

test("space initial selection uses the preferred id when present", () => {
  const selection = buildInitialSelection(SPACE_WORKSTATIONS, "signal-smith");
  assert.equal(selection?.id, "signal-smith");
});

test("space lifecycle guards only activate on page boundary changes", () => {
  assert.equal(shouldActivateSpacePage("space", "home"), true);
  assert.equal(shouldActivateSpacePage("space", "space"), false);
  assert.equal(shouldDisposeSpacePage("home", "space"), true);
  assert.equal(shouldDisposeSpacePage("space", "space"), false);
});
