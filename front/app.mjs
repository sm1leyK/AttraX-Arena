import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import {
  STORAGE_BUCKET,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
} from "./supabase-config.mjs";

const state = {
  supabase: null,
  session: null,
  user: null,
  profile: null,
  posts: [],
  hotPosts: [],
  activeActors: [],
  chaosPosts: [],
  predictionCards: [],
  detailComments: [],
  detailPredictions: [],
  detailPostId: null,
  currentDetailPost: null,
  currentLikeId: null,
  feedMode: "latest",
  leaderboardTab: "热帖榜",
  leaderboardTime: "今日",
  isLogin: true,
  createImageFile: null,
};

const els = {
  feedPosts: document.getElementById("feedPosts"),
  homeHotPostsCard: document.getElementById("homeHotPostsCard"),
  homeActiveActorsCard: document.getElementById("homeActiveActorsCard"),
  homePredictionCard: document.getElementById("homePredictionCard"),
  detailTags: document.getElementById("detailTags"),
  detailTitle: document.getElementById("detailTitle"),
  detailAuthorRow: document.getElementById("detailAuthorRow"),
  detailMedia: document.getElementById("detailMedia"),
  detailContent: document.getElementById("detailContent"),
  detailActions: document.getElementById("detailActions"),
  detailOddsModule: document.getElementById("detailOddsModule"),
  detailCommentsTitle: document.getElementById("detailCommentsTitle"),
  detailCommentsList: document.getElementById("detailCommentsList"),
  commentInput: document.getElementById("commentInput"),
  commentSubmit: document.getElementById("commentSubmit"),
  createTitleInput: document.getElementById("createTitleInput"),
  createBodyInput: document.getElementById("createBodyInput"),
  createUploadArea: document.getElementById("createUploadArea"),
  createUploadLabel: document.getElementById("createUploadLabel"),
  createImageInput: document.getElementById("createImageInput"),
  publishButton: document.getElementById("publishButton"),
  authTitle: document.getElementById("auth-title"),
  authSubtitle: document.getElementById("auth-subtitle"),
  authHelp: document.getElementById("auth-help"),
  authPrimaryLabel: document.getElementById("auth-primary-label"),
  authPrimaryInput: document.getElementById("auth-primary-input"),
  authEmailField: document.getElementById("auth-email-field"),
  authEmailInput: document.getElementById("auth-email-input"),
  authPasswordInput: document.getElementById("auth-password-input"),
  authButton: document.getElementById("auth-btn"),
  authStatus: document.getElementById("auth-status"),
  authSwitch: document.getElementById("auth-switch"),
  createStatus: document.getElementById("create-status"),
  commentStatus: document.getElementById("comment-status"),
  lbTable: document.getElementById("lbTable"),
  modal: document.getElementById("activityModal"),
  preview: document.getElementById("userPreview"),
  previewName: document.getElementById("previewName"),
  previewPosts: document.getElementById("pvPosts"),
  previewLikes: document.getElementById("pvLikes"),
  previewStreak: document.getElementById("pvStreak"),
};

const navLoginButton = document.querySelector(".btn-login");
const navAvatar = document.querySelector(".user-avatar");
const profilePostsContainer = document.getElementById("profilePostList");
const configReady = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && /^https?:\/\//.test(SUPABASE_URL));

init();

function init() {
  initSplash();
  initCursorGlow();
  initGlobals();
  initStaticInteractions();
  renderAuthMode();
  updateAuthUi();

  if (!configReady) {
    console.warn("Supabase config missing. Fill front/supabase-config.mjs to enable live data.");
    return;
  }

  state.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  void bootstrapData();
}

async function bootstrapData() {
  await refreshSession();

  state.supabase.auth.onAuthStateChange((_event, session) => {
    state.session = session;
    state.user = session?.user ?? null;
    void handleAuthChange();
  });

  await Promise.allSettled([
    loadHomepageData(),
    loadLeaderboardData(),
  ]);

  if (!state.detailPostId && state.posts.length > 0) {
    state.detailPostId = state.posts[0].id;
  }

  if (state.detailPostId) {
    await loadDetailData(state.detailPostId);
  }
}

async function handleAuthChange() {
  await loadProfile();
  updateAuthUi();
  await renderProfilePosts();

  if (state.detailPostId) {
    await syncCurrentLikeState(state.detailPostId);
    renderDetailActions();
  }
}

async function refreshSession() {
  const {
    data: { session },
  } = await state.supabase.auth.getSession();

  state.session = session;
  state.user = session?.user ?? null;
  await loadProfile();
  updateAuthUi();
  await renderProfilePosts();
}

async function loadProfile() {
  state.profile = null;

  if (!state.user) {
    return;
  }

  const { data, error } = await state.supabase
    .from("profiles")
    .select("id, username, avatar_url")
    .eq("id", state.user.id)
    .maybeSingle();

  if (!error) {
    state.profile = data;
  }
}

async function loadHomepageData() {
  const [postsResult, hotResult, activeResult, predictionResult] = await Promise.all([
    state.supabase.from("feed_posts").select("*").order("created_at", { ascending: false }),
    state.supabase.from("hot_posts_rankings").select("*").order("rank_position", { ascending: true }).limit(8),
    state.supabase.from("active_actor_rankings").select("*").order("rank_position", { ascending: true }).limit(8),
    state.supabase.from("post_prediction_cards").select("*").order("created_at", { ascending: false }).limit(8),
  ]);

  if (!postsResult.error) {
    state.posts = postsResult.data ?? [];
    if (!state.detailPostId && state.posts[0]) {
      state.detailPostId = state.posts[0].id;
    }
  }

  if (!hotResult.error) {
    state.hotPosts = hotResult.data ?? [];
  }

  if (!activeResult.error) {
    state.activeActors = activeResult.data ?? [];
  }

  if (!predictionResult.error) {
    state.predictionCards = predictionResult.data ?? [];
  }

  renderFeed();
  renderHomeHotPosts();
  renderHomeActiveActors();
  renderHomePredictions();
}

async function loadLeaderboardData() {
  const chaosResult = await state.supabase
    .from("weekly_chaos_rankings")
    .select("*")
    .order("rank_position", { ascending: true })
    .limit(8);

  if (!chaosResult.error) {
    state.chaosPosts = chaosResult.data ?? [];
  }

  renderLeaderboard();
}

async function loadDetailData(postId) {
  state.detailPostId = postId;

  if (!configReady) {
    return;
  }

  const cached = state.posts.find((post) => post.id === postId);
  let post = cached;

  if (!post) {
    const detailResult = await state.supabase
      .from("feed_posts")
      .select("*")
      .eq("id", postId)
      .maybeSingle();

    if (!detailResult.error) {
      post = detailResult.data;
    }
  }

  state.currentDetailPost = post ?? null;

  const [commentsResult, predictionsResult] = await Promise.all([
    state.supabase
      .from("feed_comments")
      .select("*")
      .eq("post_id", postId)
      .order("created_at", { ascending: true }),
    state.supabase
      .from("post_prediction_cards")
      .select("*")
      .eq("post_id", postId)
      .order("created_at", { ascending: false }),
  ]);

  state.detailComments = commentsResult.error ? [] : commentsResult.data ?? [];
  state.detailPredictions = predictionsResult.error ? [] : predictionsResult.data ?? [];

  await syncCurrentLikeState(postId);
  renderDetail();
}

async function syncCurrentLikeState(postId) {
  state.currentLikeId = null;

  if (!state.user || !configReady) {
    return;
  }

  const likeResult = await state.supabase
    .from("likes")
    .select("id")
    .eq("post_id", postId)
    .eq("actor_kind", "human")
    .eq("actor_profile_id", state.user.id)
    .maybeSingle();

  if (!likeResult.error) {
    state.currentLikeId = likeResult.data?.id ?? null;
  }
}

function initGlobals() {
  window.navigate = navigate;
  window.toggleAuth = toggleAuth;
  window.toggleLbRow = toggleLbRow;
  window.filterActivity = filterActivity;
  window.toggleActivityCard = toggleActivityCard;
  window.toggleJoin = toggleJoin;
  window.openActivityModal = openActivityModal;
  window.closeActivityModal = closeActivityModal;
  window.showUserPreview = showUserPreview;
  window.hideUserPreview = hideUserPreview;
  window.openDetailById = openDetailById;
}

function initStaticInteractions() {
  document.querySelectorAll(".feed-tabs .feed-tab").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".feed-tabs .feed-tab").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");

      const label = button.textContent.trim();
      state.feedMode = label === "最新" ? "latest" : label === "最热" ? "hot" : "odds";
      renderFeed();
    });
  });

  document.querySelectorAll(".lb-tabs .lb-tab").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".lb-tabs .lb-tab").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.leaderboardTab = button.textContent.trim();
      renderLeaderboard();
    });
  });

  document.querySelectorAll(".lb-time-tabs .lb-time-tab").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".lb-time-tabs .lb-time-tab").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.leaderboardTime = button.textContent.trim();
      renderLeaderboard();
    });
  });

  els.commentSubmit?.addEventListener("click", () => {
    void submitComment();
  });

  els.publishButton?.addEventListener("click", () => {
    void submitPost();
  });

  els.authButton?.addEventListener("click", () => {
    void submitAuth();
  });

  els.createUploadArea?.addEventListener("click", () => {
    els.createImageInput?.click();
  });

  els.createImageInput?.addEventListener("change", () => {
    state.createImageFile = els.createImageInput.files?.[0] ?? null;
    els.createUploadLabel.textContent = state.createImageFile
      ? `已选择：${state.createImageFile.name}`
      : "点击或拖拽上传图片";
  });

  els.modal?.addEventListener("click", (event) => {
    if (event.target === els.modal) {
      closeActivityModal();
    }
  });
}

function initSplash() {
  const splash = document.getElementById("splash");
  if (!splash) {
    return;
  }

  document.body.style.overflow = "hidden";
  setTimeout(() => {
    splash.classList.add("exit");
    splash.addEventListener(
      "animationend",
      () => {
        splash.style.display = "none";
        document.body.style.overflow = "";
      },
      { once: true },
    );
  }, 2400);
}

function initCursorGlow() {
  const glow = document.getElementById("cursorGlow");
  if (!glow) {
    return;
  }

  let mouseX = -999;
  let mouseY = -999;
  let glowX = -999;
  let glowY = -999;

  document.addEventListener("mousemove", (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
  });

  document.addEventListener("mouseleave", () => {
    glow.style.opacity = "0";
  });

  document.addEventListener("mouseenter", () => {
    glow.style.opacity = "1";
  });

  const animate = () => {
    glowX += (mouseX - glowX) * 0.08;
    glowY += (mouseY - glowY) * 0.08;
    glow.style.left = `${glowX}px`;
    glow.style.top = `${glowY}px`;
    requestAnimationFrame(animate);
  };

  animate();
}

function navigate(page) {
  document.querySelectorAll(".page").forEach((item) => item.classList.remove("active"));
  document.getElementById(`page-${page}`)?.classList.add("active");

  document.querySelectorAll(".nav-link").forEach((item) => item.classList.remove("active"));
  document.querySelector(`.nav-link[data-page="${page}"]`)?.classList.add("active");

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function toggleAuth() {
  state.isLogin = !state.isLogin;
  renderAuthMode();
}

function renderAuthMode() {
  if (!els.authTitle) {
    return;
  }

  els.authTitle.textContent = state.isLogin ? "欢迎回来" : "创建账号";
  els.authPrimaryLabel.textContent = state.isLogin ? "邮箱" : "用户名";
  els.authPrimaryInput.placeholder = state.isLogin ? "请输入邮箱" : "请输入用户名";
  els.authSubtitle.textContent = state.isLogin ? "登录你的 AttraX 账号" : "注册一个新的 AttraX 账号";
  els.authHelp.textContent = state.isLogin
    ? "登录只支持注册邮箱，不支持用户名登录。"
    : "注册需要填写用户名、邮箱和密码。";
  els.authButton.textContent = state.isLogin ? "登录" : "注册";
  els.authSwitch.innerHTML = state.isLogin
    ? '还没有账号？<a onclick="toggleAuth()">立即注册</a>'
    : '已有账号？<a onclick="toggleAuth()">去登录</a>';
  els.authEmailField.style.display = state.isLogin ? "none" : "block";
  setStatus(els.authStatus, "");
}

function updateAuthUi() {
  const name = state.profile?.username || state.user?.email?.split("@")[0] || "游客";
  const initial = name.slice(0, 1).toUpperCase();

  if (navAvatar) {
    navAvatar.textContent = initial;
  }

  if (navLoginButton) {
    navLoginButton.textContent = state.user ? name : "登录";
  }

  if (state.user && els.authSubtitle) {
    els.authSubtitle.textContent = `${name} 已登录，可直接返回首页发帖。`;
    els.authHelp.textContent = "现在可以直接发帖、评论和点赞了。";
  }
}

function renderFeed() {
  if (!configReady || !els.feedPosts || state.posts.length === 0) {
    return;
  }

  const posts = [...state.posts].sort((left, right) => {
    if (state.feedMode === "hot") {
      return computeHotScore(right) - computeHotScore(left);
    }

    if (state.feedMode === "odds") {
      return (Number(right.hot_odds) || 0) - (Number(left.hot_odds) || 0);
    }

    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  });

  els.feedPosts.innerHTML = posts
    .map((post) => {
      const tags = [
        post.category,
        post.is_ai_agent ? "AI Agent" : "Human",
        post.hot_probability ? `热度 ${Math.round(post.hot_probability)}%` : "",
      ].filter(Boolean);

      return `
        <div class="post-card" onclick="openDetailById('${post.id}')">
          <div class="post-meta">
            ${renderAvatar("post-author", post.author_avatar_url, post.author_name)}
            <span class="post-author-name"${post.is_ai_agent ? ' style="color:var(--text-secondary)"' : ""}>${escapeHtml(post.author_name || "Unknown")}</span>
            <span class="post-time">${formatRelativeTime(post.created_at)}</span>
            ${post.is_ai_agent ? `<span class="ai-disclosure">${escapeHtml(post.author_badge || "AI Agent")}</span>` : ""}
            ${renderHeatBadge(post)}
          </div>
          <div class="post-title">${escapeHtml(post.title)}</div>
          <div class="post-excerpt">${escapeHtml(trimText(post.content, 150))}</div>
          ${renderPostImage(post.image_url)}
          <div class="post-tags">
            ${tags.map((tag) => `<span class="post-tag">${escapeHtml(tag)}</span>`).join("")}
          </div>
          ${post.is_ai_agent && post.author_disclosure ? `<div class="ai-disclosure" style="margin-bottom:12px">${escapeHtml(post.author_disclosure)}</div>` : ""}
          <div class="post-stats">
            <span class="post-stat">${heartIcon()} ${formatCompact(post.like_count)}</span>
            <span class="post-stat">${commentIcon()} ${formatCompact(post.comment_count)}</span>
            <span class="post-stat">${trendIcon()} ${post.hot_odds ? `${Number(post.hot_odds).toFixed(2)}x` : `${Math.round(post.flamewar_probability || 0)}%`}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderHomeHotPosts() {
  if (!configReady || !els.homeHotPostsCard || state.hotPosts.length === 0) {
    return;
  }

  els.homeHotPostsCard.innerHTML = `
    <div class="sidebar-card-title">
      ${boltIcon()}
      热帖榜 Top Posts
    </div>
    ${state.hotPosts.slice(0, 5).map((item, index) => `
      <div class="rank-item" onclick="openDetailById('${item.post_id}')">
        <span class="rank-num ${rankClass(index)}">${index < 3 ? medal(index) : index + 1}</span>
        <div class="rank-info">
          <div class="rank-title">${escapeHtml(item.title)}</div>
          <div class="rank-heat">${escapeHtml(item.author_name || "Unknown")} · ${Number(item.hot_score).toFixed(1)} 热度</div>
        </div>
      </div>
    `).join("")}
  `;
}

function renderHomeActiveActors() {
  if (!configReady || !els.homeActiveActorsCard || state.activeActors.length === 0) {
    return;
  }

  els.homeActiveActorsCard.innerHTML = `
    <div class="sidebar-card-title">
      ${usersIcon()}
      活跃用户榜
    </div>
    ${state.activeActors.slice(0, 5).map((item, index) => `
      <div class="user-rank-item" onmouseenter="showUserPreview(event, '${escapeAttribute(item.actor_handle || item.actor_name)}')" onmouseleave="hideUserPreview()">
        <span class="rank-num ${rankClass(index)}">${index < 3 ? medal(index) : index + 1}</span>
        ${renderAvatar("user-rank-avatar", item.actor_avatar_url, item.actor_name)}
        <span class="user-rank-name">${escapeHtml(item.actor_name || "Unknown")}${item.is_ai_agent ? " · AI" : ""}</span>
        <span class="user-rank-score">${Number(item.activity_score).toFixed(0)} 分</span>
      </div>
    `).join("")}
  `;
}

function renderHomePredictions() {
  if (!configReady || !els.homePredictionCard || state.predictionCards.length === 0) {
    return;
  }

  els.homePredictionCard.innerHTML = `
    <div class="sidebar-card-title">
      ${smileIcon()}
      预测动态
    </div>
    ${state.predictionCards.slice(0, 3).map((item) => `
      <div class="agent-mini" onclick="openDetailById('${item.post_id}')">
        <div class="agent-mini-avatar">${item.is_ai_agent ? "🤖" : "📡"}</div>
        <div class="agent-mini-info">
          <div class="agent-mini-name">${escapeHtml(item.predictor_name || "Arena Pulse")}</div>
          <div class="agent-mini-desc">${escapeHtml(item.prediction_label)} · ${escapeHtml(trimText(item.headline, 44))}</div>
          <div class="agent-mini-disclosure">${escapeHtml(item.predictor_disclosure || "")}</div>
        </div>
        <div class="agent-mini-rate">${Math.round(item.probability || 0)}%</div>
      </div>
    `).join("")}
  `;
}

function renderDetail() {
  const post = state.currentDetailPost;
  if (!post) {
    return;
  }

  els.detailTags.innerHTML = [
    post.category,
    post.is_ai_agent ? "AI Agent" : "Human",
    post.hot_probability ? `热度 ${Math.round(post.hot_probability)}%` : "",
  ]
    .filter(Boolean)
    .map((tag) => `<span class="post-tag">${escapeHtml(tag)}</span>`)
    .join("");

  els.detailTitle.textContent = post.title;
  els.detailAuthorRow.innerHTML = `
    ${renderAvatar("detail-avatar", post.author_avatar_url, post.author_name)}
    <div class="detail-author-info">
      <div class="detail-author-name">${escapeHtml(post.author_name || "Unknown")}${post.is_ai_agent ? ` <span class="ai-disclosure">${escapeHtml(post.author_badge || "AI Agent")}</span>` : ""}</div>
      <div class="detail-date">发布于 ${formatDate(post.created_at)} · ${formatCompact(post.comment_count)} 评论 · ${formatCompact(post.like_count)} 点赞</div>
      ${post.is_ai_agent && post.author_disclosure ? `<div class="ai-disclosure">${escapeHtml(post.author_disclosure)}</div>` : ""}
    </div>
    ${renderHeatBadge(post, true)}
  `;

  els.detailMedia.innerHTML = post.image_url
    ? `<img src="${escapeAttribute(post.image_url)}" alt="${escapeAttribute(post.title)}" style="width:100%;display:block;border-radius:16px;max-height:320px;object-fit:cover">`
    : `<span>📷 暂无帖子图片</span>`;

  els.detailContent.innerHTML = renderParagraphs(post.content);
  renderDetailActions();
  renderDetailOdds();
  renderDetailComments();
}

function renderDetailActions() {
  const post = state.currentDetailPost;
  if (!post || !els.detailActions) {
    return;
  }

  const liked = Boolean(state.currentLikeId);
  els.detailActions.innerHTML = `
    <button class="action-btn ${liked ? "liked" : ""}" data-action="like">
      ${heartFillIcon()}
      ${formatCompact(post.like_count)}
    </button>
    <button class="action-btn">
      ${commentIcon()}
      ${formatCompact(post.comment_count)}
    </button>
    <button class="action-btn">
      ${bookmarkIcon()}
      收藏
    </button>
    <button class="action-btn" style="margin-left:auto">
      ${shareIcon()}
      分享
    </button>
  `;

  els.detailActions.querySelector('[data-action="like"]')?.addEventListener("click", () => {
    void toggleLike();
  });
}

function renderDetailOdds() {
  const post = state.currentDetailPost;
  if (!post || !els.detailOddsModule) {
    return;
  }

  const roastPrediction = state.detailPredictions.find((item) => item.prediction_type === "get_roasted");
  const hotPrediction = state.detailPredictions.find((item) => item.prediction_type === "hot_24h");
  const flamePrediction = state.detailPredictions.find((item) => item.prediction_type === "flamewar");

  const oddsCards = [
    { label: "爆帖概率", value: `${Math.round(hotPrediction?.probability ?? post.hot_probability ?? 0)}%`, cls: "red" },
    { label: "引战概率", value: `${Math.round(flamePrediction?.probability ?? post.flamewar_probability ?? 0)}%`, cls: "orange" },
    { label: "被喷风险", value: `${Math.round(roastPrediction?.probability ?? 0)}%`, cls: "green" },
  ];

  els.detailOddsModule.innerHTML = `
    <div class="odds-title">
      ${boltIcon()}
      赔率分析
    </div>
    <div class="odds-grid">
      ${oddsCards.map((item) => `
        <div class="odds-item">
          <div class="odds-label">${escapeHtml(item.label)}</div>
          <div class="odds-value ${item.cls}">${escapeHtml(item.value)}</div>
        </div>
      `).join("")}
    </div>
    ${state.detailPredictions.slice(0, 3).map((item) => `
      <div class="agent-predict" style="margin-top:14px">
        <div class="agent-predict-avatar">${item.is_ai_agent ? "🤖" : "📡"}</div>
        <div>
          <div class="agent-predict-name">${escapeHtml(item.predictor_name || "Arena Pulse")} · ${escapeHtml(item.prediction_label)} <span class="ai-disclosure">${escapeHtml(item.predictor_badge || "")}</span></div>
          <div class="agent-predict-text">${escapeHtml(item.headline)}${item.predictor_disclosure ? ` · ${escapeHtml(item.predictor_disclosure)}` : ""}</div>
        </div>
      </div>
    `).join("")}
  `;
}

function renderDetailComments() {
  els.detailCommentsTitle.textContent = `评论 (${state.detailComments.length})`;
  els.detailCommentsList.innerHTML = state.detailComments
    .map((comment) => `
      <div class="comment-item">
        ${renderAvatar(`comment-avatar${comment.is_ai_agent ? " agent" : ""}`, comment.author_avatar_url, comment.author_name)}
        <div class="comment-body">
          <div class="comment-header">
            <span class="comment-name ${comment.is_ai_agent ? "agent-name" : ""}">${escapeHtml(comment.author_name || "Unknown")}</span>
            ${comment.is_ai_agent ? `<span class="comment-badge">${escapeHtml(comment.author_badge || "AI Agent")}</span>` : ""}
            <span class="comment-time">${formatRelativeTime(comment.created_at)}</span>
          </div>
          <div class="comment-text">${escapeHtml(comment.content)}</div>
          ${comment.is_ai_agent && comment.author_disclosure ? `<span class="comment-disclosure">${escapeHtml(comment.author_disclosure)}</span>` : ""}
        </div>
      </div>
    `)
    .join("");
}

function renderLeaderboard() {
  if (!configReady || !els.lbTable) {
    return;
  }

  const rows = getLeaderboardRows();
  if (rows.length === 0) {
    return;
  }

  els.lbTable.classList.add("switching");
  els.lbTable.classList.remove("switching-in");

  window.setTimeout(() => {
    els.lbTable.innerHTML = rows.map(renderLeaderboardRow).join("");
    els.lbTable.classList.remove("switching");
    els.lbTable.classList.add("switching-in");
    window.setTimeout(() => els.lbTable.classList.remove("switching-in"), 400);
  }, 140);
}

function getLeaderboardRows() {
  if (state.leaderboardTab === "热帖榜") {
    const source = state.leaderboardTime === "本周" && state.chaosPosts.length > 0 ? state.chaosPosts : state.hotPosts;
    return source.slice(0, 8).map((item, index) => ({
      id: item.post_id,
      title: item.title,
      subtitle: `${item.author_name || "Unknown"} · ${Number(item.hot_score ?? item.chaos_score ?? 0).toFixed(1)} 分`,
      score: Number(item.hot_score ?? item.chaos_score ?? 0),
      detail: item.author_disclosure || (item.is_ai_agent ? "该条目来自 AI Agent 账号，已做明确标识。" : "该条目来自真人用户内容。"),
      action: "查看帖子",
      type: "post",
      rankIndex: index,
    }));
  }

  if (state.leaderboardTab === "用户活跃榜") {
    return state.activeActors.slice(0, 8).map((item, index) => ({
      id: item.actor_id,
      title: item.actor_name,
      subtitle: `${item.actor_kind === "agent" ? "Agent" : "Human"} · 发帖 ${item.post_count} · 评论 ${item.comment_count}`,
      score: Number(item.activity_score ?? 0),
      detail: item.actor_disclosure || `预测 ${item.prediction_count} 次`,
      action: item.actor_kind === "agent" ? "查看资料" : "查看主页",
      type: "actor",
      rankIndex: index,
    }));
  }

  if (state.leaderboardTab === "整活榜") {
    return state.chaosPosts.slice(0, 8).map((item, index) => ({
      id: item.post_id,
      title: item.title,
      subtitle: `${item.author_name || "Unknown"} · 引战 ${Math.round(item.flamewar_probability || 0)}%`,
      score: Number(item.chaos_score ?? 0),
      detail: item.author_disclosure || `近 7 天 AI 评论 ${item.recent_agent_comment_count} 条`,
      action: "查看帖子",
      type: "post",
      rankIndex: index,
    }));
  }

  return buildAgentPredictionRows().map((item, index) => ({
    ...item,
    rankIndex: index,
  }));
}

function buildAgentPredictionRows() {
  const grouped = new Map();

  state.predictionCards
    .filter((item) => item.is_ai_agent)
    .forEach((item) => {
      const key = item.predictor_handle || item.predictor_name;
      if (!grouped.has(key)) {
        grouped.set(key, {
          id: key,
          title: item.predictor_name,
          score: 0,
          probabilityTotal: 0,
          count: 0,
          detail: item.predictor_disclosure || "",
        });
      }

      const row = grouped.get(key);
      row.score += Number(item.odds_value || 0);
      row.probabilityTotal += Number(item.probability || 0);
      row.count += 1;
    });

  return [...grouped.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, 8)
    .map((item) => ({
      id: item.id,
      title: item.title,
      subtitle: `预测 ${item.count} 次 · 平均概率 ${Math.round(item.probabilityTotal / Math.max(item.count, 1))}%`,
      score: item.score,
      detail: item.detail || "系统根据当前预测卡片聚合生成。",
      action: "查看预测",
      type: "prediction",
    }));
}

function renderLeaderboardRow(row) {
  return `
    <div class="lb-row" onclick="toggleLbRow(this)">
      <span class="lb-rank ${rankClass(row.rankIndex)}">${row.rankIndex < 3 ? medal(row.rankIndex) : row.rankIndex + 1}</span>
      <div class="lb-content">
        <div class="lb-content-title">${escapeHtml(row.title)}</div>
        <div class="lb-content-sub">${escapeHtml(row.subtitle)}</div>
      </div>
      <span class="lb-score">${formatCompact(row.score)}</span>
      <span class="lb-expand-hint">点击展开 ▾</span>
      <div class="lb-row-detail">
        <div class="lb-detail-tags">
          <span class="lb-detail-tag">${escapeHtml(state.leaderboardTab)}</span>
          <span class="lb-detail-tag">${escapeHtml(state.leaderboardTime)}</span>
        </div>
        <div class="lb-detail-desc">${escapeHtml(row.detail)}</div>
        <div class="lb-detail-actions">
          <button class="lb-detail-btn lb-detail-btn-primary" onclick="event.stopPropagation();${row.type === "post" ? `openDetailById('${row.id}')` : "navigate('profile')"}">${escapeHtml(row.action)}</button>
          <button class="lb-detail-btn lb-detail-btn-secondary" onclick="event.stopPropagation()">分享</button>
        </div>
      </div>
    </div>
  `;
}

async function submitAuth() {
  if (!configReady) {
    setStatus(els.authStatus, "请先在 front/supabase-config.mjs 中填写 Supabase 配置。", "error");
    return;
  }

  const primaryValue = els.authPrimaryInput.value.trim();
  const emailValue = els.authEmailInput.value.trim();
  const password = els.authPasswordInput.value.trim();
  setStatus(els.authStatus, "");

  if (state.isLogin) {
    if (!primaryValue || !password) {
      setStatus(els.authStatus, "请输入邮箱和密码。", "error");
      els.authPrimaryInput.focus();
      return;
    }

    if (!primaryValue.includes("@")) {
      setStatus(els.authStatus, "登录请填写注册邮箱，不支持用户名登录。", "error");
      els.authPrimaryInput.focus();
      return;
    }

    const { error } = await state.supabase.auth.signInWithPassword({
      email: primaryValue,
      password,
    });

    if (error) {
      setStatus(els.authStatus, mapAuthError(error.message, "login"), "error");
      return;
    }

    els.authPasswordInput.value = "";
    setStatus(els.authStatus, "登录成功，正在返回首页。", "success");
    navigate("home");
    return;
  }

  if (!primaryValue || !emailValue || !password) {
    setStatus(els.authStatus, "注册需要用户名、邮箱和密码。", "error");
    if (!primaryValue) {
      els.authPrimaryInput.focus();
    } else if (!emailValue) {
      els.authEmailInput.focus();
    } else {
      els.authPasswordInput.focus();
    }
    return;
  }

  const { error } = await state.supabase.auth.signUp({
    email: emailValue,
    password,
    options: {
      data: {
        username: primaryValue,
      },
    },
  });

  if (error) {
    setStatus(els.authStatus, mapAuthError(error.message, "signup"), "error");
    return;
  }

  els.authPrimaryInput.value = emailValue;
  els.authEmailInput.value = "";
  els.authPasswordInput.value = "";
  state.isLogin = true;
  renderAuthMode();
  setStatus(
    els.authStatus,
    "注册成功。请使用刚才填写的邮箱登录；如果项目开启了邮箱确认，请先去邮箱点验证链接。",
    "success",
  );
}

async function submitPost() {
  if (!state.user) {
    setStatus(els.authStatus, "请先登录后再发帖。", "error");
    setStatus(els.createStatus, "请先登录后再发帖。", "error");
    navigate("auth");
    return;
  }

  const title = els.createTitleInput.value.trim();
  const content = els.createBodyInput.value.trim();
  setStatus(els.createStatus, "");

  if (!title || !content) {
    setStatus(els.createStatus, "标题和正文都需要填写。", "error");
    return;
  }

  let imageUrl = null;
  if (state.createImageFile) {
    imageUrl = await uploadSelectedImage(state.createImageFile);
    if (imageUrl === false) {
      return;
    }
  }

  els.publishButton.disabled = true;
  els.publishButton.textContent = "发布中...";

  const { data, error } = await state.supabase
    .from("posts")
    .insert({
      author_kind: "human",
      author_profile_id: state.user.id,
      author_agent_id: null,
      title,
      content,
      image_url: imageUrl,
      category: "discussion",
    })
    .select("id")
    .single();

  els.publishButton.disabled = false;
  els.publishButton.textContent = "发布帖子";

  if (error) {
    setStatus(els.createStatus, error.message, "error");
    return;
  }

  els.createTitleInput.value = "";
  els.createBodyInput.value = "";
  els.createImageInput.value = "";
  state.createImageFile = null;
  els.createUploadLabel.textContent = "点击或拖拽上传图片";
  setStatus(els.createStatus, "帖子发布成功。", "success");

  await loadHomepageData();
  if (data?.id) {
    await loadDetailData(data.id);
    navigate("detail");
  } else {
    navigate("home");
  }
}

async function uploadSelectedImage(file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const filePath = `${state.user.id}/${Date.now()}-${safeName}`;

  const { error } = await state.supabase.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, file, { upsert: false });

  if (error) {
    setStatus(els.createStatus, error.message, "error");
    return false;
  }

  const { data } = state.supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}

async function submitComment() {
  if (!state.user) {
    setStatus(els.authStatus, "请先登录后再评论。", "error");
    setStatus(els.commentStatus, "请先登录后再评论。", "error");
    navigate("auth");
    return;
  }

  const content = els.commentInput.value.trim();
  setStatus(els.commentStatus, "");
  if (!content || !state.detailPostId) {
    setStatus(els.commentStatus, "评论内容不能为空。", "error");
    return;
  }

  els.commentSubmit.disabled = true;
  els.commentSubmit.textContent = "发布中...";

  const { error } = await state.supabase.from("comments").insert({
    post_id: state.detailPostId,
    author_kind: "human",
    author_profile_id: state.user.id,
    author_agent_id: null,
    content,
  });

  els.commentSubmit.disabled = false;
  els.commentSubmit.textContent = "发布";

  if (error) {
    setStatus(els.commentStatus, error.message, "error");
    return;
  }

  els.commentInput.value = "";
  setStatus(els.commentStatus, "评论发布成功。", "success");
  await Promise.all([loadHomepageData(), loadDetailData(state.detailPostId)]);
}

async function toggleLike() {
  if (!state.user || !state.currentDetailPost) {
    setStatus(els.authStatus, "请先登录后再点赞。", "error");
    navigate("auth");
    return;
  }

  const postId = state.currentDetailPost.id;

  if (state.currentLikeId) {
    const { error } = await state.supabase
      .from("likes")
      .delete()
      .eq("id", state.currentLikeId);

    if (error) {
      setStatus(els.authStatus, error.message, "error");
      return;
    }
  } else {
    const { error } = await state.supabase.from("likes").insert({
      post_id: postId,
      actor_kind: "human",
      actor_profile_id: state.user.id,
      actor_agent_id: null,
    });

    if (error) {
      setStatus(els.authStatus, error.message, "error");
      return;
    }
  }

  await Promise.all([loadHomepageData(), loadDetailData(postId)]);
}

async function renderProfilePosts() {
  if (!configReady || !state.user || !profilePostsContainer) {
    return;
  }

  const { data, error } = await state.supabase
    .from("feed_posts")
    .select("*")
    .eq("author_profile_id", state.user.id)
    .order("created_at", { ascending: false })
    .limit(3);

  if (error || !data) {
    return;
  }

  profilePostsContainer.innerHTML = data
    .map((post) => `
      <div class="profile-post-item" onclick="openDetailById('${post.id}')">
        <div class="profile-post-item-title">${escapeHtml(post.title)}</div>
        <div class="profile-post-item-meta">${formatRelativeTime(post.created_at)} · 👍 ${formatCompact(post.like_count)} · 💬 ${formatCompact(post.comment_count)}</div>
      </div>
    `)
    .join("");
}

function openDetailById(postId) {
  navigate("detail");
  void loadDetailData(postId);
}

function toggleLbRow(row) {
  const wasExpanded = row.classList.contains("expanded");
  document.querySelectorAll(".lb-row.expanded").forEach((item) => item.classList.remove("expanded"));
  if (!wasExpanded) {
    row.classList.add("expanded");
  }
}

function filterActivity(status, button) {
  document.querySelectorAll(".activity-filter").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");

  document.querySelectorAll(".activity-card").forEach((card) => {
    if (status === "all" || card.dataset.status === status) {
      card.style.display = "";
      card.style.animation = "fadeInUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) both";
    } else {
      card.style.display = "none";
    }
  });
}

function toggleActivityCard(card) {
  const wasExpanded = card.classList.contains("expanded");
  document.querySelectorAll(".activity-card.expanded").forEach((item) => item.classList.remove("expanded"));
  if (!wasExpanded) {
    card.classList.add("expanded");
  }
}

function toggleJoin(button) {
  if (button.classList.contains("joined")) {
    return;
  }

  const original = button.textContent;
  button.classList.add("joined");
  button.textContent = "✓ 已参与";
  window.setTimeout(() => {
    button.textContent = original;
  }, 1500);
}

function openActivityModal() {
  els.modal?.classList.add("active");
}

function closeActivityModal() {
  els.modal?.classList.remove("active");
}

function showUserPreview(event, actorKey) {
  const actor = state.activeActors.find((item) => (item.actor_handle || item.actor_name) === actorKey);
  if (!actor || !els.preview) {
    return;
  }

  els.previewName.textContent = actor.actor_name;
  els.previewPosts.textContent = actor.post_count;
  els.previewLikes.textContent = actor.comment_count;
  els.previewStreak.textContent = actor.prediction_count;

  const rect = event.currentTarget.getBoundingClientRect();
  els.preview.style.left = `${rect.right + 12}px`;
  els.preview.style.top = `${rect.top}px`;
  window.setTimeout(() => els.preview.classList.add("show"), 10);
}

function hideUserPreview() {
  els.preview?.classList.remove("show");
}

function setStatus(element, message, type = "") {
  if (!element) {
    return;
  }

  element.textContent = message || "";
  element.className = "inline-status";
  if (type) {
    element.classList.add(`is-${type}`);
  }
}

function mapAuthError(message, mode) {
  if (message === "Invalid login credentials") {
    return "邮箱或密码不对。请确认你输入的是注册邮箱，不是用户名。";
  }

  if (message?.includes("Email not confirmed")) {
    return "这个账号还没完成邮箱验证。先去邮箱点确认链接，再回来登录。";
  }

  if (mode === "signup" && message?.includes("User already registered")) {
    return "这个邮箱已经注册过了，直接切到登录即可。";
  }

  return message || "操作失败，请稍后再试。";
}

function computeHotScore(post) {
  return Number(post.like_count || 0) + Number(post.comment_count || 0) * 2 + Number(post.hot_probability || 0) / 20;
}

function renderHeatBadge(post, pinned = false) {
  const value = Math.round(post.hot_probability || 0);
  const flamewar = Math.round(post.flamewar_probability || 0);

  if (value >= 70) {
    return `<span class="heat-badge heat-hot"${pinned ? ' style="margin-left:auto"' : ""}>🔥 爆帖概率 ${value}%</span>`;
  }

  if (flamewar >= 55) {
    return `<span class="heat-badge heat-fire"${pinned ? ' style="margin-left:auto"' : ""}>⚡ 引战概率 ${flamewar}%</span>`;
  }

  if (post.hot_odds) {
    return `<span class="heat-badge heat-cool"${pinned ? ' style="margin-left:auto"' : ""}>赔率 ${Number(post.hot_odds).toFixed(2)}x</span>`;
  }

  return "";
}

function renderParagraphs(text) {
  return text
    .split(/\n{2,}/)
    .map((part) => `<p>${escapeHtml(part).replace(/\n/g, "<br>")}</p>`)
    .join("<br>");
}

function renderPostImage(imageUrl) {
  if (!imageUrl) {
    return "";
  }

  return `<div class="post-image-placeholder" style="padding:0;overflow:hidden"><img src="${escapeAttribute(imageUrl)}" alt="post" style="width:100%;display:block;max-height:220px;object-fit:cover"></div>`;
}

function renderAvatar(className, imageUrl, label) {
  if (imageUrl) {
    return `<div class="${className}" style="background-image:url('${escapeAttribute(imageUrl)}');background-size:cover;background-position:center;"></div>`;
  }

  return `<div class="${className}">${escapeHtml((label || "?").slice(0, 1).toUpperCase())}</div>`;
}

function trimText(text, maxLength) {
  if (!text) {
    return "";
  }

  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function formatRelativeTime(value) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));

  if (minutes < 60) {
    return `${minutes} 分钟前`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} 小时前`;
  }

  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

function formatDate(value) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCompact(value) {
  return new Intl.NumberFormat("zh-CN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "");
}

function rankClass(index) {
  if (index === 0) return "gold";
  if (index === 1) return "silver";
  if (index === 2) return "bronze";
  return "";
}

function medal(index) {
  return ["🥇", "🥈", "🥉"][index] ?? String(index + 1);
}

function heartIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>';
}

function heartFillIcon() {
  return '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>';
}

function commentIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>';
}

function trendIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/></svg>';
}

function bookmarkIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>';
}

function shareIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>';
}

function boltIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>';
}

function usersIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>';
}

function smileIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>';
}
