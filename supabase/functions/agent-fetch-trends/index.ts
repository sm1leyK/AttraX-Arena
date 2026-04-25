// agent-fetch-trends: Producer Edge Function
// Triggered hourly by pg_cron. Crawls hot topics from Weibo, Zhihu, GitHub, Hacker News,
// enqueues auto_post tasks into agent_task_queue, then triggers agent-auto-post consumer.

type JsonRecord = Record<string, unknown>;

const MAX_QUEUE_SIZE = 20;
const MIN_TOPICS = 3;
const MAX_TOPICS = 5;
const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };

interface TopicItem {
  source: string;
  topic: string;
  summary: string;
  url: string;
}

interface SupabaseConfig {
  url: string;
  serviceRoleKey: string;
  runnerSecret: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200 });
  }

  try {
    authorizeRunner(req);

    const config = readConfig();
    console.log("[fetch-trends] Starting hourly trend crawl...");

    // Check feature flag
    const enabled = await checkFeatureFlag(config);
    if (!enabled) {
      console.log("[fetch-trends] agent_auto_post feature flag is OFF, skipping.");
      return jsonResponse({ ok: true, skipped: true, reason: "feature_flag_off" }, 200);
    }

    // Check queue length
    const pendingCount = await getPendingCount(config);
    if (pendingCount >= MAX_QUEUE_SIZE) {
      console.log(`[fetch-trends] Queue full (${pendingCount}/${MAX_QUEUE_SIZE}), skipping.`);
      return jsonResponse({ ok: true, skipped: true, reason: "queue_full", pending_count: pendingCount }, 200);
    }

    // Add random delay (0-5 min) to avoid predictable patterns
    const delayMs = Math.floor(Math.random() * 5 * 60 * 1000);
    if (delayMs > 0) {
      console.log(`[fetch-trends] Random delay: ${Math.round(delayMs / 1000)}s`);
      await sleep(delayMs);
    }

    // Crawl all sources in parallel
    const [weiboTopics, zhihuTopics, githubTopics, hnTopics] = await Promise.allSettled([
      crawlWeiboHot(),
      crawlZhihuHot(),
      crawlGithubTrending(),
      crawlHackerNews(),
    ]);

    const allTopics: TopicItem[] = [];

    for (const result of [weiboTopics, zhihuTopics, githubTopics, hnTopics]) {
      if (result.status === "fulfilled" && result.value.length > 0) {
        allTopics.push(...result.value);
      } else if (result.status === "rejected") {
        console.error("[fetch-trends] Source failed:", result.reason);
      }
    }

    if (allTopics.length === 0) {
      console.log("[fetch-trends] No topics crawled, skipping.");
      return jsonResponse({ ok: true, skipped: true, reason: "no_topics" }, 200);
    }

    // Randomly select topics
    const selectedCount = Math.min(
      MIN_TOPICS + Math.floor(Math.random() * (MAX_TOPICS - MIN_TOPICS + 1)),
      allTopics.length,
    );
    const selectedTopics = shuffleArray(allTopics).slice(0, selectedCount);

    // Enqueue tasks
    let enqueued = 0;
    for (const topic of selectedTopics) {
      const currentPending = await getPendingCount(config);
      if (currentPending >= MAX_QUEUE_SIZE) break;

      await enqueueTask(config, {
        task_type: "auto_post",
        payload: {
          source: topic.source,
          topic: topic.topic,
          summary: topic.summary,
          url: topic.url,
        },
      });
      enqueued++;
    }

    console.log(`[fetch-trends] Enqueued ${enqueued} tasks.`);

    // Trigger consumer if tasks were enqueued
    if (enqueued > 0) {
      await triggerConsumer(config);
    }

    return jsonResponse({
      ok: true,
      topics_crawled: allTopics.length,
      tasks_enqueued: enqueued,
      sources: {
        weibo: weiboTopics.status === "fulfilled" ? weiboTopics.value.length : 0,
        zhihu: zhihuTopics.status === "fulfilled" ? zhihuTopics.value.length : 0,
        github: githubTopics.status === "fulfilled" ? githubTopics.value.length : 0,
        hn: hnTopics.status === "fulfilled" ? hnTopics.value.length : 0,
      },
    }, 201);
  } catch (error) {
    console.error("[fetch-trends] Fatal error:", error);
    return jsonResponse({
      ok: false,
      error: "internal_error",
      message: error instanceof Error ? error.message : "Unknown error",
    }, 500);
  }
});

// ── Config ──

function readConfig(): SupabaseConfig {
  const url = env("SUPABASE_URL") ?? env("NEXT_PUBLIC_SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const secret = env("AGENT_RUNNER_SECRET");

  if (!url || !key || !secret) {
    throw new Error("Missing required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AGENT_RUNNER_SECRET");
  }

  return { url, serviceRoleKey: key, runnerSecret: secret };
}

function env(name: string): string | undefined {
  return Deno.env.get(name)?.trim() || undefined;
}

function authorizeRunner(req: Request): void {
  const secret = env("AGENT_RUNNER_SECRET");
  if (!secret) throw new Error("AGENT_RUNNER_SECRET not set");

  const provided = req.headers.get("x-agent-runner-secret")?.trim()
    || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();

  if (!provided || provided !== secret) {
    throw new Error("Unauthorized");
  }
}

// ── Feature Flag ──

async function checkFeatureFlag(config: SupabaseConfig): Promise<boolean> {
  const url = buildRestUrl(config, "app_feature_flags", {
    select: "enabled",
    feature_key: "eq.agent_auto_post",
    limit: "1",
  });

  const resp = await fetch(url, {
    headers: supabaseHeaders(config),
  });

  const rows = await resp.json();
  return Array.isArray(rows) && rows.length > 0 && rows[0].enabled === true;
}

// ── Queue Operations ──

async function getPendingCount(config: SupabaseConfig): Promise<number> {
  const url = buildRestUrl(config, "agent_task_queue", {
    select: "id",
    status: "eq.pending",
    limit: "0",
  });

  // Use prefer: count=exact header
  const resp = await fetch(url, {
    headers: {
      ...supabaseHeaders(config),
      Prefer: "count=exact",
    },
  });

  const contentRange = resp.headers.get("content-range");
  if (contentRange) {
    const parts = contentRange.split("/");
    return parseInt(parts[1] || "0", 10);
  }

  // Fallback: count in JS
  const rows = await resp.json();
  return Array.isArray(rows) ? rows.length : 0;
}

async function enqueueTask(config: SupabaseConfig, task: { task_type: string; payload: JsonRecord }): Promise<void> {
  const url = buildRestUrl(config, "agent_task_queue", { select: "*" });

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      ...supabaseHeaders(config),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(task),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error("[fetch-trends] enqueue failed:", resp.status, err);
  }
}

async function triggerConsumer(config: SupabaseConfig): Promise<void> {
  const consumerUrl = `${config.url}/functions/v1/agent-auto-post`;

  try {
    await fetch(consumerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-agent-runner-secret": config.runnerSecret,
      },
      body: JSON.stringify({ trigger: "fetch_trends" }),
    });
  } catch (err) {
    console.error("[fetch-trends] Failed to trigger consumer:", err);
  }
}

// ── Trend Crawlers ──

async function crawlWeiboHot(): Promise<TopicItem[]> {
  try {
    const resp = await fetch("https://weibo.com/ajax/side/hotSearch", {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) return [];

    const data = await resp.json();
    const realtime = data?.data?.realtime;
    if (!Array.isArray(realtime)) return [];

    return realtime
      .filter((item: JsonRecord) => item.word && typeof item.word === "string")
      .slice(0, 10)
      .map((item: JsonRecord) => ({
        source: "weibo",
        topic: (item.word as string).trim(),
        summary: (item.note as string) || (item.word as string).trim(),
        url: `https://s.weibo.com/weibo?q=${encodeURIComponent(item.word as string)}`,
      }));
  } catch {
    return [];
  }
}

async function crawlZhihuHot(): Promise<TopicItem[]> {
  try {
    const resp = await fetch("https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=10", {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) return [];

    const data = await resp.json();
    const items = data?.data;
    if (!Array.isArray(items)) return [];

    return items
      .filter((item: JsonRecord) => item.target?.title)
      .slice(0, 10)
      .map((item: JsonRecord) => {
        const target = item.target as JsonRecord;
        return {
          source: "zhihu",
          topic: (target.title as string).trim(),
          summary: ((target.excerpt as string) || (target.title as string)).trim().slice(0, 200),
          url: (target.url as string) || `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(target.title as string)}`,
        };
      });
  } catch {
    return [];
  }
}

async function crawlGithubTrending(): Promise<TopicItem[]> {
  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const resp = await fetch(
      `https://api.github.com/search/repositories?q=stars:>1000+pushed:>${oneWeekAgo}&sort=stars&order=desc&per_page=10`,
      {
        headers: {
          "Accept": "application/vnd.github.v3+json",
          "User-Agent": "AttraX-Bot/1.0",
        },
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!resp.ok) return [];

    const data = await resp.json();
    const items = data?.items;
    if (!Array.isArray(items)) return [];

    return items
      .filter((repo: JsonRecord) => repo.full_name && repo.description)
      .slice(0, 10)
      .map((repo: JsonRecord) => ({
        source: "github",
        topic: `${repo.full_name} (${repo.stargazers_count} stars)`,
        summary: (repo.description as string).slice(0, 200),
        url: (repo.html_url as string) || `https://github.com/${repo.full_name}`,
      }));
  } catch {
    return [];
  }
}

async function crawlHackerNews(): Promise<TopicItem[]> {
  try {
    const topResp = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json", {
      signal: AbortSignal.timeout(10000),
    });

    if (!topResp.ok) return [];

    const ids: number[] = await topResp.json();
    const topIds = ids.slice(0, 5);

    const stories = await Promise.allSettled(
      topIds.map((id) =>
        fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
          signal: AbortSignal.timeout(8000),
        }).then((r) => r.json())
      ),
    );

    const topics: TopicItem[] = [];
    for (const result of stories) {
      if (result.status === "fulfilled" && result.value?.title) {
        const s = result.value;
        topics.push({
          source: "hackernews",
          topic: (s.title as string).trim(),
          summary: ((s.title as string) + (s.score ? ` (${s.score} points)` : "")).trim(),
          url: (s.url as string) || `https://news.ycombinator.com/item?id=${s.id}`,
        });
      }
    }

    return topics;
  } catch {
    return [];
  }
}

// ── Helpers ──

function buildRestUrl(config: SupabaseConfig, resource: string, params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  return `${config.url}/rest/v1/${resource}?${qs}`;
}

function supabaseHeaders(config: SupabaseConfig): Record<string, string> {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
  };
}

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsonResponse(body: JsonRecord, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}
