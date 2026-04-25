import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderSpaceDetail, setActiveSpaceSelector, setSpaceStatus } from "./space-page.mjs";
import { findWorkstationById } from "./space-logic.mjs";
import { SPACE_WORKSTATIONS } from "./space-data.mjs";

const currentDir = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(join(currentDir, "app.mjs"), "utf8");
const htmlSource = readFileSync(join(currentDir, "index.html"), "utf8");

test("space page wiring is present in html and app navigation", () => {
  assert.match(htmlSource, /data-page="space"/);
  assert.match(htmlSource, /href="#\/space"/);
  assert.match(htmlSource, /id="page-space"/);
  assert.match(htmlSource, /id="spaceCanvas"/);
  assert.match(htmlSource, /id="spaceDetailCard"/);
  assert.match(htmlSource, /id="spaceStatus"/);
  assert.match(htmlSource, /import\('\.\/space-page\.mjs'\)/);
  assert.match(appSource, /import \{ disposeSpacePage, loadSpacePage \} from "\.\/space-page\.mjs";/);
  assert.match(appSource, /if \(activePageController === "space" && page !== "space"\) \{\s*disposeSpacePage\(\);\s*\}/);
  assert.match(appSource, /if \(page === "space"\) \{\s*void loadSpacePage\(\);\s*\}/);
});

test("space route is reachable even when supabase config is unavailable", () => {
  assert.match(appSource, /if \(!configReady\) \{[\s\S]*?state\.initialRoutePage !== "home"[\s\S]*?applyBrowserRoute\(\{ page: state\.initialRoutePage, postId: "" \}\)/);
});

test("space detail renderer updates all visible fields and selector state", () => {
  const elements = {
    detailName: { textContent: "" },
    detailRole: { textContent: "" },
    detailText: { textContent: "" },
    detailBoard: { textContent: "" },
    detailStatus: { textContent: "" },
    selectorButtons: [
      { dataset: { spaceTarget: "trend-prophet" }, classList: createClassList() },
      { dataset: { spaceTarget: "qa-sentinel" }, classList: createClassList() },
    ],
  };

  const detail = renderSpaceDetail(elements, findWorkstationById(SPACE_WORKSTATIONS, "trend-prophet"));

  assert.equal(elements.detailName.textContent, detail.name);
  assert.equal(elements.detailRole.textContent, detail.role);
  assert.equal(elements.detailText.textContent, detail.summary);
  assert.equal(elements.detailBoard.textContent, detail.board);
  assert.equal(elements.detailStatus.textContent, detail.status);
  assert.equal(elements.selectorButtons[0].classList.contains("is-active"), true);
  assert.equal(elements.selectorButtons[1].classList.contains("is-active"), false);
});

test("space status helper keeps message and tone in sync", () => {
  const elements = {
    status: {
      textContent: "",
      dataset: {},
    },
  };

  setSpaceStatus(elements, "空间已就绪", "ready");

  assert.equal(elements.status.textContent, "空间已就绪");
  assert.equal(elements.status.dataset.tone, "ready");
});

test("space selector helper toggles active button", () => {
  const elements = {
    selectorButtons: [
      { dataset: { spaceTarget: "trend-prophet" }, classList: createClassList(["is-active"]) },
      { dataset: { spaceTarget: "qa-sentinel" }, classList: createClassList() },
    ],
  };

  setActiveSpaceSelector(elements, "qa-sentinel");

  assert.equal(elements.selectorButtons[0].classList.contains("is-active"), false);
  assert.equal(elements.selectorButtons[1].classList.contains("is-active"), true);
});

function createClassList(initial = []) {
  const values = new Set(initial);
  return {
    toggle(name, force) {
      if (force) {
        values.add(name);
      } else {
        values.delete(name);
      }
    },
    contains(name) {
      return values.has(name);
    },
  };
}
