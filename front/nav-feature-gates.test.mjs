import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(currentDir, "index.html"), "utf8");
const appSource = readFileSync(join(currentDir, "app.mjs"), "utf8");

for (const page of ["leaderboard", "activity"]) {
  test(`disables the ${page} top navigation entry`, () => {
    const navLink = html.match(new RegExp(`<a[^>]+data-page="${page}"[^>]*>`))?.[0] ?? "";

    assert.match(navLink, /\bnav-link-disabled\b/);
    assert.match(navLink, /aria-disabled="true"/);
    assert.doesNotMatch(navLink, /onclick="navigate/);
  });
}

test("blocks disabled leaderboard and activity routes in static and module navigation", () => {
  assert.match(html, /DISABLED_NAV_PAGES\s*=\s*new Set\(\["leaderboard", "activity"\]\)/);
  assert.match(appSource, /loadAppFeatureFlags\(\)/);
  assert.match(appSource, /applyFeatureGates\(\)/);
  assert.match(html, /DISABLED_NAV_PAGES\.has\(page\)/);
  assert.match(appSource, /state\.disabledNavPages\.has\(page\)/);
});
