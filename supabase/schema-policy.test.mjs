import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schemaSql = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
const postImageMigrationSql = readFileSync(
  new URL("./migrations/20260425_normalize_post_image_url.sql", import.meta.url),
  "utf8",
);
const supportTrendMigrationSql = readFileSync(
  new URL("./migrations/20260425_support_board_trend_rpc.sql", import.meta.url),
  "utf8",
);
const projectDeadlineMigrationSql = readFileSync(
  new URL("./migrations/20260425_project_submission_deadline_rpc.sql", import.meta.url),
  "utf8",
);
const featureFlagsMigrationSql = readFileSync(
  new URL("./migrations/20260425_app_feature_flags.sql", import.meta.url),
  "utf8",
);
const cookieConsentMigrationSql = readFileSync(
  new URL("./migrations/20260425_user_cookie_consents.sql", import.meta.url),
  "utf8",
);
const postActionsMigrationSql = readFileSync(
  new URL("./migrations/20260425_post_share_and_delete_actions.sql", import.meta.url),
  "utf8",
);
const ownPostMarketMigrationSql = readFileSync(
  new URL("./migrations/20260425_block_own_post_market_bets.sql", import.meta.url),
  "utf8",
);

function extractSqlFunction(functionName) {
  const match = schemaSql.match(
    new RegExp(`create or replace function public\\.${functionName}\\([\\s\\S]*?\\n\\$\\$;`),
  );

  assert.ok(match, `Expected to find public.${functionName} in schema.sql`);
  return match[0];
}

test("post market bets cannot be inserted directly by browser clients", () => {
  assert.doesNotMatch(
    schemaSql,
    /create policy "Authenticated users can create their own post market bets"[\s\S]*?with check \(profile_id = auth\.uid\(\)\);/,
  );
  assert.match(
    schemaSql,
    /create policy "Post market bets are inserted through place_post_bet"[\s\S]*?with check \(false\);/,
  );
});

test("place_post_bet rejects opposite-side switches but permits same-side add-ons", () => {
  const placePostBetSql = extractSqlFunction("place_post_bet");

  assert.match(placePostBetSql, /pg_advisory_xact_lock/);
  assert.match(
    placePostBetSql,
    /from public\.post_market_bets pmb[\s\S]*pmb\.post_id = p_post_id[\s\S]*pmb\.market_type = p_market_type[\s\S]*pmb\.profile_id = auth\.uid\(\)[\s\S]*pmb\.side <> p_side/,
  );
  assert.match(placePostBetSql, /already joined % side for this market/);
  assert.doesNotMatch(placePostBetSql, /pmb\.side = p_side[\s\S]*raise exception/);
});

test("place_post_bet rejects authors from joining their own post market", () => {
  const placePostBetSql = extractSqlFunction("place_post_bet");

  assert.match(placePostBetSql, /p\.author_kind/);
  assert.match(placePostBetSql, /p\.author_profile_id/);
  assert.match(placePostBetSql, /p\.author_agent_id/);
  assert.match(
    placePostBetSql,
    /v_author_kind = 'human'[\s\S]*v_author_profile_id = auth\.uid\(\)[\s\S]*raise exception 'post authors cannot join their own market'/,
  );
  assert.match(
    placePostBetSql,
    /v_author_kind = 'agent'[\s\S]*public\.user_owns_agent\(v_author_agent_id, auth\.uid\(\)\)[\s\S]*raise exception 'post authors cannot join their own market'/,
  );
});

test("own-post market block migration can be applied to live Supabase", () => {
  assert.match(ownPostMarketMigrationSql, /create or replace function public\.place_post_bet\(/i);
  assert.match(ownPostMarketMigrationSql, /p\.author_kind/i);
  assert.match(ownPostMarketMigrationSql, /p\.author_profile_id/i);
  assert.match(ownPostMarketMigrationSql, /p\.author_agent_id/i);
  assert.match(ownPostMarketMigrationSql, /post authors cannot join their own market/i);
  assert.match(ownPostMarketMigrationSql, /public\.user_owns_agent\(v_author_agent_id, auth\.uid\(\)\)/i);
});

test("post market bets cannot be owner-deleted to switch sides", () => {
  assert.doesNotMatch(
    schemaSql,
    /create policy "Owners can delete their own post market bets"[\s\S]*?profile_id = auth\.uid\(\)/,
  );
  assert.match(
    schemaSql,
    /create policy "Admins can delete post market bets"[\s\S]*?on public\.post_market_bets[\s\S]*?for delete[\s\S]*?using \(public\.is_admin\(auth\.uid\(\)\)\);/,
  );
});

test("post shares are recorded as append-only authenticated events", () => {
  const feedPostsViewSql = schemaSql.match(/create view public\.feed_posts[\s\S]*?left join prediction_stats ps on ps\.post_id = p\.id;/)?.[0] ?? "";
  const insertPolicySql = schemaSql.match(
    /create policy "Authenticated users can record post shares"[\s\S]*?;\r?\n/i,
  )?.[0] ?? "";

  assert.match(schemaSql, /create table if not exists public\.post_shares/i);
  assert.match(schemaSql, /post_id uuid not null references public\.posts \(id\) on delete cascade/i);
  assert.match(schemaSql, /actor_profile_id uuid not null references public\.profiles \(id\) on delete cascade/i);
  assert.match(schemaSql, /share_target text not null default 'link'/i);
  assert.match(schemaSql, /constraint post_shares_target_length check \(char_length\(trim\(share_target\)\) between 1 and 40\)/i);
  assert.match(schemaSql, /create index if not exists post_shares_post_id_idx[\s\S]*?on public\.post_shares \(post_id\)/i);
  assert.match(schemaSql, /alter table public\.post_shares enable row level security;/i);
  assert.match(
    insertPolicySql,
    /on public\.post_shares[\s\S]*?for insert[\s\S]*?with check \(\s*actor_profile_id = auth\.uid\(\)\s*\);/i,
  );
  assert.doesNotMatch(schemaSql, /create policy "Users can delete their own post shares"/i);
  assert.match(feedPostsViewSql, /share_stats as \([\s\S]*?from public\.post_shares/i);
  assert.match(feedPostsViewSql, /coalesce\(ss\.share_count, 0\) as share_count/i);
});

test("post delete and share migration can be applied to live Supabase", () => {
  assert.match(postActionsMigrationSql, /create table if not exists public\.post_shares/i);
  assert.match(postActionsMigrationSql, /alter table public\.post_shares enable row level security;/i);
  assert.match(postActionsMigrationSql, /create policy "Authenticated users can record post shares"/i);
  assert.match(postActionsMigrationSql, /create policy "Authors can delete their own posts"/i);
  assert.match(postActionsMigrationSql, /create or replace view public\.feed_posts/i);
  assert.match(postActionsMigrationSql, /coalesce\(ss\.share_count, 0\) as share_count/i);
});

test("support board exposes a public realtime event stream", () => {
  assert.match(schemaSql, /create table if not exists public\.support_board_events/);
  assert.match(schemaSql, /alter table public\.support_board_events enable row level security;/);
  assert.match(
    schemaSql,
    /create policy "Support board events are viewable by everyone"[\s\S]*?on public\.support_board_events[\s\S]*?for select[\s\S]*?using \(true\);/,
  );
  assert.match(schemaSql, /alter publication supabase_realtime add table public\.support_board_events;/);
  assert.match(schemaSql, /create trigger emit_support_board_event_after_bet/);
  assert.match(schemaSql, /create trigger emit_support_board_event_after_post_update/);
  assert.doesNotMatch(schemaSql, /alter publication supabase_realtime add table public\.post_market_bets;/);
});

test("support board trend RPCs expose cumulative stance data to browser clients", () => {
  const marketSeriesSql = extractSqlFunction("get_post_market_series");
  const homepageBoardSql = extractSqlFunction("get_homepage_support_board");

  assert.match(marketSeriesSql, /total_amount_cumulative bigint/);
  assert.match(marketSeriesSql, /sample_count_cumulative integer/);
  assert.match(marketSeriesSql, /generate_series\(/);
  assert.match(marketSeriesSql, /sum\(f\.total_amount_bucket\) over w/);
  assert.match(homepageBoardSql, /total_amount_total bigint/);
  assert.match(homepageBoardSql, /latest_bet_at timestamptz/);
  assert.match(
    schemaSql,
    /grant execute on function public\.get_post_market_series\(uuid, text, integer, integer\) to anon, authenticated;/i,
  );
  assert.match(
    schemaSql,
    /grant execute on function public\.get_homepage_support_board\(text, integer, integer, integer\) to anon, authenticated;/i,
  );
});

test("support board trend migration can be applied to live Supabase", () => {
  assert.match(supportTrendMigrationSql, /create or replace function public\.get_post_market_series\(/i);
  assert.match(supportTrendMigrationSql, /total_amount_cumulative bigint/i);
  assert.match(supportTrendMigrationSql, /sample_count_cumulative integer/i);
  assert.match(supportTrendMigrationSql, /create or replace function public\.get_homepage_support_board\(/i);
  assert.match(
    supportTrendMigrationSql,
    /grant execute on function public\.get_post_market_series\(uuid, text, integer, integer\) to anon, authenticated;/i,
  );
  assert.match(
    supportTrendMigrationSql,
    /grant execute on function public\.get_homepage_support_board\(text, integer, integer, integer\) to anon, authenticated;/i,
  );
});

test("app feature flags disable leaderboard and activity by default", () => {
  assert.match(schemaSql, /create table if not exists public\.app_feature_flags/i);
  assert.match(schemaSql, /feature_key text primary key/i);
  assert.match(schemaSql, /enabled boolean not null default false/i);
  assert.match(schemaSql, /alter table public\.app_feature_flags enable row level security;/i);
  assert.match(
    schemaSql,
    /create policy "App feature flags are viewable by everyone"[\s\S]*?on public\.app_feature_flags[\s\S]*?for select[\s\S]*?using \(true\);/i,
  );
  assert.match(schemaSql, /\('leaderboard', false, '排行榜',/i);
  assert.match(schemaSql, /\('activity', false, '活动',/i);
  assert.match(
    schemaSql,
    /on conflict \(feature_key\) do update\s+set[\s\S]*?enabled = excluded\.enabled[\s\S]*?description = excluded\.description;/i,
  );
  assert.match(schemaSql, /create or replace function public\.get_app_feature_flags\(\)/i);
  assert.match(
    schemaSql,
    /grant execute on function public\.get_app_feature_flags\(\) to anon, authenticated;/i,
  );
});

test("app feature flags migration can be applied to live Supabase", () => {
  assert.match(featureFlagsMigrationSql, /create table if not exists public\.app_feature_flags/i);
  assert.match(featureFlagsMigrationSql, /create or replace function public\.get_app_feature_flags\(\)/i);
  assert.match(featureFlagsMigrationSql, /\('leaderboard', false, '排行榜',/i);
  assert.match(featureFlagsMigrationSql, /\('activity', false, '活动',/i);
  assert.match(
    featureFlagsMigrationSql,
    /on conflict \(feature_key\) do update\s+set[\s\S]*?enabled = excluded\.enabled[\s\S]*?description = excluded\.description;/i,
  );
  assert.match(
    featureFlagsMigrationSql,
    /grant execute on function public\.get_app_feature_flags\(\) to anon, authenticated;/i,
  );
});

test("cookie consent preferences are stored per authenticated profile", () => {
  const viewPolicySql = schemaSql.match(
    /create policy "Users can view their own cookie consent"[\s\S]*?;\r?\n/i,
  )?.[0] ?? "";
  const insertPolicySql = schemaSql.match(
    /create policy "Users can upsert their own cookie consent"[\s\S]*?;\r?\n/i,
  )?.[0] ?? "";
  const updatePolicySql = schemaSql.match(
    /create policy "Users can update their own cookie consent"[\s\S]*?;\r?\n/i,
  )?.[0] ?? "";

  assert.match(schemaSql, /create table if not exists public\.user_cookie_consents/i);
  assert.match(schemaSql, /profile_id uuid primary key references public\.profiles \(id\) on delete cascade/i);
  assert.match(schemaSql, /necessary boolean not null default true/i);
  assert.match(schemaSql, /constraint user_cookie_consents_necessary_required check \(necessary is true\)/i);
  assert.match(schemaSql, /last_decision text not null default 'custom'/i);
  assert.match(schemaSql, /alter table public\.user_cookie_consents enable row level security;/i);
  assert.doesNotMatch(viewPolicySql, /using \(true\)/i);
  assert.match(
    viewPolicySql,
    /on public\.user_cookie_consents[\s\S]*?for select[\s\S]*?using \(\s*profile_id = auth\.uid\(\)[\s\S]*?or public\.is_admin\(auth\.uid\(\)\)\s*\);/i,
  );
  assert.match(
    insertPolicySql,
    /on public\.user_cookie_consents[\s\S]*?for insert[\s\S]*?with check \(\s*profile_id = auth\.uid\(\)\s*\);/i,
  );
  assert.match(
    updatePolicySql,
    /on public\.user_cookie_consents[\s\S]*?for update[\s\S]*?using \(\s*profile_id = auth\.uid\(\)[\s\S]*?\)[\s\S]*?with check \(\s*profile_id = auth\.uid\(\)\s*\);/i,
  );
});

test("cookie consent migration can be applied to live Supabase", () => {
  assert.match(cookieConsentMigrationSql, /create table if not exists public\.user_cookie_consents/i);
  assert.match(cookieConsentMigrationSql, /alter table public\.user_cookie_consents enable row level security;/i);
  assert.match(cookieConsentMigrationSql, /create policy "Users can view their own cookie consent"/i);
  assert.match(cookieConsentMigrationSql, /create policy "Users can upsert their own cookie consent"/i);
  assert.match(cookieConsentMigrationSql, /create policy "Users can update their own cookie consent"/i);
});

test("project submission deadline is exposed through a public backend RPC", () => {
  const deadlineSql = extractSqlFunction("get_project_submission_deadline");

  assert.match(deadlineSql, /deadline_at timestamptz/i);
  assert.match(deadlineSql, /'2026-04-25T16:00:00\.000Z'::timestamptz/i);
  assert.match(deadlineSql, /'2026-04-26T00:00:00\+08:00'::text/i);
  assert.match(deadlineSql, /'2026年4月25日24时'::text/i);
  assert.match(
    schemaSql,
    /grant execute on function public\.get_project_submission_deadline\(\) to anon, authenticated;/i,
  );
});

test("project submission deadline migration can be applied to live Supabase", () => {
  assert.match(projectDeadlineMigrationSql, /create or replace function public\.get_project_submission_deadline\(/i);
  assert.match(projectDeadlineMigrationSql, /deadline_at timestamptz/i);
  assert.match(projectDeadlineMigrationSql, /'2026-04-25T16:00:00\.000Z'::timestamptz/i);
  assert.match(
    projectDeadlineMigrationSql,
    /grant execute on function public\.get_project_submission_deadline\(\) to anon, authenticated;/i,
  );
});

test("publication cleanup uses valid postgres syntax", () => {
  assert.doesNotMatch(schemaSql, /alter publication \w+ drop table if exists/i);
});

test("post image URLs are normalized at write time and in feed views", () => {
  const normalizeImageSql = extractSqlFunction("normalize_post_image_url");
  const normalizePostSql = extractSqlFunction("normalize_post_image_fields");
  const feedPostsViewSql = schemaSql.match(/create view public\.feed_posts[\s\S]*?left join prediction_stats ps on ps\.post_id = p\.id;/)?.[0] ?? "";

  assert.match(normalizeImageSql, /nullif\(trim\(p_image_url\), ''\)/i);
  assert.match(normalizeImageSql, /lower\(normalized\) in \('null', 'undefined'\)/i);
  assert.match(normalizePostSql, /new\.image_url := public\.normalize_post_image_url\(new\.image_url\);/i);
  assert.match(
    schemaSql,
    /create trigger normalize_post_image_fields[\s\S]*?before insert or update of image_url on public\.posts[\s\S]*?execute function public\.normalize_post_image_fields\(\);/i,
  );
  assert.match(schemaSql, /update public\.posts[\s\S]*?set image_url = public\.normalize_post_image_url\(image_url\)[\s\S]*?where image_url is not null/i);
  assert.match(feedPostsViewSql, /public\.normalize_post_image_url\(p\.image_url\) as image_url/i);
});

test("post image normalization migration can be applied to live Supabase", () => {
  assert.match(postImageMigrationSql, /create or replace function public\.normalize_post_image_url/);
  assert.match(postImageMigrationSql, /create or replace function public\.normalize_post_image_fields/);
  assert.match(postImageMigrationSql, /create trigger normalize_post_image_fields/);
  assert.match(postImageMigrationSql, /update public\.posts[\s\S]*set image_url = public\.normalize_post_image_url\(image_url\)/i);
  assert.match(postImageMigrationSql, /create or replace view public\.feed_posts/);
  assert.match(postImageMigrationSql, /public\.normalize_post_image_url\(p\.image_url\) as image_url/i);
});

test("agent search fallback string is valid SQL text", () => {
  assert.doesNotMatch(schemaSql, /coalesce\(a\.bio, a\.disclosure, '[^']*�[^']*/);
  assert.match(
    schemaSql,
    /coalesce\(a\.bio, a\.disclosure, 'Open this AI Agent profile to view related posts\.'\), '\\s\+', ' ', 'g'\)/,
  );
});
