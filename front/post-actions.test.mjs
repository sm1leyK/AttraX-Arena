import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(join(currentDir, "app.mjs"), "utf8");
const htmlSource = readFileSync(join(currentDir, "index.html"), "utf8");

test("detail share action is wired to a post-specific share link", () => {
  assert.match(appSource, /data-action="share"/);
  assert.match(appSource, /querySelector\('\[data-action="share"\]'\)\?\.addEventListener\("click"/);
  assert.match(appSource, /function recordPostShare\(postId, shareTarget = "link"\)/);
  assert.match(appSource, /\.from\("post_shares"\)[\s\S]*?\.insert\(/);
  assert.match(appSource, /actor_profile_id:\s*state\.user\.id/);
  assert.match(appSource, /function shareCurrentPost\(\)/);
  assert.match(appSource, /function buildPostShareUrl\(postId\)/);
  assert.match(appSource, /buildPostRouteUrl\(window\.location\.href, postId\)/);
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

test("successful post delete returns to the homepage before profile refresh work", () => {
  const deleteFunction = appSource.match(/async function deleteCurrentPost\(\) \{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.match(deleteFunction, /navigate\("home"\)/);
  assert.ok(deleteFunction.indexOf('navigate("home")') < deleteFunction.indexOf("renderProfilePosts()"));
});

test("post market actions block human authors from staking on their own posts", () => {
  assert.match(appSource, /function isCurrentUserPostAuthor\(post\)/);
  assert.match(appSource, /post\.author_kind === "human" && post\.author_profile_id === state\.user\.id/);
  assert.match(appSource, /function getOwnPostMarketLockMessage\(\)/);
  assert.match(appSource, /isCurrentUserPostAuthor\(post\)[\s\S]*?getOwnPostMarketLockMessage\(\)/);
  assert.match(appSource, /submitPostBet\(\{ post, marketType, side, stakeAmount \}\)[\s\S]*?isCurrentUserPostAuthor\(post\)/);
});

test("post market bars prefer live support-board rates over prediction fallbacks", () => {
  assert.match(appSource, /import \{\s*resolvePostMarketRate,\s*\} from "\.\/post-market-rates\.mjs";/);
  assert.match(appSource, /function renderFeedPostMarket\(post\)[\s\S]*?findSupportBoardSignal\(state\.supportBoardItems, post\.id, marketType\)[\s\S]*?resolvePostMarketRate\(/);
  assert.match(appSource, /function renderDetailOdds\(\)[\s\S]*?detailSupportBoardItem[\s\S]*?resolvePostMarketRate\(/);
  assert.match(appSource, /style="width:\$\{marketRate\.yesWidth\}%">YES \$\{marketRate\.yesRate\}%/);
  assert.match(appSource, /style="width:\$\{marketRate\.noWidth\}%">NO \$\{marketRate\.noRate\}%/);
});

test("detail comment composer stays outside the rerendered comments list", () => {
  const listStart = htmlSource.indexOf('id="detailCommentsList"');
  const composerStart = htmlSource.indexOf('class="comment-input-wrap"');

  assert.ok(listStart > -1);
  assert.ok(composerStart > -1);
  assert.ok(composerStart > findClosingDivIndex(htmlSource, listStart));
  assert.match(appSource, /els\.detailCommentsList\.innerHTML = state\.detailComments/);
  assert.match(htmlSource, /<button class="comment-submit" type="button">/);
});

function findClosingDivIndex(source, openDivIndex) {
  const tagPattern = /<\/?div\b[^>]*>/gi;
  tagPattern.lastIndex = openDivIndex;
  let depth = 0;

  for (let match = tagPattern.exec(source); match; match = tagPattern.exec(source)) {
    if (match[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) {
        return match.index;
      }
      continue;
    }

    depth += 1;
  }

  return -1;
}
