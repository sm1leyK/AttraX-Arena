import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  hasPostImage,
  normalizePostImageUrl,
  renderDetailImage,
  renderPostImage,
} from "./post-media-render.mjs";

const currentDir = dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(join(currentDir, "index.html"), "utf8");
const appSource = readFileSync(join(currentDir, "app.mjs"), "utf8");

test("treats empty post image values as no image", () => {
  assert.equal(hasPostImage(null), false);
  assert.equal(hasPostImage(undefined), false);
  assert.equal(hasPostImage(""), false);
  assert.equal(hasPostImage("   "), false);
  assert.equal(hasPostImage("null"), false);
  assert.equal(hasPostImage("undefined"), false);
});

test("normalizes post image values before writes and renders", () => {
  assert.equal(normalizePostImageUrl(null), null);
  assert.equal(normalizePostImageUrl(""), null);
  assert.equal(normalizePostImageUrl("   "), null);
  assert.equal(normalizePostImageUrl("null"), null);
  assert.equal(normalizePostImageUrl("undefined"), null);
  assert.equal(normalizePostImageUrl(" https://example.com/post.png "), "https://example.com/post.png");
});

test("omits the feed image frame when a post has no image", () => {
  assert.equal(renderPostImage(null), "");
  assert.equal(renderPostImage("   "), "");
});

test("omits the detail image markup when a post has no image", () => {
  assert.equal(renderDetailImage(null, "No image post"), "");
  assert.equal(renderDetailImage("undefined", "No image post"), "");
});

test("renders escaped image markup when a post has an image", () => {
  const feedMarkup = renderPostImage('https://example.com/a"b.png');
  const detailMarkup = renderDetailImage("https://example.com/post.png", 'A "quoted" title');

  assert.match(feedMarkup, /class="post-image-placeholder"/);
  assert.match(feedMarkup, /src="https:\/\/example\.com\/a&quot;b\.png"/);
  assert.match(detailMarkup, /src="https:\/\/example\.com\/post\.png"/);
  assert.match(detailMarkup, /alt="A &quot;quoted&quot; title"/);
});

test("static shell does not show image placeholder frames for no-image posts", () => {
  assert.doesNotMatch(indexHtml, /<div class="post-image-placeholder"><span>[^<]*图片占位<\/span><\/div>/);
  assert.match(indexHtml, /<div id="detailMedia" class="detail-image-placeholder" hidden><\/div>/);
});

test("hidden detail media does not reserve the image frame", () => {
  assert.match(
    indexHtml,
    /\.detail-image-placeholder\[hidden\]\s*\{[^}]*display:\s*none[^}]*\}/s,
  );
});

test("runtime detail media uses normalized render helper instead of fallback placeholder markup", () => {
  assert.doesNotMatch(appSource, /els\.detailMedia\.innerHTML\s*=\s*post\.image_url/);
  assert.doesNotMatch(appSource, /暂无帖子图片|帖子图片占位|图片占位/);
  assert.match(appSource, /renderDetailImage\(post\.image_url,\s*post\.title\)/);
});
