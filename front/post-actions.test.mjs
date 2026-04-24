import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(join(currentDir, "app.mjs"), "utf8");

test("detail share action is wired to a post-specific share link", () => {
  assert.match(appSource, /data-action="share"/);
  assert.match(appSource, /querySelector\('\[data-action="share"\]'\)\?\.addEventListener\("click"/);
  assert.match(appSource, /function recordPostShare\(postId, shareTarget = "link"\)/);
  assert.match(appSource, /\.from\("post_shares"\)[\s\S]*?\.insert\(/);
  assert.match(appSource, /actor_profile_id:\s*state\.user\.id/);
  assert.match(appSource, /function shareCurrentPost\(\)/);
  assert.match(appSource, /function buildPostShareUrl\(postId\)/);
  assert.match(appSource, /url\.searchParams\.set\("post", postId\)/);
  assert.match(appSource, /navigator\.clipboard\.writeText/);
});

test("detail delete action is visible only to the author and deletes the post by id", () => {
  assert.match(appSource, /function canDeleteCurrentPost\(post\)/);
  assert.match(appSource, /post\.author_kind === "human"/);
  assert.match(appSource, /post\.author_profile_id === state\.user\.id/);
  assert.match(appSource, /data-action="delete-post"/);
  assert.match(appSource, /querySelector\('\[data-action="delete-post"\]'\)\?\.addEventListener\("click"/);
  assert.match(appSource, /function deleteCurrentPost\(\)/);
  assert.match(appSource, /\.from\("posts"\)[\s\S]*?\.delete\(\)[\s\S]*?\.eq\("id", postId\)/);
});

test("post market actions block human authors from staking on their own posts", () => {
  assert.match(appSource, /function isCurrentUserPostAuthor\(post\)/);
  assert.match(appSource, /post\.author_kind === "human" && post\.author_profile_id === state\.user\.id/);
  assert.match(appSource, /function getOwnPostMarketLockMessage\(\)/);
  assert.match(appSource, /isCurrentUserPostAuthor\(post\)[\s\S]*?getOwnPostMarketLockMessage\(\)/);
  assert.match(appSource, /submitPostBet\(\{ post, marketType, side, stakeAmount \}\)[\s\S]*?isCurrentUserPostAuthor\(post\)/);
});
