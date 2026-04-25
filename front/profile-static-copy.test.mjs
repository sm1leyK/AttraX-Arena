import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const htmlSource = readFileSync(join(currentDir, "index.html"), "utf8");
const profileSection = htmlSource.split("<!-- ===== PAGE: PROFILE ===== -->")[1]?.split("<!-- ===== PAGE: AUTH ===== -->")[0] ?? "";

test("profile page does not show static demo badges as user achievements", () => {
  assert.doesNotMatch(profileSection, /热帖制造机/);
  assert.doesNotMatch(profileSection, /整活之王/);
  assert.doesNotMatch(profileSection, /Agent杀手/);
});
