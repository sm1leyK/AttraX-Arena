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

test("new support-board posts default their deadline to the latest allowed time", () => {
  assert.match(appSource, /deadlineInput\.max = SUPPORT_BOARD_MAX_DEADLINE_LOCAL/);
  assert.match(appSource, /deadlineInput\.value = SUPPORT_BOARD_MAX_DEADLINE_LOCAL/);
});

test("support-board fallback cards inherit post deadline state for status filters", () => {
  assert.match(appSource, /const supportPostById = new Map\(\s*state\.posts\.map\(\(post\) => \[post\.id, post\]\),\s*\);/);
  assert.match(appSource, /support_board_deadline_at:\s*item\.support_board_deadline_at\s*\?\?\s*matchedPost\?\.support_board_deadline_at\s*\?\?\s*matchedPost\?\.deadline_at\s*\?\?\s*null/);
  assert.match(appSource, /support_board_result:\s*item\.support_board_result\s*\?\?\s*matchedPost\?\.support_board_result\s*\?\?\s*null/);
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

test("detail comment action focuses the composer and Enter submits without blocking Shift Enter newlines", () => {
  assert.match(appSource, /data-action="comment"/);
  assert.match(appSource, /querySelector\('\[data-action="comment"\]'\)\?\.addEventListener\("click"/);
  assert.match(appSource, /els\.commentInput\?\.scrollIntoView\(\{ block: "center" \}\)/);
  assert.match(appSource, /els\.commentInput\?\.focus\(\)/);
  assert.match(appSource, /els\.commentInput\?\.addEventListener\("keydown", \(event\) => \{/);
  assert.match(appSource, /event\.key === "Enter" && !event\.shiftKey/);
  assert.match(appSource, /event\.preventDefault\(\);[\s\S]*?void submitComment\(\)/);
});

test("detail comments render like reply and share actions without backend-only assumptions", () => {
  assert.match(appSource, /COMMENT_INTERACTIONS_STORAGE_KEY/);
  assert.match(appSource, /data-action="comment-like"/);
  assert.match(appSource, /data-action="comment-reply"/);
  assert.match(appSource, /data-action="comment-share"/);
  assert.match(appSource, /function toggleCommentLike\(commentId\)/);
  assert.match(appSource, /window\.localStorage\.setItem\(COMMENT_INTERACTIONS_STORAGE_KEY/);
  assert.match(appSource, /function startCommentReply\(comment\)/);
  assert.match(appSource, /els\.commentInput\.value = `@\$\{comment\.author_name \|\| "Unknown"\} `/);
  assert.match(appSource, /function shareComment\(commentId\)/);
  assert.match(appSource, /buildCommentShareUrl\(commentId\)/);
  assert.match(appSource, /navigator\.clipboard\.writeText\(url\)/);
});

test("agent mentions are wired from the comment composer to backend agent handles", () => {
  assert.match(htmlSource, /id="mention-autocomplete"/);
  assert.match(appSource, /agentHandles:\s*\[\]/);
  assert.match(appSource, /\.from\("agents"\)\s*[\s\S]*?\.select\("id,handle,display_name,kind,is_active"\)/);
  assert.match(appSource, /function highlightMentions\(html\)/);
  assert.match(appSource, /highlightMentions\(escapeHtml\(comment\.content\)\)/);
});

test("agent admin dashboard routes through the server-side RPC", () => {
  assert.match(htmlSource, /id="page-agents"/);
  assert.match(htmlSource, /id="agent-toggle-btn"/);
  assert.match(appSource, /if \(page === "agents"\)[\s\S]*?loadAgentDashboard\(\)/);
  assert.match(appSource, /\.rpc\("get_agent_dashboard", \{ p_limit: 20, p_offset: 0 \}\)/);
  assert.match(appSource, /\.from\("app_feature_flags"\)[\s\S]*?\.eq\("feature_key", "agent_auto_reply"\)/);
});

test("create post image picker shows an image preview instead of the file name", () => {
  assert.match(htmlSource, /id="createUploadArea"/);
  assert.match(htmlSource, /\.create-upload-area\.has-preview/);
  assert.match(appSource, /function setCreateImagePreview\(file\)/);
  assert.match(appSource, /URL\.createObjectURL\(file\)/);
  assert.match(appSource, /els\.createUploadArea\.style\.backgroundImage = `url\("\$\{state\.createImagePreviewUrl\}"\)`/);
  assert.match(appSource, /els\.createUploadArea\.classList\.add\("has-preview"\)/);
  assert.match(appSource, /els\.createUploadArea\?\.addEventListener\("drop"/);
  assert.doesNotMatch(appSource, /createUploadLabel\.textContent = state\.createImageFile[\s\S]*?createImageFile\.name/);
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
