import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPageHash,
  buildPostHash,
  buildPostRouteUrl,
  readInitialRoute,
  parseHashRoute,
} from "./hash-router.mjs";

const currentDir = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(join(currentDir, "app.mjs"), "utf8");

test("builds stable hash routes for pages and posts", () => {
  assert.equal(buildPageHash("profile"), "#/profile");
  assert.equal(buildPageHash("detail"), "#/detail");
  assert.equal(buildPostHash("post 1"), "#/post/post%201");
});

test("parses hash routes for direct page and post links", () => {
  assert.deepEqual(parseHashRoute("#/create"), { page: "create", postId: "" });
  assert.deepEqual(parseHashRoute("#/post/abc-123"), { page: "detail", postId: "abc-123" });
  assert.deepEqual(parseHashRoute("#/missing"), { page: "home", postId: "" });
});

test("reads initial route with legacy shared post compatibility", () => {
  assert.deepEqual(readInitialRoute("https://example.test/app#/profile"), { page: "profile", postId: "" });
  assert.deepEqual(readInitialRoute("https://example.test/app?post=legacy-id"), { page: "detail", postId: "legacy-id" });
  assert.deepEqual(readInitialRoute("https://example.test/app?post=legacy-id#/post/hash-id"), { page: "detail", postId: "hash-id" });
});

test("post share urls use copyable hash routes without stale post query params", () => {
  assert.equal(
    buildPostRouteUrl("https://example.test/app?post=old#/home", "new-id"),
    "https://example.test/app#/post/new-id",
  );
});

test("app wires browser back and hash changes into navigation", () => {
  assert.match(appSource, /window\.addEventListener\("popstate", handleBrowserRouteChange\)/);
  assert.match(appSource, /window\.addEventListener\("hashchange", handleBrowserRouteChange\)/);
  assert.match(appSource, /function applyBrowserRoute/);
});
