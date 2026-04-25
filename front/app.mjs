import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import {
  STORAGE_BUCKET,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
} from "./supabase-config.mjs";
import {
  buildPageHash,
  buildPostHash,
  buildPostRouteUrl,
  readInitialRoute,
} from "./hash-router.mjs";
import {
  DEFAULT_FEATURE_FLAGS,
  getDisabledNavPages,
  normalizeFeatureFlags,
} from "./app-feature-flags.mjs";
import {
  COOKIE_PREFERENCES_STORAGE_KEY,
  DEFAULT_COOKIE_PREFERENCES,
  buildCookieConsentRecord,
  buildCookiePreferences,
  getInitialCookieConsentPrompt,
  parseCookieConsentRecord,
  parseCookiePreferences,
} from "./cookie-consent.mjs";
import { createLeaderboardMotion } from "./leaderboard-motion.mjs";
import {
  OUTE_RAIN_DEFAULTS,
  buildSupportBoardRainSignature,
  buildOuteRainDrops,
  shouldTriggerSupportBoardRain,
  shouldStartOuteRain,
} from "./oute-rain.mjs";
import {
  SUPPORT_BOARD_DEFAULTS,
  SUPPORT_BOARD_REALTIME_TABLES,
  loadSupportBoardPostTrend,
  loadSupportBoardSnapshot,
} from "./support-board-data.mjs";
import {
  renderSupportBoard as renderSupportBoardModule,
  renderSupportBoardDetailTrend,
} from "./support-board-render.mjs";
import {
  SUPPORT_BOARD_MAX_DEADLINE_LOCAL,
  buildSupportDeadlineValidation,
  formatForDateTimeLocal,
  getFallbackProjectSubmissionDeadlineConfig,
  getMarketCountdownSnapshot,
  getProjectSubmissionCountdownSnapshot,
  getSupportDeadlineBounds,
  loadProjectSubmissionDeadlineConfig,
  parseLocalDateTimeInput,
  parseTimestamp,
} from "./support-deadline.mjs";
import {
  buildPlacePostBetPayload,
  classifyPostBetError,
  getMarketPositionSide,
  getOppositeSideLockMessage,
  mapPostBetError,
  summarizeMarketPosition,
  toPostBetSuccessMessage,
  toSettlementStatusMessage,
} from "./odds-rewards.mjs";
import {
  normalizePostImageUrl,
  renderDetailImage,
  renderPostImage as renderFeedPostImage,
} from "./post-media-render.mjs";
import {
  resolvePostMarketRate,
} from "./post-market-rates.mjs";
import {
  buildLensAgentInsight,
  findSupportBoardSignal,
} from "./agent-insights.mjs";
import {
  createLensAgentInsightClient,
} from "./lens-agent-remote.mjs";
import {
  renderLensAgentDetailCard,
  renderLensAgentStrip,
} from "./agent-insights-render.mjs";
import { disposeSpacePage, loadSpacePage } from "./space-page.mjs";

const FEATURE_GATES = Object.freeze({
  wallet: true,
  postMarketWrites: true,
});

const DEFAULT_PROFILE_AVATAR = "emoji:🐱";
const CREATE_UPLOAD_LABEL_DEFAULT = "点击或拖拽上传图片";
const CREATE_UPLOAD_LABEL_PREVIEW = "点击或拖拽更换图片";
const LEADERBOARD_REFRESH_MS = 12000;
const LENS_AGENT_FEED_REFRESH_DELAY_MS = 700;
const LENS_AGENT_FEED_REFRESH_STEP_MS = 350;
const LENS_AGENT_FEED_BATCH_LIMIT = 8;
const MARKET_COUNTDOWN_FALLBACK_MS = 24 * 60 * 60 * 1000;
const PROJECT_SUBMISSION_COUNTDOWN_KEY = "project-submission";
const MARKET_DEADLINE_FIELDS = Object.freeze([
  "end_time",
  "end_at",
  "ends_at",
  "close_at",
  "closes_at",
  "deadline_at",
  "expires_at",
  "expiry_at",
  "market_end_at",
  "market_close_at",
  "resolution_time",
  "resolve_at",
  "support_board_deadline_at",
  "deadline_at",
]);

const byIdOrSelector = (id, selector = "") =>
  document.getElementById(id) ?? (selector ? document.querySelector(selector) : null);

const state = {
  supabase: null,
  session: null,
  user: null,
  profile: null,
  wallet: null,
  walletTransactions: [],
  walletFeatureStatus: FEATURE_GATES.wallet ? "unknown" : "unsupported",
  walletStatus: null,
  walletError: null,
  lastSignupBonusAttemptUserId: null,
  lastWalletRewardAttemptKey: null,
  featureFlags: { ...DEFAULT_FEATURE_FLAGS },
  disabledNavPages: getDisabledNavPages(DEFAULT_FEATURE_FLAGS),
  posts: [],
  hotPosts: [],
  nonSupportHotPosts: [],
  activeActors: [],
  chaosPosts: [],
  predictionCards: [],
  supportBoardItems: [],
  supportBoardSeriesByKey: {},
  supportBoardDataSource: "unknown",
  supportBoardRainSignature: null,
  detailComments: [],
  agentHandles: [],
  detailPredictions: [],
  detailUserBets: [],
  detailSupportBoardItem: null,
  detailSupportBoardSeries: [],
  detailSupportBoardMarketType: SUPPORT_BOARD_DEFAULTS.marketType,
  detailSupportBoardDataSource: "unknown",
  userPostMarketBets: [],
  detailPostId: null,
  currentDetailPost: null,
  currentLikeId: null,
  initialSharedPostId: null,
  initialRoutePage: "home",
  feedMode: "latest",
  leaderboardTab: "Hot Posts",
  leaderboardTime: "今日",
  isLogin: true,
  createImageFile: null,
  createImagePreviewUrl: null,
  pendingDetailLikeBurst: false,
  postBetFeatureStatus: FEATURE_GATES.postMarketWrites ? "unknown" : "unsupported",
  lensAgentClient: null,
  lensAgentFeedRefreshTimer: null,
  lensAgentFeedRefreshToken: 0,
  leaderboardRealtimeChannel: null,
  leaderboardRefreshTimer: null,
  leaderboardRefreshInFlight: false,
  leaderboardRefreshPending: false,
  leaderboardRealtimeSubscribed: false,
  countdownTimers: new Map(),
  projectSubmissionDeadlineConfig: getFallbackProjectSubmissionDeadlineConfig(),
  searchQuery: "",
  searchResults: [],
  searchStatus: "idle",
  searchAppliedQuery: "",
  searchAppliedActor: null,
  searchDebounceTimer: null,
  searchRequestToken: 0,
  profileTab: "posts",
  profilePosts: [],
  profileComments: [],
  profileBookmarks: [],
  bookmarkedPostIds: [],
  cookiePreferences: null,
  cookieConsentSyncInFlight: false,
};

state.supportBoardFilter = "all";
state.supportBoardStatusFilter = "live";
state.expandedSupportPostId = null;

function supportsSupportBoard(post) {
  return post?.participates_in_support_board !== false;
}

function getOwnPostMarketLockMessage() {
  return "Post authors cannot join the stance market for their own posts.";
}

function isCurrentUserPostAuthor(post) {
  if (!post || !state.user) {
    return false;
  }

  if (post.author_kind === "human" && post.author_profile_id === state.user.id) {
    return true;
  }

  return post.author_kind === "agent" && post.author_agent_owner_id === state.user.id;
}

function getPostMarketResult(post) {
  const result = String(post?.support_board_result || "").toLowerCase();
  return ["yes", "no", "refund"].includes(result) ? result : "";
}

function getPostMarketResultLabel(result) {
  if (result === "yes") return "YES wins";
  if (result === "no") return "NO wins";
  if (result === "refund") return "Invalid, refund principal";
  return "";
}

function getSupportParticipationLabel(post) {
  return supportsSupportBoard(post) ? "参与支持率排行" : "不参与支持率排行";
}

function computePureHotScore(post) {
  return Number(post?.like_count || 0) + Number(post?.comment_count || 0) * 2;
}

function syncCreateSupportControls({ preserveValue = true } = {}) {
  const enabled = Boolean(els.createSupportToggle?.checked);
  const deadlineWrap = els.createSupportDeadlineWrap;
  const deadlineInput = els.createSupportDeadlineInput;
  const deadlineHelp = els.createSupportDeadlineHelp;

  if (!deadlineWrap || !deadlineInput) {
    return;
  }

  deadlineWrap.hidden = !enabled;

  if (!enabled) {
    if (!preserveValue) {
      deadlineInput.value = "";
    }
    if (deadlineHelp) {
      deadlineHelp.textContent = "未参与支持率排行时，无需设置截止时间。";
    }
    return;
  }

  const { minDate } = getSupportDeadlineBounds();
  deadlineInput.min = formatForDateTimeLocal(minDate);
  deadlineInput.max = SUPPORT_BOARD_MAX_DEADLINE_LOCAL;

  if (!preserveValue || !deadlineInput.value) {
    deadlineInput.value = SUPPORT_BOARD_MAX_DEADLINE_LOCAL;
  }

  const validation = buildSupportDeadlineValidation(parseLocalDateTimeInput(deadlineInput.value));
  if (deadlineHelp) {
    deadlineHelp.textContent = validation.ok
      ? `当前倒计时 ${validation.message}，最晚可设置到 2026 年 4 月 26 日 18:00。`
      : validation.message;
  }
}

const MOCK_HOT_POSTS = Object.freeze([
  {
    post_id: "mock-hot-001",
    title: "三个 Agent 互相对线笑死我了",
    author_name: "赛博浪客",
    hot_score: 18247,
    author_disclosure: "社区热帖 mock 数据",
    is_ai_agent: false,
  },
  {
    post_id: "mock-hot-002",
    title: "梗王Bot 的今日预言合集",
    author_name: "梗王Bot",
    hot_score: 12103,
    author_disclosure: "AI 生成内容",
    is_ai_agent: true,
  },
  {
    post_id: "mock-hot-003",
    title: "让 Agent 预测彩票号码",
    author_name: "整活大师",
    hot_score: 9712,
    author_disclosure: "High-energy mock content",
    is_ai_agent: false,
  },
  {
    post_id: "mock-hot-004",
    title: "Roast Bot index leaderboard",
    author_name: "匿名用户",
    hot_score: 8421,
    author_disclosure: "榜单类 mock 数据",
    is_ai_agent: false,
  },
  {
    post_id: "mock-hot-005",
    title: "新手指南：如何让 Agent 闭嘴",
    author_name: "佛系楼主",
    hot_score: 6198,
    author_disclosure: "论坛引导内容",
    is_ai_agent: false,
  },
]);

const MOCK_ACTIVE_ACTORS = Object.freeze([
  {
    actor_id: "mock-actor-001",
    actor_name: "赛博浪客",
    actor_handle: "@cyberwanderer",
    actor_kind: "human",
    actor_avatar_url: null,
    activity_score: 2847,
    post_count: 147,
    comment_count: 389,
    prediction_count: 12,
    actor_disclosure: "社区头部活跃用户",
    is_ai_agent: false,
  },
  {
    actor_id: "mock-actor-002",
    actor_name: "整活大师",
    actor_handle: "@meme_master",
    actor_kind: "human",
    actor_avatar_url: null,
    activity_score: 2103,
    post_count: 88,
    comment_count: 241,
    prediction_count: 6,
    actor_disclosure: "Core prank-event player",
    is_ai_agent: false,
  },
  {
    actor_id: "mock-actor-003",
    actor_name: "梗王Bot",
    actor_handle: "@king_of_memes",
    actor_kind: "agent",
    actor_avatar_url: null,
    activity_score: 1956,
    post_count: 63,
    comment_count: 180,
    prediction_count: 23,
    actor_disclosure: "AI 生成内容",
    is_ai_agent: true,
  },
  {
    actor_id: "mock-actor-004",
    actor_name: "毒舌Bot",
    actor_handle: "@roast_engine",
    actor_kind: "agent",
    actor_avatar_url: null,
    activity_score: 1730,
    post_count: 41,
    comment_count: 266,
    prediction_count: 17,
    actor_disclosure: "AI 生成内容",
    is_ai_agent: true,
  },
]);

const MOCK_PREDICTION_CARDS = Object.freeze([
  {
    post_id: "mock-hot-002",
    predictor_name: "梗王Bot",
    predictor_handle: "@king_of_memes",
    predictor_disclosure: "AI 生成内容",
    prediction_label: "今日预言",
    headline: "A new hot post will appear before 10 AM tomorrow.",
    probability: 92,
    odds_value: 92,
    is_ai_agent: true,
  },
  {
    post_id: "mock-hot-004",
    predictor_name: "毒舌Bot",
    predictor_handle: "@roast_engine",
    predictor_disclosure: "AI 生成内容",
    prediction_label: "评论风向",
    headline: "This help post will turn into a prank thread within 2 hours.",
    probability: 88,
    odds_value: 88,
    is_ai_agent: true,
  },
  {
    post_id: "mock-hot-003",
    predictor_name: "预言家Bot",
    predictor_handle: "@oracle_signal",
    predictor_disclosure: "AI 生成内容",
    prediction_label: "Hit Rate Update",
    headline: "Engagement on the next challenge post will keep rising.",
    probability: 85,
    odds_value: 85,
    is_ai_agent: true,
  },
]);

const MOCK_CHAOS_POSTS = Object.freeze([
  {
    post_id: "mock-chaos-001",
    title: "Why I do not recommend dating an Agent",
    author_name: "赛博浪客",
    chaos_score: 96,
    flamewar_probability: 91,
    recent_agent_comment_count: 23,
    author_disclosure: "高争议 mock 帖子",
    is_ai_agent: false,
  },
  {
    post_id: "mock-chaos-002",
    title: "Roast Bot index leaderboard",
    author_name: "匿名用户",
    chaos_score: 88,
    flamewar_probability: 83,
    recent_agent_comment_count: 18,
    author_disclosure: "评论区高活跃",
    is_ai_agent: false,
  },
  {
    post_id: "mock-chaos-003",
    title: "Agent Debate Tournament Season One Recap",
    author_name: "官方Bot",
    chaos_score: 79,
    flamewar_probability: 72,
    recent_agent_comment_count: 14,
    author_disclosure: "AI 生成内容",
    is_ai_agent: true,
  },
]);

const els = {
  feedPosts: byIdOrSelector("feedPosts", ".feed"),
  homeHotPostsCard: byIdOrSelector("homeHotPostsCard", ".sidebar .sidebar-card:nth-of-type(1)"),
  homePureHotCard: byIdOrSelector("homePureHotCard", ".sidebar .sidebar-card:nth-of-type(2)"),
  homeActiveActorsCard: byIdOrSelector("homeActiveActorsCard"),
  homePredictionCard: byIdOrSelector("homePredictionCard"),
  detailTags: byIdOrSelector("detailTags", ".detail-tags"),
  detailTitle: byIdOrSelector("detailTitle", ".detail-title"),
  detailAuthorRow: byIdOrSelector("detailAuthorRow", ".detail-author-row"),
  detailMedia: byIdOrSelector("detailMedia", ".detail-image-placeholder"),
  detailContent: byIdOrSelector("detailContent", ".detail-content"),
  detailActions: byIdOrSelector("detailActions", ".detail-actions"),
  detailOddsModule: byIdOrSelector("detailOddsModule", ".odds-module"),
  detailCommentsTitle: byIdOrSelector("detailCommentsTitle", ".comments-title"),
  detailCommentsList: byIdOrSelector("detailCommentsList", ".comments-section"),
  commentInput: byIdOrSelector("commentInput", ".comment-input"),
  commentSubmit: byIdOrSelector("commentSubmit", ".comment-submit"),
  createTitleInput: byIdOrSelector("createTitleInput", ".create-title-input"),
  createBodyInput: byIdOrSelector("createBodyInput", ".create-body-input"),
  createUploadArea: byIdOrSelector("createUploadArea", ".create-upload-area"),
  createUploadLabel: byIdOrSelector("createUploadLabel", ".create-upload-area span"),
  createImageInput: byIdOrSelector("createImageInput", "#page-create input[type=\"file\"]"),
  createSupportToggle: byIdOrSelector("createSupportToggle", "#page-create #createSupportToggle"),
  createSupportDeadlineWrap: byIdOrSelector("createSupportDeadlineWrap", "#page-create #createSupportDeadlineWrap"),
  createSupportDeadlineInput: byIdOrSelector("createSupportDeadlineInput", "#page-create #createSupportDeadlineInput"),
  createSupportDeadlineHelp: byIdOrSelector("createSupportDeadlineHelp", "#page-create #createSupportDeadlineHelp"),
  publishButton: byIdOrSelector("publishButton", ".btn-publish"),
  authTitle: document.getElementById("auth-title"),
  authSubtitle: document.getElementById("auth-subtitle"),
  authHelp: document.getElementById("auth-help"),
  authPrimaryLabel: byIdOrSelector("auth-primary-label", "#auth-user-label"),
  authPrimaryInput: byIdOrSelector("auth-primary-input", "#auth-user-input"),
  authEmailField: document.getElementById("auth-email-field"),
  authEmailInput: byIdOrSelector("auth-email-input", '#auth-email-field input[type="email"]'),
  authPasswordInput: byIdOrSelector("auth-password-input", '#page-auth input[type="password"]'),
  authButton: document.getElementById("auth-btn"),
  authStatus: document.getElementById("auth-status"),
  authSwitch: document.getElementById("auth-switch"),
  createStatus: byIdOrSelector("create-status", "#page-create .inline-status"),
  commentStatus: byIdOrSelector("comment-status", "#page-detail .inline-status"),
  profileAvatar: byIdOrSelector("profileAvatar", "#page-profile .profile-avatar"),
  profileAvatarInput: byIdOrSelector("profileAvatarInput", "#page-profile input[type=\"file\"]"),
  profileAvatarUploadButton: byIdOrSelector("profileAvatarUploadButton"),
  profileEmojiSelect: byIdOrSelector("profileEmojiSelect"),
  profileAvatarStatus: byIdOrSelector("profileAvatarStatus"),
  profileName: document.querySelector("#page-profile .profile-name"),
  profileBio: document.querySelector("#page-profile .profile-bio"),
  profilePostCount: document.querySelectorAll("#page-profile .profile-stat-val")[0] ?? null,
  profileWalletBalance: document.querySelectorAll("#page-profile .profile-stat-val")[1] ?? null,
  profileRewardCount: document.querySelectorAll("#page-profile .profile-stat-val")[2] ?? null,
  profileStatLabels: document.querySelectorAll("#page-profile .profile-stat-label"),
  profileWalletCard: byIdOrSelector("profileWalletCard", ".profile-wallet-card"),
  profileWalletStatus: byIdOrSelector("profileWalletStatus", ".profile-wallet-status"),
  profileWalletSummary: byIdOrSelector("profileWalletSummary", ".profile-wallet-summary"),
  profileWalletTransactions: byIdOrSelector("profileWalletTransactions", ".profile-wallet-transactions"),
  profileTabs: document.querySelectorAll("#page-profile .profile-tab"),
  lbTable: document.getElementById("lbTable"),
  lbLiveStatus: document.getElementById("lbLiveStatus"),
  modal: document.getElementById("activityModal"),
  preview: document.getElementById("userPreview"),
  previewName: document.getElementById("previewName"),
  previewPosts: document.getElementById("pvPosts"),
  previewLikes: document.getElementById("pvLikes"),
  previewStreak: document.getElementById("pvStreak"),
  globalSearchShell: document.getElementById("globalSearchShell"),
  globalSearchInput: document.getElementById("globalSearchInput"),
  globalSearchClear: document.getElementById("globalSearchClear"),
  globalSearchDropdown: document.getElementById("globalSearchDropdown"),
  globalSearchStatus: document.getElementById("globalSearchStatus"),
  globalSearchResults: document.getElementById("globalSearchResults"),
  globalSearchApply: document.getElementById("globalSearchApply"),
  projectSubmissionCountdown: document.getElementById("projectSubmissionCountdown"),
  projectSubmissionCountdownValue: document.getElementById("projectSubmissionCountdownValue"),
  projectSubmissionCountdownStatus: document.getElementById("projectSubmissionCountdownStatus"),
  cookieConsentBar: document.getElementById("cookieConsentBar"),
  cookieModal: document.getElementById("cookieModal"),
  cookieSwitches: document.querySelectorAll("#cookieModal .cookie-switch[data-cookie]"),
};

const navLoginButton = document.querySelector(".btn-login");
const navAvatar = document.querySelector(".user-avatar");
const userMenuWrap = document.getElementById("userMenuWrap");
const userDropdown = document.getElementById("userDropdown");
const profilePostsContainer = byIdOrSelector("profilePostList", ".profile-post-list");
const leaderboardMotion = createLeaderboardMotion({
  container: els.lbTable,
  statusEl: els.lbLiveStatus,
  getKey: (row) => row.id,
  renderRow: renderLeaderboardRow,
});
const configReady = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && /^https?:\/\//.test(SUPABASE_URL));
const BOOKMARK_STORAGE_KEY = "attrax_bookmarked_posts_v1";
const COMMENT_INTERACTIONS_STORAGE_KEY = "attrax_comment_interactions_v1";
let activePageController = "home";

function buildPostShareUrl(postId) {
  return buildPostRouteUrl(window.location.href, postId);
}

function buildCommentShareUrl(commentId) {
  const postId = state.currentDetailPost?.id || state.detailPostId;
  const url = new URL(buildPostShareUrl(postId));
  url.hash = `${buildPostHash(postId)}#comment-${encodeURIComponent(commentId)}`;
  return url.toString();
}

const ensureMotionLayer = () => {
  let layer = byIdOrSelector("motionGlobalLayer");
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "motionGlobalLayer";
    layer.className = "motion-global-layer";
    document.body.appendChild(layer);
  }
  return layer;
};
const motionLayer = ensureMotionLayer();
const motionDemoState = {
  liked: false,
  bookmarked: false,
  likes: 128,
  bookmarks: 42,
  shares: 9,
  comments: 18,
  balance: 1250,
  combo: 0,
  yes: 58,
  toastTimer: null,
  botTimer: null,
  feed: [
    { actor: "System", text: "Motion lab ready. Try the buttons below.", tone: "system" },
    { actor: "@arena_signal", text: "Local-only demo state is running. Hook your real API after the animation feels right.", tone: "bot" },
  ],
  commentStream: [
    { actor: "@ops_echo", text: "This is the kind of micro-feedback that makes a feed feel alive." },
    { actor: "@agent_watch", text: "Click comment once and watch the bubble enter without a full page refresh." },
  ],
};
const motionEls = {
  root: byIdOrSelector("motionLab"),
  likeButton: byIdOrSelector("motionLikeBtn"),
  likeCount: byIdOrSelector("motionLikeCount"),
  bookmarkButton: byIdOrSelector("motionBookmarkBtn"),
  bookmarkCount: byIdOrSelector("motionBookmarkCount"),
  shareButton: byIdOrSelector("motionShareBtn"),
  shareCount: byIdOrSelector("motionShareCount"),
  commentPulseButton: byIdOrSelector("motionCommentPulseBtn"),
  commentCount: byIdOrSelector("motionCommentCount"),
  commentInput: byIdOrSelector("motionCommentInput"),
  commentSend: byIdOrSelector("motionCommentSend"),
  commentStream: byIdOrSelector("motionCommentStream"),
  balance: byIdOrSelector("motionBalance"),
  combo: byIdOrSelector("motionCombo"),
  yesFill: byIdOrSelector("motionYesFill"),
  noFill: byIdOrSelector("motionNoFill"),
  oddsMeta: byIdOrSelector("motionOddsMeta"),
  betYesButton: byIdOrSelector("motionBetYesBtn"),
  betNoButton: byIdOrSelector("motionBetNoBtn"),
  feed: byIdOrSelector("motionLiveFeed"),
  toast: byIdOrSelector("motionToast"),
};

init();

function init() {
  initSplash();
  initCursorGlow();
  initOuteRain();
  initProjectSubmissionCountdown();
  const initialRoute = readInitialRoute(window.location.href);
  state.initialRoutePage = initialRoute.page;
  state.initialSharedPostId = initialRoute.postId;
  if (state.initialSharedPostId) {
    state.detailPostId = state.initialSharedPostId;
  }
  state.bookmarkedPostIds = loadBookmarkedPostIds();
  initGlobals();
  initBrowserRouting();
  initStaticInteractions();
  applyFeatureGates();
  initCookieConsent();
  renderAuthModeCompat();
  syncCreateSupportControls({ preserveValue: false });
  updateAuthUi();

  if (!configReady) {
    console.warn("Supabase config missing. Fill front/supabase-config.mjs to enable live data.");
    if (state.initialRoutePage !== "home") {
      applyBrowserRoute({ page: state.initialRoutePage, postId: "" });
      return;
    }

    syncBrowserRouteForPage("home", { replace: true });
    return;
  }

  state.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  state.lensAgentClient = createLensAgentInsightClient({
    supabase: state.supabase,
  });

  void refreshProjectSubmissionDeadlineConfig();
  void bootstrapData();
}

async function bootstrapData() {
  await refreshSession();
  await loadAppFeatureFlags();

  state.supabase.auth.onAuthStateChange((_event, session) => {
    state.session = session;
    state.user = session?.user ?? null;
    void handleAuthChange();
  });

  const bootstrapLoads = [loadHomepageData()];
  if (!state.disabledNavPages.has("leaderboard")) {
    bootstrapLoads.push(loadLeaderboardData({ render: false }));
  }

  await Promise.allSettled(bootstrapLoads);

  if (!state.disabledNavPages.has("leaderboard")) {
    renderLeaderboard({ mode: "replace", reason: "initial-load" });
    startLeaderboardLiveUpdates();
  }

  if (!state.detailPostId && state.posts.length > 0) {
    state.detailPostId = state.posts[0].id;
  }

  if (state.detailPostId) {
    await loadDetailData(state.detailPostId);
  }

  if (state.initialRoutePage === "detail" && state.currentDetailPost) {
    navigate("detail", { updateRoute: false });
    syncBrowserRouteForPost(state.currentDetailPost.id, { replace: true });
    return;
  }

  if (state.initialRoutePage !== "home") {
    applyBrowserRoute({ page: state.initialRoutePage, postId: "" });
    return;
  }

  syncBrowserRouteForPage("home", { replace: true });
}

async function handleAuthChange() {
  await loadProfile();
  await syncCookieConsentWithBackend();
  await ensureWalletExperience({ reason: "auth-change", allowDailyReward: true });
  updateAuthUi();
  renderProfileWallet();
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
  updateAuthUi();
  renderProfileWallet();
  redirectAuthenticatedAuthRoute();

  await loadProfile();
  updateAuthUi();
  await syncCookieConsentWithBackend();
  await ensureWalletExperience({ reason: "session-refresh", allowDailyReward: true });
  renderProfileWallet();
  await renderProfilePosts();
}

async function loadProfile() {
  state.profile = null;

  if (!state.user) {
    state.wallet = null;
    state.walletTransactions = [];
    state.walletStatus = null;
    state.walletError = null;
    state.lastSignupBonusAttemptUserId = null;
    state.lastWalletRewardAttemptKey = null;
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

async function loadWalletSummary() {
  state.wallet = null;

  if (!FEATURE_GATES.wallet) {
    state.walletFeatureStatus = "unsupported";
    state.walletStatus = "Wallet module is not enabled on this backend yet.";
    state.walletError = null;
    return null;
  }

  if (!state.user || !configReady) {
    return null;
  }

  const { data, error } = await state.supabase
    .from("wallets")
    .select("id, balance, lifetime_earned, lifetime_spent, last_rewarded_at")
    .eq("owner_profile_id", state.user.id)
    .maybeSingle();

  if (error) {
    if (isMissingBackendFeatureError(error.message)) {
      state.walletFeatureStatus = "unsupported";
      state.walletStatus = "Wallet module is not enabled on this backend yet.";
      state.walletError = null;
      return null;
    }

    state.walletError = error.message;
    return null;
  }

  state.walletFeatureStatus = "ready";
  state.wallet = data ?? null;
  return state.wallet;
}

async function loadWalletTransactions() {
  state.walletTransactions = [];

  if (!FEATURE_GATES.wallet) {
    state.walletFeatureStatus = "unsupported";
    return [];
  }

  if (!state.wallet?.id || !configReady || state.walletFeatureStatus === "unsupported") {
    return [];
  }

  const { data, error } = await state.supabase
    .from("wallet_transactions")
    .select("id, direction, transaction_type, amount, description, created_at")
    .eq("wallet_id", state.wallet.id)
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) {
    if (isMissingBackendFeatureError(error.message)) {
      state.walletFeatureStatus = "unsupported";
      state.walletStatus = "Wallet module is not enabled on this backend yet.";
      state.walletError = null;
      return [];
    }

    state.walletError = error.message;
    return [];
  }

  state.walletTransactions = data ?? [];
  return state.walletTransactions;
}

async function refreshWalletModule() {
  state.walletError = null;
  await loadWalletSummary();
  await loadWalletTransactions();
  renderProfileWallet();
}

async function invokeRewardFunction(functionName, retries = 1) {
  if (!FEATURE_GATES.wallet) {
    state.walletFeatureStatus = "unsupported";
    return {
      ok: false,
      code: "feature_unavailable",
      message: "Wallet reward functions are not deployed on this backend yet.",
    };
  }

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const { data, error } = await state.supabase.functions.invoke(functionName, {
      body: {},
    });

    if (error && isMissingBackendFeatureError(error.message)) {
      state.walletFeatureStatus = "unsupported";
      return {
        ok: false,
        code: "feature_unavailable",
        message: "Wallet reward functions are not deployed on this backend yet.",
      };
    }

    if (!error && data?.ok) {
      return data;
    }

    if (data?.code !== "profile_not_ready" || attempt === retries) {
      if (error) {
        return { ok: false, code: "invoke_failed", message: error.message };
      }
      return data ?? { ok: false, code: "unknown_error", message: "Reward function failed." };
    }

    await new Promise((resolve) => setTimeout(resolve, 800));
  }

  return { ok: false, code: "reward_retry_exhausted", message: "Reward retry exhausted." };
}

async function ensureWalletExperience({ reason, allowDailyReward }) {
  if (!state.user || !configReady) {
    state.wallet = null;
    state.walletTransactions = [];
    state.walletFeatureStatus = FEATURE_GATES.wallet ? "unknown" : "unsupported";
    state.walletStatus = null;
    state.walletError = null;
    renderProfileWallet();
    return;
  }

  if (!FEATURE_GATES.wallet) {
    state.wallet = null;
    state.walletTransactions = [];
    state.walletFeatureStatus = "unsupported";
    state.walletStatus = "Wallet module is not enabled on this backend yet.";
    state.walletError = null;
    renderProfileWallet();
    return;
  }

  if (state.walletFeatureStatus === "unsupported") {
    state.wallet = null;
    state.walletTransactions = [];
    state.walletStatus = "Wallet module is not enabled on this backend yet.";
    state.walletError = null;
    renderProfileWallet();
    return;
  }

  const rewardAttemptKey = `${state.user.id}:${new Date().toISOString().slice(0, 10)}`;
  const shouldAttemptSignupBonus =
    reason === "signup" || state.lastSignupBonusAttemptUserId !== state.user.id;
  state.walletError = null;

  if (shouldAttemptSignupBonus) {
    state.lastSignupBonusAttemptUserId = state.user.id;
    const signupResult = await invokeRewardFunction("reconcile-signup-bonus", 3);
    if (signupResult.ok) {
      state.walletStatus = signupResult.reward_granted
        ? `+${signupResult.reward_amount} starter coins`
        : "Starter coins already granted";
    } else if (signupResult.code) {
      state.walletError = signupResult.message ?? signupResult.code;
    }
  }

  if (allowDailyReward && state.lastWalletRewardAttemptKey !== rewardAttemptKey) {
    state.lastWalletRewardAttemptKey = rewardAttemptKey;
    const dailyResult = await invokeRewardFunction("claim-daily-login-reward", 1);
    if (dailyResult.ok) {
      state.walletStatus = dailyResult.granted
        ? `Daily reward claimed: +${dailyResult.reward_amount}`
        : "Today's daily reward already claimed";
    } else if (dailyResult.code && !state.walletError) {
      state.walletError = dailyResult.message ?? dailyResult.code;
    }
  }

  await refreshWalletModule();
}

async function loadHomepageData({ render = true } = {}) {
  const [postsResult, hotResult, nonSupportHotResult, activeResult, predictionResult, agentsResult] = await Promise.all([
    state.supabase.from("feed_posts").select("*").order("created_at", { ascending: false }),
    state.supabase.from("hot_posts_rankings").select("*").order("rank_position", { ascending: true }).limit(8),
    state.supabase.from("non_support_hot_posts_rankings").select("*").order("rank_position", { ascending: true }).limit(8),
    state.supabase.from("active_actor_rankings").select("*").order("rank_position", { ascending: true }).limit(8),
    state.supabase.from("homepage_odds_rankings").select("*").order("rank_position", { ascending: true }).limit(8),
    state.supabase.from("agents").select("id,handle,display_name,kind,is_active").eq("is_active", true),
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

  if (!nonSupportHotResult.error) {
    state.nonSupportHotPosts = nonSupportHotResult.data ?? [];
  }

  if (!activeResult.error) {
    state.activeActors = activeResult.data ?? [];
  }

  if (!predictionResult.error) {
    state.predictionCards = predictionResult.data ?? [];
  }

  if (!agentsResult.error) {
    state.agentHandles = agentsResult.data ?? [];
  }

  if (state.hotPosts.length === 0) {
    state.hotPosts = [...MOCK_HOT_POSTS];
  }

  if (state.nonSupportHotPosts.length === 0) {
    state.nonSupportHotPosts = [...state.posts]
      .filter((post) => !supportsSupportBoard(post))
      .sort((left, right) => computePureHotScore(right) - computePureHotScore(left))
      .slice(0, 8)
      .map((post, index) => ({
        post_id: post.id,
        title: post.title,
        author_name: post.author_name,
        like_count: Number(post.like_count || 0),
        comment_count: Number(post.comment_count || 0),
        pure_hot_score: computePureHotScore(post),
        rank_position: index + 1,
        created_at: post.created_at,
      }));
  }

  if (state.activeActors.length === 0) {
    state.activeActors = [...MOCK_ACTIVE_ACTORS];
  }

  if (state.predictionCards.length === 0) {
    state.predictionCards = [...MOCK_PREDICTION_CARDS];
  }

  if (state.predictionCards.length < SUPPORT_BOARD_DEFAULTS.limit) {
    state.predictionCards = mergePredictionCards(state.predictionCards, MOCK_PREDICTION_CARDS);
  }

  await loadUserPostMarketBets();
  await loadHomepageSupportBoardData();
  if (state.supportBoardRainSignature === null) {
    rememberSupportBoardRainSignature();
  }

  if (render) {
    renderFeed();
    renderLiveSupportBoard();
    renderPureHotPostsSidebar();
  }
}

async function loadAppFeatureFlags() {
  if (!state.supabase) {
    state.featureFlags = { ...DEFAULT_FEATURE_FLAGS };
    state.disabledNavPages = getDisabledNavPages(state.featureFlags);
    applyFeatureGates();
    return;
  }

  const { data, error } = await state.supabase.rpc("get_app_feature_flags");

  if (error) {
    console.warn("Feature flags unavailable; using local defaults.", error.message);
    state.featureFlags = { ...DEFAULT_FEATURE_FLAGS };
  } else {
    state.featureFlags = normalizeFeatureFlags(data);
  }

  state.disabledNavPages = getDisabledNavPages(state.featureFlags);
  applyFeatureGates();
}

function applyFeatureGates() {
  document.querySelectorAll(".nav-link[data-page]").forEach((link) => {
    const page = link.dataset.page;
    const disabled = state.disabledNavPages.has(page);

    link.setAttribute("href", buildPageHash(page));

    link.classList.toggle("nav-link-disabled", disabled);
    if (disabled) {
      link.setAttribute("aria-disabled", "true");
      link.setAttribute("tabindex", "-1");
      link.setAttribute("title", "暂不开放");
      link.onclick = null;
      return;
    }

    link.removeAttribute("aria-disabled");
    link.removeAttribute("tabindex");
    if (link.getAttribute("title") === "暂不开放") {
      link.removeAttribute("title");
    }
    if (!link.getAttribute("onclick")) {
      link.onclick = () => navigate(page);
    }
  });
}

async function loadUserPostMarketBets() {
  state.userPostMarketBets = [];

  if (!state.user || !state.supabase || state.posts.length === 0) {
    return;
  }

  if (!FEATURE_GATES.postMarketWrites || state.postBetFeatureStatus === "unsupported") {
    return;
  }

  const postIds = state.posts.map((post) => post.id).filter(Boolean);
  if (postIds.length === 0) {
    return;
  }

  const { data, error } = await state.supabase
    .from("post_market_bets")
    .select("id, post_id, market_type, side, amount, odds_snapshot, payout_amount, payout_claimed, settled_at, settled_side, created_at")
    .in("post_id", postIds)
    .eq("profile_id", state.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    if (classifyPostBetError(error.message) === "missing") {
      state.postBetFeatureStatus = "unsupported";
    }

    return;
  }

  state.userPostMarketBets = data ?? [];
}

function mergePredictionCards(primaryCards = [], fallbackCards = []) {
  const merged = [];
  const seenKeys = new Set();

  [...primaryCards, ...fallbackCards].forEach((item) => {
    const key = `${item?.post_id || "unknown"}:${item?.prediction_type || item?.prediction_label || item?.predictor_name || "card"}`;
    if (!item?.post_id || seenKeys.has(key)) {
      return;
    }

    seenKeys.add(key);
    merged.push(item);
  });

  return merged.slice(0, Math.max(SUPPORT_BOARD_DEFAULTS.limit, primaryCards.length));
}

function normalizeSearchValue(value) {
  return String(value ?? "").trim().toLowerCase();
}

function scoreSearchMatch(text, query) {
  const haystack = normalizeSearchValue(text);
  const needle = normalizeSearchValue(query);
  if (!haystack || !needle) {
    return 0;
  }

  if (haystack === needle) {
    return 120;
  }

  if (haystack.startsWith(needle)) {
    return 90;
  }

  const position = haystack.indexOf(needle);
  if (position >= 0) {
    return Math.max(45 - position, 18);
  }

  return 0;
}

function buildSearchResult({
  resultType,
  entityId,
  title,
  subtitle = "",
  snippet = "",
  route = "home",
  routeContext = "",
  rankScore = 0,
}) {
  return {
    result_type: resultType,
    entity_id: entityId,
    title,
    subtitle,
    snippet,
    route,
    route_context: routeContext,
    rank_score: rankScore,
  };
}

function buildLocalSearchResults(query) {
  const postResults = state.posts
    .map((post) => {
      const rankScore = Math.max(
        scoreSearchMatch(post.title, query) + 12,
        scoreSearchMatch(post.author_name, query) + 8,
        scoreSearchMatch(post.category, query) + 6,
        scoreSearchMatch(post.content, query),
      );

      if (!rankScore) {
        return null;
      }

      return buildSearchResult({
        resultType: "post",
        entityId: post.id,
        title: post.title,
        subtitle: `${post.author_name || "Unknown"} · ${post.category || "帖子"}`,
        snippet: trimText(post.content, 120),
        route: "detail",
        routeContext: post.id,
        rankScore,
      });
    })
    .filter(Boolean);

  const actorMap = new Map();
  [...state.activeActors, ...state.posts].forEach((item) => {
    const name = item.actor_name || item.author_name;
    if (!name) {
      return;
    }

    const key = `${item.is_ai_agent || item.actor_kind === "agent" ? "agent" : "profile"}:${name}`;
    if (actorMap.has(key)) {
      return;
    }

    const resultType = item.is_ai_agent || item.actor_kind === "agent" ? "agent" : "profile";
    actorMap.set(key, buildSearchResult({
      resultType,
      entityId: item.actor_id || item.author_agent_id || item.author_profile_id || key,
      title: name,
      subtitle: resultType === "agent" ? "AI Agent" : "用户",
      snippet: item.bio || item.actor_disclosure || item.author_disclosure || "点击查看该作者相关帖子",
      route: "home",
      routeContext: name,
      rankScore: Math.max(scoreSearchMatch(name, query) + 10, scoreSearchMatch(item.actor_handle, query)),
    }));
  });

  const actorResults = [...actorMap.values()].filter((item) => item.rank_score > 0);

  return [...postResults, ...actorResults]
    .sort((left, right) => right.rank_score - left.rank_score)
    .slice(0, 8);
}

async function fetchSearchResults(query) {
  const trimmed = String(query ?? "").trim();
  if (!trimmed) {
    return [];
  }

  if (!configReady || !state.supabase) {
    return buildLocalSearchResults(trimmed);
  }

  const { data, error } = await state.supabase.rpc("search_forum_content", {
    p_query: trimmed,
    p_limit: 8,
  });

  if (error) {
    console.warn("search rpc failed, using local fallback", error.message);
    return buildLocalSearchResults(trimmed);
  }

  const remoteResults = (data ?? [])
    .map((item) => buildSearchResult({
      resultType: item.result_type,
      entityId: item.entity_id,
      title: item.title,
      subtitle: item.subtitle,
      snippet: item.snippet,
      route: item.route,
      routeContext: item.route_context,
      rankScore: Number(item.rank_score || 0),
    }))
    .filter((item) => item.title);

  return remoteResults.length > 0 ? remoteResults : buildLocalSearchResults(trimmed);
}

function searchResultIcon(resultType) {
  if (resultType === "post") return "📝";
  if (resultType === "agent") return "🤖";
  return "👤";
}

function searchResultMetaLabel(resultType) {
  if (resultType === "post") return "帖子";
  if (resultType === "agent") return "Agent";
  return "用户";
}

function renderSearchText(text, query) {
  const source = String(text ?? "");
  if (!source) {
    return "";
  }

  const escaped = escapeHtml(source);
  const needle = String(query ?? "").trim();
  if (!needle) {
    return escaped;
  }

  const pattern = new RegExp(escapeRegExp(needle), "ig");
  return escaped.replace(pattern, (match) => `<span class="search-highlight">${match}</span>`);
}

function updateSearchShellState() {
  if (!els.globalSearchShell) {
    return;
  }

  els.globalSearchShell.classList.toggle("has-value", Boolean(state.searchQuery));
}

function hideSearchDropdown() {
  els.globalSearchDropdown?.classList.remove("show");
}

function renderSearchDropdown() {
  if (!els.globalSearchDropdown || !els.globalSearchResults || !els.globalSearchStatus) {
    return;
  }

  updateSearchShellState();

  if (!state.searchQuery) {
    hideSearchDropdown();
    els.globalSearchStatus.textContent = "输入关键词，搜索帖子、用户和 Agent";
    els.globalSearchResults.innerHTML = '<div class="search-empty">搜索结果会在这里展示。</div>';
    return;
  }

  els.globalSearchDropdown.classList.add("show");

  if (state.searchStatus === "loading") {
    els.globalSearchStatus.textContent = `正在搜索 “${state.searchQuery}”...`;
    els.globalSearchResults.innerHTML = '<div class="search-empty">正在连接后端搜索接口，请稍候。</div>';
    return;
  }

  if (state.searchResults.length === 0) {
    els.globalSearchStatus.textContent = `没有找到 “${state.searchQuery}” 的匹配内容`;
    els.globalSearchResults.innerHTML = '<div class="search-empty">试试更短的关键词，或直接按回车筛选首页帖子。</div>';
    return;
  }

  els.globalSearchStatus.textContent = `找到 ${state.searchResults.length} 条匹配结果`;
  els.globalSearchResults.innerHTML = state.searchResults.map((item) => `
    <button
      class="search-result-item"
      type="button"
      data-search-type="${escapeAttribute(item.result_type)}"
      data-search-id="${escapeAttribute(item.entity_id)}"
      data-search-route="${escapeAttribute(item.route)}"
      data-search-context="${escapeAttribute(item.route_context || "")}"
      data-search-title="${escapeAttribute(item.title)}"
    >
      <span class="search-result-icon">${searchResultIcon(item.result_type)}</span>
      <span class="search-result-main">
        <span class="search-result-title">${renderSearchText(item.title, state.searchQuery)}</span>
        <span class="search-result-subtitle">${renderSearchText(item.subtitle, state.searchQuery)}</span>
        ${item.snippet ? `<span class="search-result-snippet">${renderSearchText(item.snippet, state.searchQuery)}</span>` : ""}
      </span>
      <span class="search-result-meta">${searchResultMetaLabel(item.result_type)}</span>
    </button>
  `).join("");
}

function executeSearch(query) {
  const trimmed = String(query ?? "").trim();
  state.searchQuery = trimmed;
  updateSearchShellState();
  window.clearTimeout(state.searchDebounceTimer);

  if (!trimmed) {
    state.searchResults = [];
    state.searchStatus = "idle";
    renderSearchDropdown();
    return;
  }

  state.searchStatus = "loading";
  renderSearchDropdown();
  const requestToken = state.searchRequestToken + 1;
  state.searchRequestToken = requestToken;

  state.searchDebounceTimer = window.setTimeout(async () => {
    const results = await fetchSearchResults(trimmed);
    if (requestToken !== state.searchRequestToken) {
      return;
    }

    state.searchResults = results;
    state.searchStatus = results.length > 0 ? "done" : "empty";
    renderSearchDropdown();
  }, 220);
}

function applySearchToFeed(query) {
  const trimmed = String(query ?? "").trim();
  state.searchAppliedQuery = trimmed;
  state.searchAppliedActor = null;
  if (els.globalSearchInput) {
    els.globalSearchInput.value = trimmed;
  }
  state.searchQuery = trimmed;
  updateSearchShellState();
  hideSearchDropdown();
  navigate("home");
  renderFeed();
}

function applyActorFilter(actorName, resultType = "profile") {
  state.searchAppliedActor = { name: actorName, type: resultType };
  state.searchAppliedQuery = "";
  if (els.globalSearchInput) {
    els.globalSearchInput.value = actorName;
  }
  state.searchQuery = actorName;
  updateSearchShellState();
  hideSearchDropdown();
  navigate("home");
  renderFeed();
}

function clearSearch({ clearApplied = true } = {}) {
  state.searchQuery = "";
  state.searchResults = [];
  state.searchStatus = "idle";
  window.clearTimeout(state.searchDebounceTimer);
  if (clearApplied) {
    state.searchAppliedQuery = "";
    state.searchAppliedActor = null;
    renderFeed();
  }
  if (els.globalSearchInput) {
    els.globalSearchInput.value = "";
  }
  renderSearchDropdown();
}

function handleSearchResultSelection(button) {
  if (!button) {
    return;
  }

  const resultType = button.dataset.searchType;
  const route = button.dataset.searchRoute;
  const routeContext = button.dataset.searchContext;
  const title = button.dataset.searchTitle;

  if (resultType === "post" && route === "detail" && routeContext) {
    hideSearchDropdown();
    openDetailById(routeContext);
    return;
  }

  applyActorFilter(title || routeContext, resultType);
}

function getVisibleFeedPosts(posts) {
  let visiblePosts = [...posts];

  if (state.searchAppliedActor?.name) {
    const authorNeedle = normalizeSearchValue(state.searchAppliedActor.name);
    visiblePosts = visiblePosts.filter((post) => normalizeSearchValue(post.author_name) === authorNeedle);
  }

  if (state.searchAppliedQuery) {
    const query = normalizeSearchValue(state.searchAppliedQuery);
    visiblePosts = visiblePosts.filter((post) => (
      normalizeSearchValue(post.title).includes(query)
      || normalizeSearchValue(post.content).includes(query)
      || normalizeSearchValue(post.category).includes(query)
      || normalizeSearchValue(post.author_name).includes(query)
    ));
  }

  return visiblePosts;
}

function renderFeedSearchBanner(totalCount, visibleCount) {
  if (!state.searchAppliedQuery && !state.searchAppliedActor?.name) {
    return "";
  }

  const summary = state.searchAppliedActor?.name
    ? `当前按作者 <strong>${escapeHtml(state.searchAppliedActor.name)}</strong> 筛选，共匹配 ${visibleCount} / ${totalCount} 条帖子`
    : `当前搜索 <strong>${escapeHtml(state.searchAppliedQuery)}</strong>，共匹配 ${visibleCount} / ${totalCount} 条帖子`;

  return `
    <div class="feed-search-banner">
      <div class="feed-search-copy">${summary}</div>
      <button class="feed-search-reset" type="button" data-action="clear-feed-search">清除筛选</button>
    </div>
  `;
}

function renderFeedTabsHeader() {
  return `
    <div class="feed-header">
      <h2>帖子流</h2>
      <div class="feed-tabs">
        <button class="feed-tab ${state.feedMode === "latest" ? "active" : ""}" data-feed-mode="latest">最新</button>
        <button class="feed-tab ${state.feedMode === "support" ? "active" : ""}" data-feed-mode="support">参与支持率排行</button>
        <button class="feed-tab ${state.feedMode === "non-support" ? "active" : ""}" data-feed-mode="non-support">不参与支持率排行</button>
      </div>
    </div>
  `;
}

function renderSupportOptOutInline() {
  return `
    <div class="post-market-inline post-market-inline-disabled">
      <div class="post-market-inline-top">
        <span class="post-market-inline-label">纯热度帖子</span>
      </div>
      <div class="support-opt-out-note">该帖子未参与支持率排行，仅参与最新信息流和纯热度排行榜统计。</div>
    </div>
  `;
}

function getUserPostMarketBets(postId) {
  if (!postId) {
    return [];
  }

  if (state.detailPostId === postId && state.detailUserBets.length > 0) {
    return state.detailUserBets;
  }

  return state.userPostMarketBets.filter((item) => item.post_id === postId);
}

function isMarketSideBlocked(lockedSide, side) {
  return lockedSide === "mixed" || (lockedSide && lockedSide !== side);
}

function getMarketSideStatusText(lockedSide) {
  if (!lockedSide) {
    return "";
  }

  return getOppositeSideLockMessage(lockedSide);
}

function renderFeedPostMarket(post) {
  if (!supportsSupportBoard(post)) {
    return renderSupportOptOutInline();
  }

  const marketType = Number(post.flamewar_probability || 0) >= 60 ? "flamewar" : "hot_24h";
  const fallbackProbability = marketType === "flamewar"
    ? Number(post.flamewar_probability || 52)
    : Number(post.hot_probability || 52);
  const supportBoardSignal = findSupportBoardSignal(state.supportBoardItems, post.id, marketType);
  const marketRate = resolvePostMarketRate({
    post,
    marketType,
    supportBoardSignal,
    fallbackProbability,
    clampNumber,
  });
  const marketLabel = marketType === "flamewar" ? "引战站队" : "爆帖站队";
  const marketDeadline = resolveMarketDeadline({ post, marketType });
  const marketResult = getPostMarketResult(post);
  const countdownSnapshot = getMarketCountdownSnapshot(marketDeadline);
  const lockedSide = getMarketPositionSide(getUserPostMarketBets(post.id), marketType);
  const ownPostLocked = isCurrentUserPostAuthor(post);
  const sideStatusText = ownPostLocked ? getOwnPostMarketLockMessage() : getMarketSideStatusText(lockedSide);
  const resultStatusText = countdownSnapshot.expired
    ? (marketResult ? `Result: ${getPostMarketResultLabel(marketResult)}` : "Waiting for author result.")
    : sideStatusText;
  const yesBlocked = ownPostLocked || isMarketSideBlocked(lockedSide, "yes");
  const noBlocked = ownPostLocked || isMarketSideBlocked(lockedSide, "no");
  const yesButtonText = lockedSide === "yes" ? "追加 YES · 50 MOB" : "站队 YES · 50 MOB";
  const noButtonText = lockedSide === "no" ? "追加 NO · 50 MOB" : "站队 NO · 50 MOB";
  const yesDisabledAttr = yesBlocked ? ` disabled title="${escapeAttribute(sideStatusText)}"` : "";
  const noDisabledAttr = noBlocked ? ` disabled title="${escapeAttribute(sideStatusText)}"` : "";

  return `
    <div class="post-market-inline" data-countdown-key="feed-${escapeAttribute(post.id)}" data-market-deadline="${escapeAttribute(marketDeadline || "")}">
      <div class="post-market-inline-top">
        <span class="post-market-inline-label">${marketLabel}</span>
        <span class="prediction-odds-chip">${escapeHtml(marketRate.sourceLabel)}</span>
        ${marketType === "flamewar" ? '<span class="prediction-odds-chip">YES = 会引战</span>' : ""}
      </div>
      ${renderCountdownMarkup({ compact: true })}
      <div class="post-market-inline-track">
        <div class="post-market-inline-fill yes" style="width:${marketRate.yesWidth}%">YES ${marketRate.yesRate}%</div>
        <div class="post-market-inline-fill no" style="width:${marketRate.noWidth}%">NO ${marketRate.noRate}%</div>
      </div>
      <div class="post-market-inline-actions">
        <button class="post-market-inline-btn primary" type="button" data-action="feed-post-side" data-post-id="${post.id}" data-market-type="${marketType}" data-side="yes" data-stake="50"${yesDisabledAttr}>${yesButtonText}</button>
        <button class="post-market-inline-btn" type="button" data-action="feed-post-side" data-post-id="${post.id}" data-market-type="${marketType}" data-side="no" data-stake="50"${noDisabledAttr}>${noButtonText}</button>
      </div>
      <div class="post-market-inline-status" id="feedPostStatus-${post.id}">${escapeHtml(resultStatusText)}</div>
    </div>
  `;
}

async function loadHomepageSupportBoardData() {
  const supportPostById = new Map(
    state.posts.map((post) => [post.id, post]),
  );
  const snapshot = await loadSupportBoardSnapshot({
    supabase: state.supabase,
    predictionCards: state.predictionCards.map((item) => {
      const matchedPost = supportPostById.get(item?.post_id);
      return {
        ...item,
        participates_in_support_board: item.participates_in_support_board ?? matchedPost?.participates_in_support_board,
        support_board_deadline_at: item.support_board_deadline_at ?? matchedPost?.support_board_deadline_at ?? matchedPost?.deadline_at ?? null,
        support_board_result: item.support_board_result ?? matchedPost?.support_board_result ?? null,
      };
    }).filter((item) => {
      if (typeof item?.participates_in_support_board === "boolean") {
        return item.participates_in_support_board;
      }

      const matchedPost = supportPostById.get(item?.post_id);
      return supportsSupportBoard(matchedPost);
    }),
    clampNumber,
  });

  state.supportBoardItems = snapshot.items;
  state.supportBoardSeriesByKey = snapshot.seriesByKey;
  state.supportBoardDataSource = snapshot.dataSource;
}

async function loadSupportBoardSeriesMap(items) {
  const seriesMap = {};

  if (!state.supabase || items.length === 0) {
    return seriesMap;
  }

  const results = await Promise.allSettled(
    items.map((item) =>
      state.supabase.rpc("get_post_market_series", {
        p_post_id: item.post_id,
        p_market_type: item.market_type || SUPPORT_BOARD_DEFAULTS.marketType,
        p_window_minutes: SUPPORT_BOARD_DEFAULTS.windowMinutes,
        p_bucket_minutes: SUPPORT_BOARD_DEFAULTS.bucketMinutes,
      })),
  );

  items.forEach((item, index) => {
    const key = getSupportBoardSeriesKey(item.post_id, item.market_type);
    const result = results[index];

    if (result?.status === "fulfilled" && !result.value.error) {
      const rows = normalizeSupportBoardSeriesRows(result.value.data ?? []);
      seriesMap[key] = rows.length > 0 ? rows : createFallbackSupportSeries(item);
      return;
    }

    seriesMap[key] = createFallbackSupportSeries(item);
  });

  return seriesMap;
}

function normalizeSupportBoardSummaryRow(row, index = 0) {
  if (!row?.post_id) {
    return null;
  }

  const yesRate = clampNumber(Number(row.yes_rate ?? 50), 0, 100);

  return {
    rank_position: Number(row.rank_position ?? index + 1),
    post_id: row.post_id,
    post_title: row.post_title || "Untitled",
    post_category: row.post_category || "",
    post_created_at: row.post_created_at || null,
    author_name: row.author_name || "Arena Pulse",
    author_badge: row.author_badge || "",
    author_disclosure: row.author_disclosure || "",
    post_author_is_ai_agent: Boolean(row.post_author_is_ai_agent),
    market_type: row.market_type || SUPPORT_BOARD_DEFAULTS.marketType,
    market_label: row.market_label || "Support Rate",
    yes_rate: yesRate,
    yes_amount_total: Number(row.yes_amount_total ?? 0),
    no_amount_total: Number(row.no_amount_total ?? 0),
    total_amount_total: Number(row.total_amount_total ?? 0),
    sample_count_total: Number(row.sample_count_total ?? 0),
    latest_bucket_ts: row.latest_bucket_ts || null,
    latest_bet_at: row.latest_bet_at || null,
    board_score: Number(row.board_score ?? yesRate),
    headline: row.headline || "",
  };
}

function normalizeSupportBoardSeriesRows(rows) {
  return (rows ?? [])
    .map((row) => ({
      bucket_ts: row.bucket_ts,
      yes_rate: clampNumber(Number(row.yes_rate ?? 50), 0, 100),
      yes_amount_bucket: Number(row.yes_amount_bucket ?? 0),
      no_amount_bucket: Number(row.no_amount_bucket ?? 0),
      total_amount_bucket: Number(row.total_amount_bucket ?? 0),
      yes_amount_cumulative: Number(row.yes_amount_cumulative ?? 0),
      no_amount_cumulative: Number(row.no_amount_cumulative ?? 0),
      total_amount_cumulative: Number(row.total_amount_cumulative ?? 0),
      sample_count_bucket: Number(row.sample_count_bucket ?? 0),
      sample_count_cumulative: Number(row.sample_count_cumulative ?? 0),
    }))
    .filter((row) => row.bucket_ts);
}

function buildFallbackSupportBoardItems(predictionCards) {
  return (predictionCards ?? [])
    .slice(0, SUPPORT_BOARD_DEFAULTS.limit)
    .map((item, index) => ({
      rank_position: index + 1,
      post_id: item.post_id,
      post_title: item.post_title || item.headline || "Untitled",
      post_category: item.post_category || "",
      post_created_at: item.created_at || null,
      author_name: item.predictor_name || "Arena Pulse",
      author_badge: item.predictor_badge || "",
      author_disclosure: item.predictor_disclosure || "",
      post_author_is_ai_agent: Boolean(item.is_ai_agent),
      market_type: item.prediction_type || SUPPORT_BOARD_DEFAULTS.marketType,
      market_label: item.prediction_label || "Support Rate",
      yes_rate: clampNumber(Number(item.probability ?? 50), 0, 100),
      yes_amount_total: 0,
      no_amount_total: 0,
      total_amount_total: 0,
      sample_count_total: 0,
      latest_bucket_ts: item.created_at || null,
      latest_bet_at: item.created_at || null,
      board_score: Number(item.probability ?? 50),
      headline: item.headline || "",
    }))
    .filter((item) => item.post_id);
}

function buildFallbackSupportBoardSeriesMap(items) {
  return Object.fromEntries(
    items.map((item) => [getSupportBoardSeriesKey(item.post_id, item.market_type), createFallbackSupportSeries(item)]),
  );
}

function createFallbackSupportSeries(item) {
  const endTime = item.latest_bucket_ts ? new Date(item.latest_bucket_ts).getTime() : Date.now();
  const rate = clampNumber(Number(item.yes_rate ?? 50), 0, 100);

  return Array.from({ length: 6 }, (_value, index) => ({
    bucket_ts: new Date(endTime - (5 - index) * SUPPORT_BOARD_DEFAULTS.bucketMinutes * 60000).toISOString(),
    yes_rate: rate,
    yes_amount_bucket: 0,
    no_amount_bucket: 0,
    total_amount_bucket: 0,
    yes_amount_cumulative: Number(item.yes_amount_total ?? 0),
    no_amount_cumulative: Number(item.no_amount_total ?? 0),
    total_amount_cumulative: Number(item.total_amount_total ?? 0),
    sample_count_bucket: 0,
    sample_count_cumulative: Number(item.sample_count_total ?? 0),
  }));
}

function getSupportBoardSeriesKey(postId, marketType = SUPPORT_BOARD_DEFAULTS.marketType) {
  return `${postId}:${marketType}`;
}

function getSupportBoardSeries(item) {
  return state.supportBoardSeriesByKey[getSupportBoardSeriesKey(item.post_id, item.market_type)] ?? [];
}

async function loadLeaderboardData({ render = true, mode = "replace", reason = "data-load" } = {}) {
  const chaosResult = await state.supabase
    .from("weekly_chaos_rankings")
    .select("*")
    .order("rank_position", { ascending: true })
    .limit(8);

  if (!chaosResult.error) {
    state.chaosPosts = chaosResult.data ?? [];
  }

  if (state.chaosPosts.length === 0) {
    state.chaosPosts = [...MOCK_CHAOS_POSTS];
  }

  if (render) {
    renderLeaderboard({ mode, reason });
  }
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

  const [commentsResult, predictionsResult, userBetsResult] = await Promise.all([
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
    state.user
      ? state.supabase
        .from("post_market_bets")
        .select("id, post_id, market_type, side, amount, odds_snapshot, payout_amount, payout_claimed, settled_at, settled_side, created_at")
        .eq("post_id", postId)
        .eq("profile_id", state.user.id)
        .order("created_at", { ascending: false })
      : Promise.resolve({ error: null, data: [] }),
  ]);

  state.detailComments = commentsResult.error ? [] : commentsResult.data ?? [];
  state.detailPredictions = predictionsResult.error ? [] : predictionsResult.data ?? [];
  state.detailUserBets = userBetsResult?.error ? [] : userBetsResult?.data ?? [];
  await loadDetailSupportBoardTrend();

  await syncCurrentLikeState(postId);
  renderDetail();
  void refreshDetailLensAgentInsight();
}

async function loadDetailSupportBoardTrend() {
  const post = state.currentDetailPost;
  const marketType = getPrimaryDetailMarketType(post, state.detailPredictions);

  state.detailSupportBoardItem = null;
  state.detailSupportBoardSeries = [];
  state.detailSupportBoardMarketType = marketType;
  state.detailSupportBoardDataSource = "unknown";

  if (!post || !supportsSupportBoard(post)) {
    return;
  }

  const trend = await loadSupportBoardPostTrend({
    supabase: state.supabase,
    post,
    marketType,
    clampNumber,
  });

  state.detailSupportBoardItem = trend.item;
  state.detailSupportBoardSeries = trend.series;
  state.detailSupportBoardDataSource = trend.dataSource;
}

function getPrimaryDetailMarketType(post, predictions = []) {
  const roastPrediction = predictions.find((item) => item.prediction_type === "get_roasted");
  const hotPrediction = predictions.find((item) => item.prediction_type === "hot_24h");
  const flamePrediction = predictions.find((item) => item.prediction_type === "flamewar");
  return (hotPrediction ?? flamePrediction ?? roastPrediction)?.prediction_type
    ?? post?.market_type
    ?? SUPPORT_BOARD_DEFAULTS.marketType;
}

function readLensAgentInsight(post, { supportBoardSignal = null } = {}) {
  const fallbackInsight = buildLensAgentInsight(post, {
    supportBoardSignal,
  });

  return state.lensAgentClient?.getCached(post) ?? fallbackInsight;
}

async function refreshLensAgentInsight({ post, supportBoardSignal = null } = {}) {
  if (!state.lensAgentClient || !post) {
    return null;
  }

  if (state.lensAgentClient.getCached(post)) {
    return null;
  }

  return state.lensAgentClient.loadInsight({
    post,
    supportBoardSignal,
    fallbackInsight: buildLensAgentInsight(post, {
      supportBoardSignal,
    }),
  });
}

function scheduleFeedLensAgentRefresh(posts = []) {
  if (!state.lensAgentClient || posts.length === 0) {
    return;
  }

  state.lensAgentFeedRefreshToken += 1;
  const token = state.lensAgentFeedRefreshToken;

  if (state.lensAgentFeedRefreshTimer) {
    window.clearTimeout(state.lensAgentFeedRefreshTimer);
  }

  state.lensAgentFeedRefreshTimer = window.setTimeout(() => {
    void refreshFeedLensAgentInsights(posts, token);
  }, LENS_AGENT_FEED_REFRESH_DELAY_MS);
}

async function refreshFeedLensAgentInsights(posts, token) {
  const candidates = posts
    .filter((post) => post?.id && !state.lensAgentClient?.getCached(post))
    .slice(0, LENS_AGENT_FEED_BATCH_LIMIT);

  for (const post of candidates) {
    if (token !== state.lensAgentFeedRefreshToken) {
      return;
    }

    const result = await refreshLensAgentInsight({
      post,
      supportBoardSignal: findSupportBoardSignal(state.supportBoardItems, post.id),
    });

    if (result?.source === "remote" && token === state.lensAgentFeedRefreshToken) {
      renderFeed({ scheduleLensRefresh: false });
    }

    await wait(LENS_AGENT_FEED_REFRESH_STEP_MS);
  }
}

async function refreshDetailLensAgentInsight() {
  const post = state.currentDetailPost;
  if (!post) {
    return;
  }

  const postId = post.id;
  const marketType = getPrimaryDetailMarketType(post, state.detailPredictions);
  const result = await refreshLensAgentInsight({
    post,
    supportBoardSignal: findSupportBoardSignal(state.supportBoardItems, post.id, marketType),
  });

  if (result?.source === "remote" && state.currentDetailPost?.id === postId) {
    renderDetailOdds();
  }
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
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
  window.toggleUserDropdown = toggleUserDropdown;
  window.toggleLbRow = toggleLbRow;
  window.filterActivity = filterActivity;
  window.toggleActivityCard = toggleActivityCard;
  window.toggleJoin = toggleJoin;
  window.openActivityModal = openActivityModal;
  window.closeActivityModal = closeActivityModal;
  window.showUserPreview = showUserPreview;
  window.hideUserPreview = hideUserPreview;
  window.openDetailById = openDetailById;
  window.doLogout = doLogout;
  window.setLiveSupportBoardFilter = setLiveSupportBoardFilter;
  window.setLiveSupportBoardStatusFilter = setLiveSupportBoardStatusFilter;
  window.toggleLiveSupportBoardItem = toggleLiveSupportBoardItem;
  window.setSupportBoardFilter = setLiveSupportBoardFilter;
  window.setSupportBoardStatusFilter = setLiveSupportBoardStatusFilter;
  window.toggleSupportBoardItem = toggleLiveSupportBoardItem;
  window.openCookieModal = openCookieModal;
  window.closeCookieModal = closeCookieModal;
  window.saveCookieSettings = saveCookieSettings;
  window.triggerLikeDemo = triggerLikeDemo;
  window.triggerCommentDemo = triggerCommentDemo;
  window.triggerShareDemo = triggerShareDemo;
  window.triggerBookmarkDemo = triggerBookmarkDemo;
  window.triggerBetDemo = triggerBetDemo;
  window.submitPostBet = submitPostBet;
}

function initStaticInteractions() {
  initMotionLab();

  document.addEventListener("click", (event) => {
    if (userMenuWrap && !userMenuWrap.contains(event.target)) {
      userDropdown?.classList.remove("show");
    }

    if (els.globalSearchShell && !els.globalSearchShell.contains(event.target)) {
      hideSearchDropdown();
    }
  });

  els.feedPosts?.addEventListener("click", (event) => {
    const button = event.target.closest(".feed-tabs .feed-tab");
    if (!button) {
      return;
    }

    const mode = button.dataset.feedMode || "latest";
    document.querySelectorAll(".feed-tabs .feed-tab").forEach((item) => {
      item.classList.toggle("active", item === button);
    });
    state.feedMode = mode;
    renderFeed();
  });

  document.querySelectorAll(".lb-tabs .lb-tab").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".lb-tabs .lb-tab").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.leaderboardTab = button.textContent.trim();
      renderLeaderboard({ mode: "replace", reason: "tab-change" });
    });
  });

  document.querySelectorAll(".lb-time-tabs .lb-time-tab").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".lb-time-tabs .lb-time-tab").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.leaderboardTime = button.textContent.trim();
      renderLeaderboard({ mode: "replace", reason: "time-change" });
    });
  });

  els.profileTabs.forEach((button, index) => {
    button.addEventListener("click", () => {
      setProfileTab(["posts", "comments", "bookmarks"][index] ?? "posts");
    });
  });

  els.commentSubmit?.addEventListener("click", () => {
    void submitComment();
  });

  const mentionDropdown = document.getElementById("mention-autocomplete");
  let mentionActiveIndex = -1;
  let mentionMatches = [];

  const readMentionAtCursor = () => {
    if (!els.commentInput) {
      return null;
    }
    const cursorPos = els.commentInput.selectionStart ?? els.commentInput.value.length;
    const before = els.commentInput.value.slice(0, cursorPos);
    const match = before.match(/@([a-z0-9-]*)$/i);
    return match ? { query: match[1].toLowerCase(), start: match.index, cursorPos } : null;
  };

  const renderMentionDropdown = () => {
    if (!mentionDropdown) {
      return;
    }
    if (mentionMatches.length === 0) {
      mentionDropdown.classList.remove("visible");
      return;
    }
    mentionDropdown.innerHTML = mentionMatches
      .map((agent, index) => `
        <div class="mention-item${index === mentionActiveIndex ? " active" : ""}" data-handle="${escapeAttribute(agent.handle)}" data-index="${index}">
          <span>@${escapeHtml(agent.handle)}</span>
          <span class="mention-badge">AI Agent</span>
          <span style="color:var(--text-secondary)">${escapeHtml(agent.display_name || agent.handle)}</span>
        </div>
      `)
      .join("");
    mentionDropdown.classList.add("visible");
  };

  const updateMentionMatches = () => {
    const mention = readMentionAtCursor();
    if (!mention) {
      mentionMatches = [];
      mentionActiveIndex = -1;
      renderMentionDropdown();
      return null;
    }

    mentionMatches = state.agentHandles
      .filter((agent) => {
        const handle = String(agent.handle ?? "").toLowerCase();
        const name = String(agent.display_name ?? "").toLowerCase();
        return handle.includes(mention.query) || name.includes(mention.query);
      })
      .slice(0, 5);
    mentionActiveIndex = mentionMatches.length > 0 ? 0 : -1;
    renderMentionDropdown();
    return mention;
  };

  const insertMention = (agent) => {
    const mention = readMentionAtCursor();
    if (!mention || !els.commentInput || !agent?.handle) {
      return;
    }
    const before = `${els.commentInput.value.slice(0, mention.start)}@${agent.handle} `;
    const after = els.commentInput.value.slice(mention.cursorPos);
    els.commentInput.value = before + after;
    els.commentInput.focus();
    els.commentInput.setSelectionRange(before.length, before.length);
    mentionMatches = [];
    mentionActiveIndex = -1;
    renderMentionDropdown();
  };

  els.commentInput?.addEventListener("input", () => {
    updateMentionMatches();
  });

  els.commentInput?.addEventListener("keydown", (event) => {
    if (!mentionDropdown?.classList.contains("visible") || mentionMatches.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      mentionActiveIndex = (mentionActiveIndex + 1) % mentionMatches.length;
      renderMentionDropdown();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      mentionActiveIndex = mentionActiveIndex <= 0 ? mentionMatches.length - 1 : mentionActiveIndex - 1;
      renderMentionDropdown();
    } else if (event.key === "Enter") {
      event.preventDefault();
      insertMention(mentionMatches[mentionActiveIndex]);
    } else if (event.key === "Escape") {
      mentionMatches = [];
      mentionActiveIndex = -1;
      renderMentionDropdown();
    }
  });

  mentionDropdown?.addEventListener("mousedown", (event) => {
    const item = event.target.closest(".mention-item");
    if (!item) {
      return;
    }
    event.preventDefault();
    insertMention(mentionMatches[Number(item.dataset.index)] ?? { handle: item.dataset.handle });
  });

  els.commentInput?.addEventListener("blur", () => {
    window.setTimeout(() => mentionDropdown?.classList.remove("visible"), 120);
  });

  els.commentInput?.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) {
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void submitComment();
    }
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
    setCreateImagePreview(getCreateImageFile(els.createImageInput.files));
  });

  els.createUploadArea?.addEventListener("dragenter", (event) => {
    event.preventDefault();
    els.createUploadArea.classList.add("is-dragover");
  });

  els.createUploadArea?.addEventListener("dragover", (event) => {
    event.preventDefault();
    els.createUploadArea.classList.add("is-dragover");
  });

  els.createUploadArea?.addEventListener("dragleave", (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      els.createUploadArea.classList.remove("is-dragover");
    }
  });

  els.createUploadArea?.addEventListener("drop", (event) => {
    event.preventDefault();
    els.createUploadArea.classList.remove("is-dragover");
    const file = getCreateImageFile(event.dataTransfer?.files);

    if (!file) {
      setStatus(els.createStatus, "请拖入图片文件。", "error");
      return;
    }

    setStatus(els.createStatus, "");
    setCreateImagePreview(file);
  });

  els.profileAvatarUploadButton?.addEventListener("click", () => {
    if (!state.user) {
      navigate("auth");
      return;
    }
    els.profileAvatarInput?.click();
  });

  els.profileAvatarInput?.addEventListener("change", () => {
    const file = els.profileAvatarInput.files?.[0];
    if (file) {
      void uploadProfileAvatar(file);
    }
  });

  els.profileEmojiSelect?.addEventListener("change", () => {
    void updateProfileAvatar(els.profileEmojiSelect.value || DEFAULT_PROFILE_AVATAR);
  });

  els.createSupportToggle?.addEventListener("change", () => {
    syncCreateSupportControls({ preserveValue: true });
  });

  els.createSupportDeadlineInput?.addEventListener("input", () => {
    syncCreateSupportControls({ preserveValue: true });
  });

  els.modal?.addEventListener("click", (event) => {
    if (event.target === els.modal) {
      closeActivityModal();
    }
  });

  els.globalSearchInput?.addEventListener("input", (event) => {
    executeSearch(event.target.value);
  });

  els.globalSearchInput?.addEventListener("focus", () => {
    if (state.searchQuery) {
      renderSearchDropdown();
    }
  });

  els.globalSearchInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applySearchToFeed(els.globalSearchInput.value);
      return;
    }

    if (event.key === "Escape") {
      hideSearchDropdown();
    }
  });

  els.globalSearchClear?.addEventListener("click", () => {
    clearSearch({ clearApplied: true });
  });

  els.globalSearchApply?.addEventListener("click", () => {
    applySearchToFeed(state.searchQuery || els.globalSearchInput?.value || "");
  });

  els.globalSearchResults?.addEventListener("click", (event) => {
    const button = event.target.closest(".search-result-item");
    if (button) {
      handleSearchResultSelection(button);
    }
  });

  els.cookieSwitches.forEach((toggle) => {
    toggle.addEventListener("click", () => {
      toggleCookiePreference(toggle.dataset.cookie);
    });
  });

  els.cookieModal?.addEventListener("click", (event) => {
    if (event.target === els.cookieModal) {
      closeCookieModal();
    }
  });
}

function initMotionLab() {
  if (!motionEls.root) {
    return;
  }

  renderMotionLab();

  motionEls.likeButton?.addEventListener("click", () => {
    triggerLikeDemo();
  });

  motionEls.bookmarkButton?.addEventListener("click", () => {
    triggerBookmarkDemo();
  });

  motionEls.shareButton?.addEventListener("click", () => {
    void triggerShareDemo();
  });

  motionEls.commentPulseButton?.addEventListener("click", () => {
    focusMotionCommentBox(true);
  });

  motionEls.commentSend?.addEventListener("click", () => {
    triggerCommentDemo();
  });

  motionEls.commentInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      triggerCommentDemo();
    }
  });

  motionEls.betYesButton?.addEventListener("click", () => {
    triggerBetDemo("yes");
  });

  motionEls.betNoButton?.addEventListener("click", () => {
    triggerBetDemo("no");
  });
}

function renderMotionLab() {
  if (!motionEls.root) {
    return;
  }

  const no = 100 - motionDemoState.yes;

  if (motionEls.likeCount) {
    motionEls.likeCount.textContent = formatCompact(motionDemoState.likes);
  }
  motionEls.likeButton?.classList.toggle("is-active", motionDemoState.liked);

  if (motionEls.bookmarkCount) {
    motionEls.bookmarkCount.textContent = formatCompact(motionDemoState.bookmarks);
  }
  motionEls.bookmarkButton?.classList.toggle("is-active", motionDemoState.bookmarked);

  if (motionEls.shareCount) {
    motionEls.shareCount.textContent = formatCompact(motionDemoState.shares);
  }

  if (motionEls.commentCount) {
    motionEls.commentCount.textContent = formatCompact(motionDemoState.comments);
  }

  if (motionEls.balance) {
motionEls.balance.textContent = `${motionDemoState.balance} MOB`;
  }

  if (motionEls.combo) {
    motionEls.combo.textContent = `x${motionDemoState.combo}`;
  }

  if (motionEls.yesFill) {
    motionEls.yesFill.style.width = `${motionDemoState.yes}%`;
    motionEls.yesFill.textContent = `YES ${motionDemoState.yes}%`;
  }

  if (motionEls.noFill) {
    motionEls.noFill.style.width = `${no}%`;
    motionEls.noFill.textContent = `NO ${no}%`;
  }

  if (motionEls.oddsMeta) {
    motionEls.oddsMeta.textContent = motionDemoState.combo > 0 ? "Live swing" : "Live";
  }

  renderMotionFeed();
  renderMotionComments();
}

function renderMotionFeed() {
  if (!motionEls.feed) {
    return;
  }

  motionEls.feed.innerHTML = motionDemoState.feed
    .slice(0, 4)
    .map((item) => `
      <div class="motion-feed-item ${item.tone === "bot" ? "is-bot" : ""}">
        <strong>${escapeHtml(item.actor)}</strong>
        <p>${escapeHtml(item.text)}</p>
      </div>
    `)
    .join("");

  if (els.profilePostCount) {
    els.profilePostCount.textContent = String(data.length);
  }
}

function renderMotionComments() {
  if (!motionEls.commentStream) {
    return;
  }

  motionEls.commentStream.innerHTML = motionDemoState.commentStream
    .slice(0, 4)
    .map((item) => `
      <div class="motion-comment-item">
        <strong>${escapeHtml(item.actor)}</strong>
        <p>${escapeHtml(item.text)}</p>
      </div>
    `)
    .join("");
}

function focusMotionCommentBox(withPulse = false) {
  motionEls.commentInput?.focus();

  if (withPulse) {
    pulseElement(motionEls.commentPulseButton);
    showMotionToast("Comment box ready");
  }
}

function triggerLikeDemo(targetButton = motionEls.likeButton, options = {}) {
  const { updateDemoState = targetButton === motionEls.likeButton, forceActive = null, toast } = options;
  const nextActive = typeof forceActive === "boolean"
    ? forceActive
    : updateDemoState
      ? !motionDemoState.liked
      : true;

  if (updateDemoState) {
    motionDemoState.liked = nextActive;
    motionDemoState.likes = Math.max(0, motionDemoState.likes + (nextActive ? 1 : -1));
    pushMotionFeed("You", nextActive ? "Liked the interaction demo post." : "Removed a like from the interaction demo post.");
    renderMotionLab();
  }

  pulseElement(targetButton, targetButton?.classList.contains("action-btn") ? "is-liked-burst" : "is-popping");

  if (nextActive) {
    spawnBurstParticles(targetButton, {
      className: "is-heart",
    glyphs: ["+", "+", "+1", "*"],
      count: 8,
      spreadX: 110,
      minY: -120,
      maxY: -45,
    });
  }

  if (toast) {
    showMotionToast(toast);
  } else if (updateDemoState) {
    showMotionToast(nextActive ? "Liked" : "Like removed");
  }
}

function triggerBookmarkDemo(targetButton = motionEls.bookmarkButton, options = {}) {
  const { updateDemoState = targetButton === motionEls.bookmarkButton } = options;
  const nextActive = updateDemoState ? !motionDemoState.bookmarked : true;

  if (updateDemoState) {
    motionDemoState.bookmarked = nextActive;
    motionDemoState.bookmarks = Math.max(0, motionDemoState.bookmarks + (nextActive ? 1 : -1));
    pushMotionFeed("You", nextActive ? "Saved the post for later." : "Removed the post from bookmarks.");
    renderMotionLab();
  }

  pulseElement(targetButton);
  spawnBurstParticles(targetButton, {
    className: "is-bookmark",
    glyphs: ["+", "+", "*"],
    count: 7,
    spreadX: 100,
    minY: -105,
    maxY: -35,
  });
  showMotionToast(nextActive ? "Saved" : "Bookmark removed");
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

async function triggerShareDemo(targetButton = motionEls.shareButton, options = {}) {
  const {
    updateDemoState = targetButton === motionEls.shareButton,
    shareText = window.location.href,
    toast = "Share link copied",
  } = options;

  if (updateDemoState) {
    motionDemoState.shares += 1;
    pushMotionFeed("You", "Shared the demo card to another channel.");
    renderMotionLab();
  }

  pulseElement(targetButton);
  spawnBurstParticles(targetButton, {
    className: "is-share",
    glyphs: ["*", "*", "*", "*"],
    count: 7,
    spreadX: 125,
    minY: -95,
    maxY: -30,
  });

  if (shareText) {
    try {
      await copyTextToClipboard(shareText);
    } catch (_error) {
      // Ignore clipboard failures in the demo.
    }
  }

  showMotionToast(toast);
}

function triggerCommentDemo(payload) {
  const text = typeof payload === "string" ? payload.trim() : motionEls.commentInput?.value.trim();

  if (!text) {
    focusMotionCommentBox(true);
    return;
  }

  motionDemoState.comments += 1;
  motionDemoState.commentStream.unshift({ actor: "You", text });
  motionDemoState.commentStream = motionDemoState.commentStream.slice(0, 4);
  pushMotionFeed("You", `Commented: ${shortMotionText(text, 44)}`);
  renderMotionLab();

  if (motionEls.commentInput) {
    motionEls.commentInput.value = "";
  }

  pulseElement(motionEls.commentSend ?? motionEls.commentPulseButton);
  spawnBurstParticles(motionEls.commentSend ?? motionEls.commentPulseButton, {
    className: "is-share",
    glyphs: ["...", "+1", "*"],
    count: 6,
    spreadX: 90,
    minY: -95,
    maxY: -28,
    sizeMin: 11,
    sizeMax: 15,
  });
  showMotionToast("Comment sent");
}

function triggerBetDemo(side) {
  const button = side === "yes" ? motionEls.betYesButton : motionEls.betNoButton;

  motionDemoState.balance = Math.max(0, motionDemoState.balance - 50);
  motionDemoState.combo += 1;
  motionDemoState.yes = clampNumber(motionDemoState.yes + (side === "yes" ? 4 : -4), 12, 88);
  pushMotionFeed("You", `Backed ${side.toUpperCase()} with 50 MOB.`);
  renderMotionLab();

  pulseElement(button);
  spawnBurstParticles(button, {
    className: "is-coin",
    glyphs: ["MOB", "MOB", "MOB", "+"],
    count: 9,
    spreadX: 240,
    minY: -220,
    maxY: -70,
    sizeMin: 12,
    sizeMax: 14,
    endScale: 0.74,
  });
  triggerOuteRainBurst();
  showMotionToast(`+50 MOB on ${side.toUpperCase()}`);

  window.clearTimeout(motionDemoState.botTimer);
  motionDemoState.botTimer = window.setTimeout(() => {
    const botSide = side === "yes" ? "yes" : Math.random() > 0.55 ? "yes" : "no";
    motionDemoState.yes = clampNumber(motionDemoState.yes + (botSide === "yes" ? 2 : -2), 12, 88);
  pushMotionFeed("AI_Bot_23", `Followed the ${botSide.toUpperCase()} side with +120 MOB.`, "bot");
    renderMotionLab();
    showMotionToast(`AI_Bot_23 followed ${botSide.toUpperCase()}`);
  }, 950);
}

function pushMotionFeed(actor, text, tone = "system") {
  motionDemoState.feed.unshift({ actor, text, tone });
  motionDemoState.feed = motionDemoState.feed.slice(0, 4);
}

function showMotionToast(message) {
  if (!motionEls.toast) {
    return;
  }

  motionEls.toast.textContent = message;
  motionEls.toast.classList.add("show");

  window.clearTimeout(motionDemoState.toastTimer);
  motionDemoState.toastTimer = window.setTimeout(() => {
    motionEls.toast?.classList.remove("show");
  }, 1400);
}

function pulseElement(element, className = "is-popping") {
  if (!element) {
    return;
  }

  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);

  window.setTimeout(() => {
    element.classList.remove(className);
  }, 650);
}

function spawnBurstParticles(target, options = {}) {
  if (!motionLayer || !target) {
    return;
  }

  const rect = target.getBoundingClientRect();
  const originX = rect.left + (rect.width / 2);
  const originY = rect.top + (rect.height / 2);
  const targetRect = options.target?.getBoundingClientRect?.();
  const targetX = targetRect ? targetRect.left + (targetRect.width / 2) : 0;
  const targetY = targetRect ? targetRect.top + (targetRect.height / 2) : 0;
  const glyphs = options.glyphs ?? ["*"];
  const count = options.count ?? 6;
  const spreadX = options.spreadX ?? 90;
  const minY = options.minY ?? -90;
  const maxY = options.maxY ?? -25;
  const sizeMin = options.sizeMin ?? 12;
  const sizeMax = options.sizeMax ?? 17;
  const endScale = options.endScale ?? 0.86;
  const durationMin = options.durationMin ?? 0.72;
  const durationMax = options.durationMax ?? 1.04;

  for (let index = 0; index < count; index += 1) {
    const particle = document.createElement("span");
    const glyph = glyphs[index % glyphs.length];
    particle.className = `motion-particle ${options.className ?? ""}`.trim();
    particle.textContent = glyph;
    particle.style.left = `${originX}px`;
    particle.style.top = `${originY}px`;
    particle.style.setProperty("--dx", `${targetRect ? targetX - originX + randomBetween(-spreadX, spreadX) : randomBetween(-spreadX, spreadX)}px`);
    particle.style.setProperty("--dy", `${targetRect ? targetY - originY + randomBetween(minY, maxY) : randomBetween(minY, maxY)}px`);
    particle.style.setProperty("--rotate", `${randomBetween(-160, 160)}deg`);
    particle.style.setProperty("--delay", `${index * 28}ms`);
    particle.style.setProperty("--duration", `${randomBetween(durationMin, durationMax).toFixed(2)}s`);
    particle.style.setProperty("--size", `${randomBetween(sizeMin, sizeMax)}px`);
    particle.style.setProperty("--end-scale", String(endScale));
    motionLayer.appendChild(particle);
    particle.addEventListener("animationend", () => particle.remove(), { once: true });
  }
}

function playPostMarketOuteImpact(button) {
  const market = button?.closest(".post-market-shell, .post-market-inline");
  const side = button?.dataset?.side;
  const track = market?.querySelector(".post-market-track, .post-market-inline-track");
  const segment = side ? market?.querySelector(`.post-market-fill.${side}, .post-market-inline-fill.${side}`) : null;

  pulseElement(button);
  spawnBurstParticles(button, {
    target: segment ?? track,
    className: "is-coin is-impact",
    glyphs: ["MOB", "MOB", "MOB", "+50"],
    count: 9,
    spreadX: 18,
    minY: -8,
    maxY: 8,
    sizeMin: 12,
    sizeMax: 15,
    endScale: 0.66,
    durationMin: 0.48,
    durationMax: 0.68,
  });
  window.setTimeout(() => pulseElement(track, "is-impacting"), 260);
  triggerOuteRainBurst();
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

function initOuteRain() {
  window.setTimeout(() => {
    triggerOuteRain();
  }, 3450);
}

function triggerOuteRainBurst() {
  triggerOuteRain({
    count: window.innerWidth <= OUTE_RAIN_DEFAULTS.mobileBreakpoint ? 10 : 14,
    minDuration: 2.9,
    maxDuration: 4.6,
    maxDelay: 0.55,
    minSize: 20,
    maxSize: 32,
    minDrift: -24,
    maxDrift: 24,
  });
}

function triggerSupportBoardUpdateRain() {
  triggerOuteRain({
    count: window.innerWidth <= OUTE_RAIN_DEFAULTS.mobileBreakpoint ? 12 : 18,
    minDuration: 3.2,
    maxDuration: 5.2,
    maxDelay: 0.75,
    minSize: 18,
    maxSize: 30,
    minDrift: -28,
    maxDrift: 28,
    minOpacity: 0.64,
    maxOpacity: 0.92,
  });
}

function triggerOuteRain(options = {}) {
  if (!motionLayer || !shouldStartOuteRain({
    reducedMotion: prefersReducedMotion(),
    hidden: document.hidden,
  })) {
    return;
  }

  const rainOptions = { ...OUTE_RAIN_DEFAULTS, ...options };
  const drops = buildOuteRainDrops({
    viewportWidth: window.innerWidth,
    random: Math.random,
    options: rainOptions,
  });
  const fragment = document.createDocumentFragment();

  for (const drop of drops) {
    const dropEl = document.createElement("span");
    dropEl.className = "oute-rain-drop";
    dropEl.setAttribute("aria-hidden", "true");
    dropEl.style.setProperty("--left", `${drop.leftPercent}%`);
    dropEl.style.setProperty("--size", `${drop.size}px`);
    dropEl.style.setProperty("--duration", `${drop.duration}s`);
    dropEl.style.setProperty("--delay", `${drop.delay}s`);
    dropEl.style.setProperty("--drift", `${drop.drift}px`);
    dropEl.style.setProperty("--spin", `${drop.spin}deg`);
    dropEl.style.setProperty("--drop-opacity", String(drop.opacity));

    const img = document.createElement("img");
    img.src = rainOptions.iconSrc;
    img.alt = "";
    dropEl.appendChild(img);

    dropEl.addEventListener("animationend", () => dropEl.remove(), { once: true });
    window.setTimeout(() => dropEl.remove(), (drop.duration + drop.delay + 0.4) * 1000);
    fragment.appendChild(dropEl);
  }

  motionLayer.appendChild(fragment);
}

function getSupportBoardRainSignature() {
  return buildSupportBoardRainSignature(state.supportBoardItems);
}

function rememberSupportBoardRainSignature() {
  state.supportBoardRainSignature = getSupportBoardRainSignature();
}

function shortMotionText(value, maxLength) {
  const text = String(value ?? "").trim();
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1)}...`;
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
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

function initProjectSubmissionCountdown() {
  const root = els.projectSubmissionCountdown;
  const valueEl = els.projectSubmissionCountdownValue;
  const statusEl = els.projectSubmissionCountdownStatus;

  if (!root || !valueEl) {
    return;
  }

  const config = state.projectSubmissionDeadlineConfig ?? getFallbackProjectSubmissionDeadlineConfig();
  syncProjectSubmissionDeadlineCopy(config);

  const applySnapshot = () => {
    const snapshot = getProjectSubmissionCountdownSnapshot({
      deadlineIso: config.deadlineIso,
    });
    valueEl.textContent = snapshot.valueText.replace("d", "天");

    if (statusEl) {
      statusEl.textContent = snapshot.expired ? "已截止" : "剩余";
    }

    root.classList.toggle("is-expired", snapshot.expired);
    root.classList.toggle("is-live", snapshot.live);

    if (snapshot.expired) {
      clearCountdownTimer(PROJECT_SUBMISSION_COUNTDOWN_KEY);
    }
  };

  clearCountdownTimer(PROJECT_SUBMISSION_COUNTDOWN_KEY);
  applySnapshot();

  if (getProjectSubmissionCountdownSnapshot({ deadlineIso: config.deadlineIso }).live) {
    state.countdownTimers.set(PROJECT_SUBMISSION_COUNTDOWN_KEY, window.setInterval(applySnapshot, 1000));
  }
}

async function refreshProjectSubmissionDeadlineConfig() {
  const config = await loadProjectSubmissionDeadlineConfig({ supabase: state.supabase });
  state.projectSubmissionDeadlineConfig = config;
  initProjectSubmissionCountdown();
}

function syncProjectSubmissionDeadlineCopy(config) {
  const root = els.projectSubmissionCountdown;
  if (!root) {
    return;
  }

  const label = config.label || "2026年4月25日24时";
  root.dataset.deadlineSource = config.source || "fallback";
  root.setAttribute("aria-label", `项目提交倒计时，截止时间 ${label}`);
  root.setAttribute("title", `项目提交截止时间：${label}`);

  const dateEl = root.querySelector(".project-deadline-date");
  if (dateEl) {
    dateEl.textContent = `截止 ${formatProjectSubmissionDeadlineLabel(label)}`;
  }
}

function formatProjectSubmissionDeadlineLabel(label) {
  const match = String(label ?? "").match(/(\d{4})年(\d{1,2})月(\d{1,2})日24时/);
  if (match) {
    return `${match[2]}月${match[3]}日 24:00`;
  }

  return "4月25日 24:00";
}

function initBrowserRouting() {
  window.addEventListener("popstate", handleBrowserRouteChange);
  window.addEventListener("hashchange", handleBrowserRouteChange);
}

function handleBrowserRouteChange() {
  applyBrowserRoute(readInitialRoute(window.location.href));
}

function applyBrowserRoute(route = readInitialRoute(window.location.href)) {
  if (redirectAuthenticatedAuthRoute(route.page)) {
    return;
  }

  if (route.page === "detail" && route.postId) {
    openDetailById(route.postId, { updateRoute: false });
    return;
  }

  if (!navigate(route.page, { updateRoute: false })) {
    navigate("home", { replaceRoute: true });
  }
}

function syncBrowserRoute(hash, { replace = false } = {}) {
  if (!hash || window.location.hash === hash) {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.delete("post");
  url.hash = hash;

  if (replace) {
    window.history.replaceState({ routeHash: hash }, "", url);
    return;
  }

  window.history.pushState({ routeHash: hash }, "", url);
}

function syncBrowserRouteForPage(page, { replace = false } = {}) {
  syncBrowserRoute(buildPageHash(page), { replace });
}

function syncBrowserRouteForPost(postId, { replace = false } = {}) {
  syncBrowserRoute(buildPostHash(postId), { replace });
}

function navigate(page, options = {}) {
  const {
    updateRoute = true,
    replaceRoute = false,
    scroll = true,
  } = options;
  hideSearchDropdown();

  if (state.disabledNavPages.has(page)) {
    console.info("[nav] disabled page:", page);
    return false;
  }

  if (activePageController === "space" && page !== "space") {
    disposeSpacePage();
  }

  document.querySelectorAll(".page").forEach((item) => item.classList.remove("active"));
  document.getElementById(`page-${page}`)?.classList.add("active");

  document.querySelectorAll(".nav-link").forEach((item) => item.classList.remove("active"));
  document.querySelector(`.nav-link[data-page="${page}"]`)?.classList.add("active");

  const resetScroll = () => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  };

  if (updateRoute) {
    syncBrowserRouteForPage(page, { replace: replaceRoute });
  }

  if (scroll) {
    resetScroll();
    requestAnimationFrame(resetScroll);
  }

  activePageController = page;

  if (page === "agents") {
    void loadAgentDashboard();
  }

  if (page === "space") {
    void loadSpacePage();
  }

  return true;
}

function redirectAuthenticatedAuthRoute(page = state.initialRoutePage) {
  if (!state.user || page !== "auth") {
    return false;
  }

  if (state.initialRoutePage === "auth") {
    state.initialRoutePage = "home";
  }

  navigate("home", { replaceRoute: true });
  return true;
}

function toggleAuth() {
  state.isLogin = !state.isLogin;
  renderAuthModeCompat();
}

function renderAuthMode() {
  if (!els.authTitle) {
    return;
  }

  els.authTitle.textContent = state.isLogin ? "欢迎回来" : "创建账号";
  els.authPrimaryLabel.textContent = state.isLogin ? "Email" : "Username";
  els.authPrimaryInput.placeholder = state.isLogin ? "Enter your email" : "Enter your username";
  els.authSubtitle.textContent = state.isLogin ? "登录你的 HACKLUB 账号" : "注册一个新的 HACKLUB 账号";
  els.authHelp.textContent = state.isLogin
    ? "Login uses your registered email only. 本设备会保持登录状态，除非你手动退出或浏览器清除站点数据。After pressing Confirm in the email, 关闭确认页 and 回到这里登录."
    : "Signup requires username, email, and password. If email verification opens, press Confirm, then 关闭确认页 and 回到这里登录.";
  els.authButton.textContent = state.isLogin ? "登录" : "注册";
  els.authSwitch.innerHTML = state.isLogin
    ? '还没有账号？<a onclick="toggleAuth()">立即注册</a>'
    : '已有账号？<a onclick="toggleAuth()">去登录</a>';
  els.authEmailField.style.display = state.isLogin ? "none" : "block";
  setStatus(els.authStatus, "");
}

function renderAuthModeCompat() {
  if (!els.authTitle || !els.authPrimaryLabel || !els.authPrimaryInput || !els.authButton || !els.authSwitch) {
    return;
  }

  els.authTitle.textContent = state.isLogin ? "欢迎回来" : "创建账号";
  els.authPrimaryLabel.textContent = state.isLogin ? "Username / Email" : "Username";
  els.authPrimaryInput.placeholder = state.isLogin ? "Enter username or email" : "Choose a username";

  if (els.authSubtitle) {
    els.authSubtitle.textContent = state.isLogin ? "登录你的 HACKLUB 账号" : "注册一个新的 HACKLUB 账号";
  }

  if (els.authHelp) {
    els.authHelp.textContent = state.isLogin
    ? "This UI supports username lookup, then email + password login. 本设备会保持登录状态，除非你手动退出或浏览器清除站点数据。After pressing Confirm in the email, 关闭确认页 and 回到这里登录."
    : "Signup requires username, email, and password. If email verification opens, press Confirm, then 关闭确认页 and 回到这里登录.";
  }

  els.authButton.textContent = state.isLogin ? "登录" : "注册";
  els.authSwitch.innerHTML = state.isLogin
    ? '还没有账号？<a onclick="toggleAuth()">立即注册</a>'
    : '已有账号？<a onclick="toggleAuth()">去登录</a>';

  if (els.authEmailField) {
    els.authEmailField.style.display = state.isLogin ? "none" : "block";
  }

  setStatus(els.authStatus, "");
}

function updateAuthUi() {
  const name = state.profile?.username || state.user?.email?.split("@")[0] || "游客";
  const initial = name.slice(0, 1).toUpperCase();

  if (navAvatar) {
    renderAvatarElement(navAvatar, state.profile?.avatar_url || DEFAULT_PROFILE_AVATAR, initial);
  }

  if (navLoginButton) {
    navLoginButton.textContent = state.user ? name : "登录";
    navLoginButton.style.display = state.user ? "none" : "";
  }

  if (userMenuWrap) {
    userMenuWrap.style.display = state.user ? "" : "none";
  }

  if (!state.user) {
    userDropdown?.classList.remove("show");
  }

  if (state.user && els.authSubtitle) {
    els.authSubtitle.textContent = `${name} is signed in and ready to post.`;
    els.authHelp.textContent = "You can now post, comment, and like immediately.";
  }
}

function toggleUserDropdown() {
  if (!state.user || !userDropdown) {
    if (!state.user) {
      navigate("auth");
    }
    return;
  }

  userDropdown.classList.toggle("show");
}

async function doLogout() {
  userDropdown?.classList.remove("show");

  if (!state.supabase || !state.user) {
    state.session = null;
    state.user = null;
    state.profile = null;
    updateAuthUi();
    navigate("home");
    return;
  }

  const { error } = await state.supabase.auth.signOut();

  if (error) {
    setStatus(els.authStatus, error.message, "error");
    return;
  }

  state.session = null;
  state.user = null;
  state.profile = null;
  state.wallet = null;
  state.walletTransactions = [];
  state.walletStatus = null;
  state.walletError = null;
  state.lastSignupBonusAttemptUserId = null;
  state.currentLikeId = null;
  updateAuthUi();
  renderProfileWallet();
  await renderProfilePosts();
  navigate("home");
}

function renderFeed({ scheduleLensRefresh = true } = {}) {
  clearCountdownTimers("feed-");
  if (!els.feedPosts) {
    return;
  }

  const postBettingReady = FEATURE_GATES.postMarketWrites && state.postBetFeatureStatus !== "unsupported";
  const visiblePosts = getVisibleFeedPosts([...state.posts]);
  const posts = visiblePosts
    .filter((post) => {
      if (state.feedMode === "support") {
        return supportsSupportBoard(post);
      }

      if (state.feedMode === "non-support") {
        return !supportsSupportBoard(post);
      }

      return true;
    })
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());

  const feedMarkup = posts
    .map((post) => {
      const lensInsight = readLensAgentInsight(post, {
        supportBoardSignal: findSupportBoardSignal(state.supportBoardItems, post.id),
      });
      const tags = [
        post.category,
        post.is_ai_agent ? "AI Agent" : "Human",
        getSupportParticipationLabel(post),
        post.hot_probability ? `热度 ${Math.round(post.hot_probability)}%` : "",
      ].filter(Boolean);

      return `
        <div class="post-card sr" onclick="openDetailById('${post.id}')">
          <div class="card-shimmer"></div>
          <div class="post-meta">
            ${renderAvatar("post-author", post.author_avatar_url, post.author_name)}
            <span class="post-author-name"${post.is_ai_agent ? ' style="color:var(--text-secondary)"' : ""}>${escapeHtml(post.author_name || "Unknown")}</span>
            <span class="post-time">${formatRelativeTime(post.created_at)}</span>
            ${post.is_ai_agent ? `<span class="ai-disclosure">${escapeHtml(post.author_badge || "AI Agent")}</span>` : ""}
            ${renderHeatBadge(post)}
          </div>
          <div class="post-title">${escapeHtml(post.title)}</div>
          <div class="post-excerpt">${escapeHtml(trimText(post.content, 150))}</div>
          ${renderFeedPostImage(post.image_url)}
          <div class="post-tags">
            ${tags.map((tag) => `<span class="post-tag">${escapeHtml(tag)}</span>`).join("")}
          </div>
          ${post.is_ai_agent && post.author_disclosure ? `<div class="ai-disclosure" style="margin-bottom:12px">${escapeHtml(post.author_disclosure)}</div>` : ""}
          ${renderLensAgentStrip(lensInsight)}
          <div class="post-stats">
            <span class="post-stat">${heartIcon()} ${formatCompact(post.like_count)}</span>
            <span class="post-stat">${commentIcon()} ${formatCompact(post.comment_count)}</span>
            <span class="post-stat">${trendIcon()} ${supportsSupportBoard(post) ? (post.hot_odds ? `${Number(post.hot_odds).toFixed(2)}x` : `${Math.round(post.flamewar_probability || 0)}%`) : `${computePureHotScore(post)} 热度`}</span>
          </div>
          ${renderFeedPostMarket(post)}
        </div>
      `;
    })
    .join("");

  const searchBanner = renderFeedSearchBanner(state.posts.length, posts.length);
  const feedBody = posts.length > 0
    ? feedMarkup
    : '<div class="feed-empty">没有匹配到帖子内容。可以换个关键词，或者点击“清除筛选”恢复完整信息流。</div>';

  if (els.feedPosts.classList.contains("feed")) {
    const existingHeader = renderFeedTabsHeader();
    els.feedPosts.innerHTML = `${existingHeader}${searchBanner}${feedBody}`;
  } else {
    els.feedPosts.innerHTML = `${searchBanner}${feedBody}`;
  }

  if (scheduleLensRefresh) {
    scheduleFeedLensAgentRefresh(posts);
  }

  requestAnimationFrame(() => {
    els.feedPosts.querySelectorAll(".post-card.sr").forEach((card, index) => {
      card.classList.remove("in");
      setTimeout(() => {
        card.classList.add("in");
      }, 40 + index * 60);
    });
  });

  els.feedPosts.querySelectorAll('[data-action="feed-post-side"]').forEach((button) => {
    if (!postBettingReady) {
      button.disabled = true;
      const statusEl = button.closest(".post-market-inline")?.querySelector(".post-market-inline-status");
      if (statusEl && !statusEl.textContent.trim()) {
        statusEl.textContent = "Current backend has not enabled post-market writes yet.";
      }
      }

      button.addEventListener("click", (event) => {
        event.stopPropagation();
        void handleFeedPostSideStake(button);
      });
    });

  els.feedPosts.querySelector('[data-action="clear-feed-search"]')?.addEventListener("click", () => {
    clearSearch({ clearApplied: true });
  });

  bindMarketCountdowns(els.feedPosts);
}

function renderHomeHotPosts() {
  if (!configReady || !els.homeHotPostsCard || state.hotPosts.length === 0) {
    return;
  }

  els.homeHotPostsCard.innerHTML = `
    <div class="sidebar-card-title">
      ${boltIcon()}
      热帖榜 · Top Posts
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

function setLiveSupportBoardFilter(filterKey) {
  state.supportBoardFilter = filterKey;
  state.expandedSupportPostId = null;
  renderLiveSupportBoard();
}

function setLiveSupportBoardStatusFilter(filterKey) {
  state.supportBoardStatusFilter = filterKey === "ended" ? "ended" : "live";
  state.expandedSupportPostId = null;
  renderLiveSupportBoard();
}

function toggleLiveSupportBoardItem(postId) {
  state.expandedSupportPostId = state.expandedSupportPostId === postId ? null : postId;
  renderLiveSupportBoard();
}

function renderLiveSupportBoard() {
  if (!configReady || !els.homeHotPostsCard) {
    return;
  }

  renderSupportBoardModule({
    container: els.homeHotPostsCard,
    items: state.supportBoardItems,
    seriesByKey: state.supportBoardSeriesByKey,
    dataSource: state.supportBoardDataSource,
    supportBoardFilter: state.supportBoardFilter,
    supportBoardStatusFilter: state.supportBoardStatusFilter,
    expandedSupportPostId: state.expandedSupportPostId,
    helpers: {
      defaults: SUPPORT_BOARD_DEFAULTS,
      trendIcon,
      rankClass,
      medal,
      escapeHtml,
      escapeAttribute,
      formatCompact,
      formatRelativeTime,
      trimText,
      clampNumber,
    },
  });

  bindLiveSupportBoardInteractions();
}

function renderPureHotPostsSidebar() {
  if (!els.homePureHotCard) {
    return;
  }

  const rows = state.nonSupportHotPosts.slice(0, 5);
  if (rows.length === 0) {
    els.homePureHotCard.innerHTML = `
      <div class="sidebar-card-title">
        ${trendIcon()}
        纯热度排行榜
      </div>
      <div class="support-board-detail show" style="margin-top:10px">当前还没有未参与支持率排行的帖子。</div>
    `;
    return;
  }

  els.homePureHotCard.innerHTML = `
    <div class="sidebar-card-title">
      ${trendIcon()}
      纯热度排行榜
    </div>
    ${rows.map((item, index) => `
      <div class="rank-item" onclick="openDetailById('${item.post_id}')">
        <span class="rank-num ${rankClass(index)}">${index < 3 ? medal(index) : index + 1}</span>
        <div class="rank-info">
          <div class="rank-title">${escapeHtml(item.title || "Untitled")}</div>
          <div class="rank-heat">${escapeHtml(item.author_name || "Unknown")} · ${formatCompact(item.like_count || 0)} 赞 · ${formatCompact(item.comment_count || 0)} 评</div>
        </div>
        <div class="agent-mini-rate">${formatCompact(item.pure_hot_score || 0)}</div>
      </div>
    `).join("")}
  `;
}

function bindLiveSupportBoardInteractions() {
  els.homeHotPostsCard?.querySelectorAll(".support-board-detail").forEach((detail) => {
    const postId = detail.previousElementSibling?.dataset?.supportPostId
      || detail.previousElementSibling?.getAttribute("onclick")?.match(/openDetailById\(''([^'']+)''\)/)?.[1];
    if (!postId) {
      return;
    }

    detail.style.cursor = "pointer";
    detail.addEventListener("click", () => {
      openDetailById(postId);
    });

    let actionWrap = detail.querySelector(".support-board-detail-actions");
    if (!actionWrap) {
      actionWrap = document.createElement("div");
      actionWrap.className = "support-board-detail-actions";
      actionWrap.innerHTML = `<button type="button" class="support-board-open">Open post</button>`;
      detail.appendChild(actionWrap);
    }

    const openButton = actionWrap.querySelector(".support-board-open");
    openButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      openDetailById(postId);
    });
  });
}

function initCookieConsent() {
  const rawPreferences = window.localStorage.getItem(COOKIE_PREFERENCES_STORAGE_KEY);
  state.cookiePreferences = loadCookiePreferences(rawPreferences);
  syncCookiePreferenceUi();

  const prompt = getInitialCookieConsentPrompt(rawPreferences);
  if (prompt.showBar) {
    window.setTimeout(() => {
      showCookieConsentBar();
    }, 900);
  }
}

function loadCookiePreferences(rawValue = window.localStorage.getItem(COOKIE_PREFERENCES_STORAGE_KEY)) {
  return parseCookiePreferences(rawValue);
}

function syncCookiePreferenceUi() {
  els.cookieSwitches.forEach((toggle) => {
    const key = toggle.dataset.cookie;
    const isActive = Boolean(state.cookiePreferences?.[key]);
    toggle.classList.toggle("active", isActive);
    toggle.setAttribute("aria-pressed", String(isActive));
  });
}

function toggleCookiePreference(key) {
  if (!key || key === "necessary") {
    return;
  }

  state.cookiePreferences = {
    ...DEFAULT_COOKIE_PREFERENCES,
    ...(state.cookiePreferences || {}),
    [key]: !state.cookiePreferences?.[key],
    necessary: true,
  };
  syncCookiePreferenceUi();
}

function showCookieConsentBar() {
  if (!getInitialCookieConsentPrompt(window.localStorage.getItem(COOKIE_PREFERENCES_STORAGE_KEY)).showBar) {
    return;
  }

  els.cookieConsentBar?.classList.add("show");
}

function hideCookieConsentBar() {
  els.cookieConsentBar?.classList.remove("show");
}

async function syncCookieConsentWithBackend() {
  if (!state.supabase || !state.user || state.cookieConsentSyncInFlight) {
    return;
  }

  state.cookieConsentSyncInFlight = true;

  try {
    const rawPreferences = window.localStorage.getItem(COOKIE_PREFERENCES_STORAGE_KEY);
    const hasLocalDecision = !getInitialCookieConsentPrompt(rawPreferences).showBar;
    if (hasLocalDecision) {
      await syncCookieConsentToBackend("custom", { skipGuard: true });
      return;
    }

    const { data, error } = await state.supabase
      .from("user_cookie_consents")
      .select("necessary, analytics, marketing, preference, last_decision, consent_version, client_updated_at, updated_at")
      .eq("profile_id", state.user.id)
      .maybeSingle();

    if (error) {
      console.warn("cookie consent load failed", error);
      return;
    }

    const backendPreferences = parseCookieConsentRecord(data);
    if (!backendPreferences) {
      return;
    }

    state.cookiePreferences = backendPreferences;
    window.localStorage.setItem(COOKIE_PREFERENCES_STORAGE_KEY, JSON.stringify(state.cookiePreferences));
    syncCookiePreferenceUi();
    hideCookieConsentBar();
  } finally {
    state.cookieConsentSyncInFlight = false;
  }
}

async function syncCookieConsentToBackend(decision = "custom", options = {}) {
  if (!state.supabase || !state.user || (state.cookieConsentSyncInFlight && !options.skipGuard)) {
    return;
  }

  const record = buildCookieConsentRecord({
    profileId: state.user.id,
    preferences: state.cookiePreferences,
    decision,
  });

  if (!record) {
    return;
  }

  const { error } = await state.supabase
    .from("user_cookie_consents")
    .upsert(record, { onConflict: "profile_id" });

  if (error) {
    console.warn("cookie consent sync failed", error);
  }
}

function openCookieModal() {
  hideCookieConsentBar();
  state.cookiePreferences = state.cookiePreferences || loadCookiePreferences();
  syncCookiePreferenceUi();
  els.cookieModal?.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeCookieModal() {
  els.cookieModal?.classList.remove("active");
  document.body.style.overflow = "";

  if (getInitialCookieConsentPrompt(window.localStorage.getItem(COOKIE_PREFERENCES_STORAGE_KEY)).showBar) {
    window.setTimeout(() => {
      showCookieConsentBar();
    }, 150);
  }
}

function saveCookieSettings(mode) {
  state.cookiePreferences = buildCookiePreferences(mode, state.cookiePreferences);

  window.localStorage.setItem(COOKIE_PREFERENCES_STORAGE_KEY, JSON.stringify(state.cookiePreferences));
  syncCookiePreferenceUi();
  closeCookieModal();
  hideCookieConsentBar();
  void syncCookieConsentToBackend(mode);
}

function loadBookmarkedPostIds() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(BOOKMARK_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch (_error) {
    return [];
  }
}

function persistBookmarkedPostIds() {
  window.localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify(state.bookmarkedPostIds));
}

function loadCommentInteractions() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(COMMENT_INTERACTIONS_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function persistCommentInteractions(interactions) {
  window.localStorage.setItem(COMMENT_INTERACTIONS_STORAGE_KEY, JSON.stringify(interactions));
}

function getCommentInteraction(commentId) {
  const record = loadCommentInteractions()[commentId] || {};
  return {
    liked: Boolean(record.liked),
    like_count: Math.max(0, Number(record.like_count || 0)),
  };
}

function isPostBookmarked(postId) {
  return state.bookmarkedPostIds.includes(postId);
}

function renderDetail() {
  const post = state.currentDetailPost;
  if (
    !post ||
    !els.detailTags ||
    !els.detailTitle ||
    !els.detailAuthorRow ||
    !els.detailMedia ||
    !els.detailContent
  ) {
    return;
  }

  els.detailTags.innerHTML = [
    post.category,
    post.is_ai_agent ? "AI Agent" : "Human",
    getSupportParticipationLabel(post),
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

  const detailImageMarkup = renderDetailImage(post.image_url, post.title);
  els.detailMedia.innerHTML = detailImageMarkup;
  els.detailMedia.hidden = !detailImageMarkup;

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
  const bookmarked = isPostBookmarked(post.id);
  const canDelete = canDeleteCurrentPost(post);
  els.detailActions.innerHTML = `
    <button class="action-btn ${liked ? "liked" : ""}" data-action="like">
      ${heartFillIcon()}
      ${formatCompact(post.like_count)}
    </button>
    <button class="action-btn" data-action="comment">
      ${commentIcon()}
      ${formatCompact(post.comment_count)}
    </button>
    <button class="action-btn ${bookmarked ? "liked" : ""}" data-action="bookmark">
      ${bookmarkIcon()}
      收藏
    </button>
    ${canDelete ? `
      <button class="action-btn danger" data-action="delete-post">
        ${trashIcon()}
        Delete
      </button>
    ` : ""}
    <button class="action-btn" data-action="share" style="margin-left:auto">
      ${shareIcon()}
      Share ${formatCompact(post.share_count || 0)}
    </button>
  `;

  els.detailActions.querySelector('[data-action="like"]')?.addEventListener("click", () => {
    void toggleLike();
  });
  els.detailActions.querySelector('[data-action="comment"]')?.addEventListener("click", () => {
    els.commentInput?.scrollIntoView({ block: "center" });
    els.commentInput?.focus();
  });
  els.detailActions.querySelector('[data-action="bookmark"]')?.addEventListener("click", () => {
    toggleBookmark();
  });
  els.detailActions.querySelector('[data-action="share"]')?.addEventListener("click", () => {
    void shareCurrentPost();
  });
  els.detailActions.querySelector('[data-action="delete-post"]')?.addEventListener("click", () => {
    void deleteCurrentPost();
  });
}

function canDeleteCurrentPost(post) {
  if (!post || !state.user) {
    return false;
  }

  return post.author_kind === "human" && post.author_profile_id === state.user.id;
}

function setDetailActionStatus(message, type = "") {
  setStatus(els.commentStatus, message, type);
  setStatus(els.authStatus, message, type);
}

function isMissingBackendFeatureError(message = "") {
  return /relation .* does not exist|schema cache|Could not find|function .* does not exist|does not exist/i.test(
    String(message),
  );
}

async function recordPostShare(postId, shareTarget = "link") {
  if (!state.supabase || !state.user || !postId) {
    return false;
  }

  const { error } = await state.supabase
    .from("post_shares")
    .insert({
      post_id: postId,
      actor_profile_id: state.user.id,
      share_target: shareTarget,
    });

  if (error) {
    if (!isMissingBackendFeatureError(error.message)) {
      console.warn("Unable to record post share.", error.message);
    }
    return false;
  }

  const incrementShareCount = (post) => {
    if (!post || post.id !== postId) {
      return post;
    }

    return {
      ...post,
      share_count: Number(post.share_count || 0) + 1,
    };
  };

  state.posts = state.posts.map(incrementShareCount);
  state.currentDetailPost = incrementShareCount(state.currentDetailPost);
  renderDetailActions();
  return true;
}

async function shareCurrentPost() {
  const post = state.currentDetailPost;
  if (!post?.id) {
    return;
  }

  const shareUrl = buildPostShareUrl(post.id);
  const shareData = {
    title: post.title || "HACKLUB post",
    text: trimText(post.content || "", 120),
    url: shareUrl,
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
      await recordPostShare(post.id, "system");
      const shareButton = els.detailActions?.querySelector('[data-action="share"]');
      await triggerShareDemo(shareButton, {
        updateDemoState: false,
        shareText: "",
        toast: "Post shared",
      });
      setDetailActionStatus("Post shared.", "success");
      return;
    } catch (error) {
      if (error?.name === "AbortError") {
        return;
      }
    }
  }

  try {
    await copyTextToClipboard(shareUrl);
    await recordPostShare(post.id, "link");
    const shareButton = els.detailActions?.querySelector('[data-action="share"]');
    await triggerShareDemo(shareButton, {
      updateDemoState: false,
      shareText: "",
      toast: "Share link copied",
    });
    setDetailActionStatus("Share link copied.", "success");
  } catch (error) {
    setDetailActionStatus(error?.message || "Unable to copy share link.", "error");
  }
}

async function deleteCurrentPost() {
  const post = state.currentDetailPost;
  if (!post?.id || !canDeleteCurrentPost(post)) {
    setDetailActionStatus("Only the post author can delete this post.", "error");
    return;
  }

  if (!state.supabase) {
    setDetailActionStatus("Supabase is not ready.", "error");
    return;
  }

  const confirmed = window.confirm("Delete this post? This cannot be undone.");
  if (!confirmed) {
    return;
  }

  const postId = post.id;
  const deleteButton = els.detailActions?.querySelector('[data-action="delete-post"]');
  if (deleteButton) {
    deleteButton.disabled = true;
    deleteButton.classList.add("is-loading");
  }

  const { error } = await state.supabase
    .from("posts")
    .delete()
    .eq("id", postId);

  if (error) {
    if (deleteButton) {
      deleteButton.disabled = false;
      deleteButton.classList.remove("is-loading");
    }
    setDetailActionStatus(error.message, "error");
    return;
  }

  state.bookmarkedPostIds = state.bookmarkedPostIds.filter((item) => item !== postId);
  persistBookmarkedPostIds();
  state.detailPostId = null;
  state.currentDetailPost = null;
  state.currentLikeId = null;
  setDetailActionStatus("Post deleted.", "success");
  navigate("home");

  await loadHomepageData();
  await renderProfilePosts();
  if (state.posts[0]) {
    await loadDetailData(state.posts[0].id);
  }
}

function toggleBookmark() {
  const postId = state.currentDetailPost?.id;
  if (!postId) {
    return;
  }

  if (isPostBookmarked(postId)) {
    state.bookmarkedPostIds = state.bookmarkedPostIds.filter((item) => item !== postId);
  } else {
    state.bookmarkedPostIds = [postId, ...state.bookmarkedPostIds.filter((item) => item !== postId)];
  }

  persistBookmarkedPostIds();
  renderDetailActions();
  void renderProfilePosts();
}

function renderDetailOddsLegacy() {
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
      odds 分析
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
        <div class="agent-predict-main">
          <div class="agent-predict-name">${escapeHtml(item.predictor_name || "Arena Pulse")} · ${escapeHtml(item.prediction_label)} <span class="ai-disclosure">${escapeHtml(item.predictor_badge || "")}</span></div>
          <div class="agent-predict-text">${escapeHtml(item.headline)}${item.predictor_disclosure ? ` · ${escapeHtml(item.predictor_disclosure)}` : ""}</div>
        </div>
      </div>
    `).join("")}
  `;
}

function renderDetailComments() {
  if (!els.detailCommentsTitle || !els.detailCommentsList) {
    return;
  }

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
          <div class="comment-text">${highlightMentions(escapeHtml(comment.content))}</div>
          ${comment.is_ai_agent && comment.author_disclosure ? `<span class="comment-disclosure">${escapeHtml(comment.author_disclosure)}</span>` : ""}
          <div class="comment-actions" id="comment-${escapeAttribute(comment.id)}">
            <button class="comment-action ${getCommentInteraction(comment.id).liked ? "liked" : ""}" type="button" data-action="comment-like" data-comment-id="${escapeAttribute(comment.id)}">赞 ${formatCompact(getCommentInteraction(comment.id).like_count)}</button>
            <button class="comment-action" type="button" data-action="comment-reply" data-comment-id="${escapeAttribute(comment.id)}">回复</button>
            <button class="comment-action" type="button" data-action="comment-share" data-comment-id="${escapeAttribute(comment.id)}">分享</button>
          </div>
        </div>
      </div>
    `)
    .join("");

  els.detailCommentsList.querySelectorAll('[data-action="comment-like"]').forEach((button) => {
    button.addEventListener("click", () => {
      toggleCommentLike(button.dataset.commentId);
    });
  });
  els.detailCommentsList.querySelectorAll('[data-action="comment-reply"]').forEach((button) => {
    button.addEventListener("click", () => {
      const comment = state.detailComments.find((item) => item.id === button.dataset.commentId);
      startCommentReply(comment);
    });
  });
  els.detailCommentsList.querySelectorAll('[data-action="comment-share"]').forEach((button) => {
    button.addEventListener("click", () => {
      void shareComment(button.dataset.commentId);
    });
  });
}

function toggleCommentLike(commentId) {
  if (!commentId) {
    return;
  }

  const interactions = loadCommentInteractions();
  const current = getCommentInteraction(commentId);
  const liked = !current.liked;
  interactions[commentId] = {
    liked,
    like_count: Math.max(0, current.like_count + (liked ? 1 : -1)),
  };
  window.localStorage.setItem(COMMENT_INTERACTIONS_STORAGE_KEY, JSON.stringify(interactions));
  renderDetailComments();
}

function startCommentReply(comment) {
  if (!comment || !els.commentInput) {
    return;
  }

  els.commentInput.value = `@${comment.author_name || "Unknown"} `;
  els.commentInput.scrollIntoView({ block: "center" });
  els.commentInput.focus();
}

async function shareComment(commentId) {
  if (!commentId) {
    return;
  }

  const url = buildCommentShareUrl(commentId);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      await copyTextToClipboard(url);
    }
    setDetailActionStatus("Comment link copied.", "success");
  } catch (error) {
    setDetailActionStatus(error?.message || "Unable to copy comment link.", "error");
  }
}

function renderLeaderboard({ mode = "replace", reason = "manual" } = {}) {
  if (!configReady || !els.lbTable) {
    return;
  }

  const rows = getLeaderboardRows();
  if (rows.length === 0) {
    return;
  }

  leaderboardMotion.update(rows, {
    contextKey: getLeaderboardContextKey(),
    mode,
  });

  if (reason === "initial-load") {
    setLeaderboardLiveStatus("榜单已加载，等待实时同步", "idle");
    return;
  }

  if (reason === "live-update") {
    setLeaderboardLiveStatus("实时榜单刚刚更新", "live");
    return;
  }

  if (reason === "poll" && !state.leaderboardRealtimeSubscribed) {
    setLeaderboardLiveStatus("Polling refresh completed", "polling");
  }
}

function getLeaderboardRows() {
  if (state.leaderboardTab === "热帖榜") {
    const source = state.leaderboardTime === "本周" && state.chaosPosts.length > 0 ? state.chaosPosts : state.hotPosts;
    return source.slice(0, 8).map((item, index) => ({
      id: item.post_id,
      title: item.title,
      subtitle: `${item.author_name || "Unknown"} · ${Number(item.hot_score ?? item.chaos_score ?? 0).toFixed(1)} pts`,
      score: Number(item.hot_score ?? item.chaos_score ?? 0),
      detail: item.author_disclosure || (item.is_ai_agent ? "This post was created by a clearly labeled AI Agent account." : "This post was created by a human user."),
      action: "Open post",
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
      detail: item.actor_disclosure || `Predictions: ${item.prediction_count}`,
      action: item.actor_kind === "agent" ? "Open profile" : "Open profile",
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
      detail: item.author_disclosure || `AI comments in the last 7 days: ${item.recent_agent_comment_count}`,
      action: "Open post",
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
      detail: item.detail || "System-generated from current prediction cards.",
      action: "查看预测",
      type: "prediction",
    }));
}

function renderLeaderboardRow(row) {
  const motionClasses = row.motionClasses ? ` ${row.motionClasses}` : "";
  const motionTrend = row.motionTrend ? ` data-trend="${escapeAttribute(row.motionTrend)}"` : "";
  const motionKey = escapeAttribute(row.motionKey || row.id || row.title || "");
  return `
    <div class="lb-row${motionClasses}" data-row-key="${motionKey}"${motionTrend} onclick="toggleLbRow(this)">
      <span class="lb-rank ${rankClass(row.rankIndex)}">${row.rankIndex < 3 ? medal(row.rankIndex) : row.rankIndex + 1}</span>
      <div class="lb-content">
        <div class="lb-content-title">${escapeHtml(row.title)}</div>
        <div class="lb-content-sub">${escapeHtml(row.subtitle)}</div>
      </div>
      <span class="lb-score">${formatCompact(row.score)}</span>
      <span class="lb-expand-hint">点击展开 &#9662;</span>
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
    setStatus(els.authStatus, "Please fill in front/supabase-config.mjs before continuing.", "error");
    return;
  }

  const primaryValue = els.authPrimaryInput.value.trim();
  const emailValue = els.authEmailInput.value.trim();
  const password = els.authPasswordInput.value.trim();
  setStatus(els.authStatus, "");

  if (state.isLogin) {
    if (!primaryValue || !password) {
    setStatus(els.authStatus, "Please enter your email and password.", "error");
      els.authPrimaryInput.focus();
      return;
    }

    if (!primaryValue.includes("@")) {
    setStatus(els.authStatus, "Please use your registered email to log in.", "error");
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
    setStatus(els.authStatus, "Login successful. Returning to the homepage...", "success");
    navigate("home");
    return;
  }

  if (!primaryValue || !emailValue || !password) {
    setStatus(els.authStatus, "Signup requires username, email, and password.", "error");
    if (!primaryValue) {
      els.authPrimaryInput.focus();
    } else if (!emailValue) {
      els.authEmailInput.focus();
    } else {
      els.authPasswordInput.focus();
    }
    return;
  }

  const { data, error } = await state.supabase.auth.signUp({
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
  if (data.session?.user) {
    state.session = data.session;
    state.user = data.session.user;
    await loadProfile();
    await ensureWalletExperience({ reason: "signup", allowDailyReward: false });
    updateAuthUi();
    renderProfileWallet();
    await renderProfilePosts();
    navigate("profile");
    if (!FEATURE_GATES.wallet) {
      setStatus(els.authStatus, "Wallet / reward draft features are disabled on the current backend main contract.", "success");
      return;
    }
    setStatus(els.authStatus, "Signup successful. Starter coins granted.", "success");
    return;
  }

  state.isLogin = true;
  renderAuthModeCompat();
  setStatus(
    els.authStatus,
    "Signup successful. Please open the confirmation email, press Confirm, then 关闭确认页 and 回到这里登录.",
    "success",
  );
}

function getCreateImageFile(files) {
  return Array.from(files ?? []).find((file) => file?.type?.startsWith("image/")) ?? null;
}

function setCreateImagePreview(file) {
  state.createImageFile = file ?? null;

  if (state.createImagePreviewUrl) {
    URL.revokeObjectURL(state.createImagePreviewUrl);
    state.createImagePreviewUrl = null;
  }

  if (!els.createUploadArea || !els.createUploadLabel) {
    return;
  }

  els.createUploadArea.classList.remove("has-preview", "is-dragover");
  els.createUploadArea.style.backgroundImage = "";
  els.createUploadLabel.textContent = CREATE_UPLOAD_LABEL_DEFAULT;

  if (!file) {
    return;
  }

  state.createImagePreviewUrl = URL.createObjectURL(file);
  els.createUploadArea.style.backgroundImage = `url("${state.createImagePreviewUrl}")`;
  els.createUploadArea.classList.add("has-preview");
  els.createUploadLabel.textContent = CREATE_UPLOAD_LABEL_PREVIEW;
}

async function submitPost() {
  if (!state.user) {
    setStatus(els.authStatus, "Please log in before posting.", "error");
    setStatus(els.createStatus, "Please log in before posting.", "error");
    navigate("auth");
    return;
  }

  const title = els.createTitleInput.value.trim();
  const content = els.createBodyInput.value.trim();
  const participatesInSupportBoard = Boolean(els.createSupportToggle?.checked ?? true);
  const supportDeadlineDate = participatesInSupportBoard
    ? parseLocalDateTimeInput(els.createSupportDeadlineInput?.value)
    : null;
  setStatus(els.createStatus, "");

  if (!title || !content) {
    setStatus(els.createStatus, "Please fill in both the title and body.", "error");
    return;
  }

  if (participatesInSupportBoard) {
    const validation = buildSupportDeadlineValidation(supportDeadlineDate);
    if (!validation.ok) {
      setStatus(els.createStatus, validation.message, "error");
      els.createSupportDeadlineInput?.focus();
      return;
    }
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
      image_url: normalizePostImageUrl(imageUrl),
      category: "discussion",
      participates_in_support_board: participatesInSupportBoard,
      support_board_deadline_at: participatesInSupportBoard ? supportDeadlineDate.toISOString() : null,
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
  if (els.createSupportToggle) {
    els.createSupportToggle.checked = true;
  }
  if (els.createSupportDeadlineInput) {
    els.createSupportDeadlineInput.value = "";
  }
  syncCreateSupportControls({ preserveValue: false });
  setCreateImagePreview(null);
  setStatus(els.createStatus, "Post published successfully.", "success");

  await loadHomepageData();
  if (data?.id) {
    await loadDetailData(data.id);
    if (navigate("detail", { updateRoute: false })) {
      syncBrowserRouteForPost(data.id);
    }
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
  return normalizePostImageUrl(data.publicUrl);
}

async function uploadProfileAvatar(file) {
  if (!state.user || !state.supabase) {
    navigate("auth");
    return false;
  }

  setStatus(els.profileAvatarStatus, "Uploading avatar...");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const filePath = `${state.user.id}/avatar-${Date.now()}-${safeName}`;
  const { error } = await state.supabase.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, file, { upsert: false });

  if (error) {
    setStatus(els.profileAvatarStatus, error.message, "error");
    return false;
  }

  const { data } = state.supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
  return updateProfileAvatar(normalizePostImageUrl(data.publicUrl));
}

async function updateProfileAvatar(avatarValue) {
  if (!state.user || !state.supabase) {
    navigate("auth");
    return false;
  }

  const { error } = await state.supabase
    .from("profiles")
    .update({ avatar_url: avatarValue })
    .eq("id", state.user.id);

  if (error) {
    setStatus(els.profileAvatarStatus, error.message, "error");
    return false;
  }

  state.profile = {
    ...(state.profile || { id: state.user.id }),
    avatar_url: avatarValue,
  };
  renderProfileAvatar();
  updateAuthUi();
  setStatus(els.profileAvatarStatus, "Avatar updated.", "success");
  if (els.profileAvatarInput) {
    els.profileAvatarInput.value = "";
  }
  return true;
}

async function submitComment() {
  if (!state.user) {
    setStatus(els.authStatus, "Please log in before commenting.", "error");
    setStatus(els.commentStatus, "Please log in before commenting.", "error");
    navigate("auth");
    return;
  }

  const content = els.commentInput.value.trim();
  setStatus(els.commentStatus, "");
  if (!content || !state.detailPostId) {
    setStatus(els.commentStatus, "Comment cannot be empty.", "error");
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
    setStatus(els.commentStatus, "Comment published successfully.", "success");
  await Promise.all([loadHomepageData(), loadDetailData(state.detailPostId)]);
}

async function toggleLike() {
  if (!state.user || !state.currentDetailPost) {
    setStatus(els.authStatus, "Please log in before liking posts.", "error");
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

    state.pendingDetailLikeBurst = true;
  }

  await Promise.all([loadHomepageData(), loadDetailData(postId)]);

  if (state.pendingDetailLikeBurst) {
    triggerLikeDemo(els.detailActions?.querySelector('[data-action="like"]'), {
      updateDemoState: false,
      forceActive: true,
    });
    state.pendingDetailLikeBurst = false;
  }
}

async function renderProfilePosts() {
  renderProfileWallet();

  if (!profilePostsContainer) {
    return;
  }

  if (!configReady || !state.user) {
    state.profilePosts = [];
    state.profileComments = [];
    state.profileBookmarks = [];
    renderProfileActivity();
    return;
  }

  const [postsResult, commentsResult] = await Promise.all([
    state.supabase
      .from("feed_posts")
      .select("*")
      .eq("author_profile_id", state.user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    state.supabase
      .from("feed_comments")
      .select("*")
      .eq("author_profile_id", state.user.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  state.profilePosts = postsResult.error ? [] : (postsResult.data ?? []);

  const comments = commentsResult.error ? [] : (commentsResult.data ?? []);
  const relatedPostIds = [...new Set([
    ...comments.map((item) => item.post_id),
    ...state.bookmarkedPostIds,
  ].filter(Boolean))];
  const postMap = new Map(state.posts.map((item) => [item.id, item]));
  const missingPostIds = relatedPostIds.filter((postId) => !postMap.has(postId));

  if (missingPostIds.length > 0) {
    const relatedPostsResult = await state.supabase
      .from("feed_posts")
      .select("*")
      .in("id", missingPostIds);

    if (!relatedPostsResult.error) {
      (relatedPostsResult.data ?? []).forEach((item) => {
        postMap.set(item.id, item);
      });
    }
  }

  state.profileComments = comments.map((comment) => ({
    ...comment,
    post_title: postMap.get(comment.post_id)?.title || "相关帖子",
  }));

  state.profileBookmarks = state.bookmarkedPostIds
    .map((postId, index) => {
      const post = postMap.get(postId);
      return post
        ? {
          ...post,
          saved_at: new Date(Date.now() - index * 60000).toISOString(),
        }
        : null;
    })
    .filter(Boolean);

  if (els.profilePostCount) {
    els.profilePostCount.textContent = String(state.profilePosts.length);
  }

  renderProfileActivity();
}

function setProfileTab(tab) {
  state.profileTab = tab;
  els.profileTabs.forEach((button, index) => {
    const key = ["posts", "comments", "bookmarks"][index] ?? "posts";
    button.classList.toggle("active", key === tab);
  });
  renderProfileActivity();
}

function renderProfileActivity() {
  if (!profilePostsContainer) {
    return;
  }

  if (!state.user) {
    profilePostsContainer.innerHTML = `
      <div class="profile-wallet-empty">
        登录后可查看你的帖子、评论和收藏。
      </div>
    `;
    return;
  }

  if (state.profileTab === "comments") {
    profilePostsContainer.innerHTML = state.profileComments.length > 0
      ? state.profileComments.map((comment) => `
        <div class="profile-post-item" onclick="openDetailById('${comment.post_id}')">
          <div class="profile-post-item-title">评论于《${escapeHtml(comment.post_title)}》</div>
          <div class="profile-post-item-meta">${formatRelativeTime(comment.created_at)} · 点击查看原帖</div>
          <div class="post-excerpt" style="margin:10px 0 0; -webkit-line-clamp:3;">${escapeHtml(comment.content)}</div>
        </div>
      `).join("")
      : `
        <div class="profile-wallet-empty">
          你还没有发表过评论。
        </div>
      `;
    return;
  }

  if (state.profileTab === "bookmarks") {
    profilePostsContainer.innerHTML = state.profileBookmarks.length > 0
      ? state.profileBookmarks.map((post) => `
        <div class="profile-post-item" onclick="openDetailById('${post.id}')">
          <div class="profile-post-item-title">${escapeHtml(post.title)}</div>
          <div class="profile-post-item-meta">已收藏 · 👍 ${formatCompact(post.like_count)} · 💬 ${formatCompact(post.comment_count)}</div>
        </div>
      `).join("")
      : `
        <div class="profile-wallet-empty">
          你还没有收藏内容。当前先按点赞记录展示收藏列表。
        </div>
      `;
    return;
  }

  profilePostsContainer.innerHTML = state.profilePosts.length > 0
    ? state.profilePosts.map((post) => `
      <div class="profile-post-item" onclick="openDetailById('${post.id}')">
        <div class="profile-post-item-title">${escapeHtml(post.title)}</div>
        <div class="profile-post-item-meta">${formatRelativeTime(post.created_at)} · 👍 ${formatCompact(post.like_count)} · 💬 ${formatCompact(post.comment_count)}</div>
      </div>
    `).join("")
    : `
      <div class="profile-wallet-empty">
        你还没有发过帖子。
      </div>
    `;
}

function renderProfileAvatar() {
  const name = state.profile?.username || state.user?.email?.split("@")[0] || "Guest";
  const avatarValue = state.profile?.avatar_url || DEFAULT_PROFILE_AVATAR;

  renderAvatarElement(els.profileAvatar, avatarValue, name);
  if (els.profileEmojiSelect) {
    els.profileEmojiSelect.value = isEmojiAvatar(avatarValue) ? avatarValue : DEFAULT_PROFILE_AVATAR;
  }
}

function renderProfileWallet() {
  renderProfileAvatar();

  const walletUnsupported = state.walletFeatureStatus === "unsupported";
  if (els.profileStatLabels?.length >= 3) {
    els.profileStatLabels[0].textContent = "Posts";
    els.profileStatLabels[1].textContent = "Coins";
    els.profileStatLabels[2].textContent = "Rewards";
  }

  if (els.profileName) {
    els.profileName.textContent = state.profile?.username || state.user?.email?.split("@")[0] || "Guest";
  }

  if (els.profileBio) {
    els.profileBio.textContent = state.user
      ? "Human participant · wallet-enabled account"
      : "Sign in to unlock your wallet, daily rewards, and transaction history.";
  }

  if (els.profileWalletCard) {
    els.profileWalletCard.style.display = state.user ? "block" : "none";
  }

  if (walletUnsupported && els.profileBio && state.user) {
    els.profileBio.textContent = "Human participant · forum mode active. Wallet rollout is pending on this backend.";
  }

  if (els.profileWalletBalance) {
    els.profileWalletBalance.textContent = state.wallet ? formatCompact(state.wallet.balance) : "--";
  }

  if (els.profileRewardCount) {
    els.profileRewardCount.textContent = String(
      state.walletTransactions.filter((item) => item.direction === "credit").length,
    );
  }

  if (els.profileWalletStatus) {
    els.profileWalletStatus.textContent = state.walletError || state.walletStatus || "Wallet ready.";
    els.profileWalletStatus.className = `profile-wallet-status ${state.walletError ? "is-error" : ""}`.trim();
  }

  if (els.profileWalletSummary) {
    els.profileWalletSummary.innerHTML = state.wallet
      ? `
        <div class="profile-wallet-metric">
          <span class="profile-wallet-label">Balance</span>
            <strong>${formatCompact(state.wallet.balance)} MOB</strong>
        </div>
        <div class="profile-wallet-metric">
          <span class="profile-wallet-label">Earned</span>
          <strong>${formatCompact(state.wallet.lifetime_earned)}</strong>
        </div>
        <div class="profile-wallet-metric">
          <span class="profile-wallet-label">Spent</span>
          <strong>${formatCompact(state.wallet.lifetime_spent)}</strong>
        </div>
        <div class="profile-wallet-metric">
          <span class="profile-wallet-label">Last reward</span>
          <strong>${state.wallet.last_rewarded_at ? formatRelativeTime(state.wallet.last_rewarded_at) : "--"}</strong>
        </div>
        <div class="profile-reward-notice">
          <strong>奖励机制公告</strong>
          <ul>
            <li>新账号首次登录奖励 1500 MOB；如果邮箱确认后没立即到账，下一次登录会自动补领。</li>
            <li>每日首次登录奖励 30 MOB，每个账号每天只发一次。</li>
            <li>帖子详情里的 YES / NO 站队消耗 50 MOB，站队后会锁定同一市场方向。</li>
          </ul>
        </div>
      `
      : `
        <div class="profile-wallet-empty">
          Wallet not available yet. Sign in and trigger the reward flow first.
        </div>
      `;
  }

  if (walletUnsupported && els.profileWalletStatus) {
    els.profileWalletStatus.textContent = "Wallet module is not enabled on this backend yet.";
    els.profileWalletStatus.className = "profile-wallet-status";
  }

  if (walletUnsupported && els.profileWalletSummary) {
    els.profileWalletSummary.innerHTML = `
      <div class="profile-wallet-empty">
        Wallet tables and reward functions have not been rolled out on the current backend contract yet.
      </div>
    `;
  }

  if (els.profileWalletTransactions) {
    els.profileWalletTransactions.innerHTML = state.walletTransactions.length > 0
      ? state.walletTransactions
        .map((item) => `
          <div class="profile-wallet-transaction">
            <div>
              <div class="profile-wallet-transaction-title">${escapeHtml(item.description || item.transaction_type)}</div>
              <div class="profile-wallet-transaction-meta">${escapeHtml(item.transaction_type)} · ${formatRelativeTime(item.created_at)}</div>
            </div>
            <div class="profile-wallet-transaction-amount ${item.direction === "credit" ? "is-credit" : "is-debit"}">
              ${item.direction === "credit" ? "+" : "-"}${formatCompact(item.amount)}
            </div>
          </div>
        `)
        .join("")
      : `
        <div class="profile-wallet-empty">
          No wallet transactions yet.
        </div>
      `;
  }

  if (walletUnsupported && els.profileWalletTransactions) {
    els.profileWalletTransactions.innerHTML = `
      <div class="profile-wallet-empty">
        Wallet history will appear here after the backend wallet rollout is applied.
      </div>
    `;
  }
}

function openDetailById(postId, options = {}) {
  if (!postId) {
    return false;
  }

  const {
    updateRoute = true,
    replaceRoute = false,
  } = options;

  state.detailPostId = postId;

  if (!navigate("detail", { updateRoute: false })) {
    return false;
  }

  if (updateRoute) {
    syncBrowserRouteForPost(postId, { replace: replaceRoute });
  }

  void loadDetailData(postId);
  return true;
}

function renderDetailOdds() {
  clearCountdownTimers("detail-");
  const post = state.currentDetailPost;
  if (!post || !els.detailOddsModule) {
    return;
  }

  const postBettingReady = FEATURE_GATES.postMarketWrites && state.postBetFeatureStatus !== "unsupported";
  const roastPrediction = state.detailPredictions.find((item) => item.prediction_type === "get_roasted");
  const hotPrediction = state.detailPredictions.find((item) => item.prediction_type === "hot_24h");
  const flamePrediction = state.detailPredictions.find((item) => item.prediction_type === "flamewar");
  const primaryPrediction = hotPrediction ?? flamePrediction ?? roastPrediction;
  const marketType = getPrimaryDetailMarketType(post, state.detailPredictions);
  const marketDeadline = resolveMarketDeadline({ post, prediction: primaryPrediction, marketType });
  const marketResult = getPostMarketResult(post);
  const fallbackProbability = primaryPrediction?.probability ?? post.hot_probability ?? 52;
  const supportBoardSignal = findSupportBoardSignal(state.supportBoardItems, post.id, marketType);
  const detailSupportBoardItem = state.detailPostId === post.id
    && state.detailSupportBoardMarketType === marketType
    ? state.detailSupportBoardItem
    : null;
  const marketRate = resolvePostMarketRate({
    post,
    marketType,
    supportBoardSignal,
    detailSupportBoardItem,
    fallbackProbability,
    clampNumber,
  });
  const yesProbability = marketRate.yesRate;
  const marketQuestion = post.title || "Untitled post";
  const marketLabel = marketType === "flamewar"
    ? "Flame-War Market"
    : marketType === "get_roasted"
      ? "Roast Risk Market"
      : "Hot Market";
  const lensInsight = readLensAgentInsight(post, {
    supportBoardSignal,
  });
  const detailSupportTrendMarkup = renderDetailSupportTrend({
    post,
    marketType,
    supportBoardSignal,
    fallbackRate: yesProbability,
  });
  const lockedSide = getMarketPositionSide(state.detailUserBets, marketType);
  const ownPostLocked = isCurrentUserPostAuthor(post);
  const sideStatusText = ownPostLocked ? getOwnPostMarketLockMessage() : getMarketSideStatusText(lockedSide);
  const resultStatusText = getMarketCountdownSnapshot(marketDeadline).expired
    ? (marketResult ? `Result: ${getPostMarketResultLabel(marketResult)}` : "Waiting for author result.")
    : sideStatusText;
  const yesBlocked = ownPostLocked || isMarketSideBlocked(lockedSide, "yes");
  const noBlocked = ownPostLocked || isMarketSideBlocked(lockedSide, "no");
  const yesButtonText = lockedSide === "yes" ? "追加 YES · 50 MOB" : "站队 YES · 50 MOB";
  const noButtonText = lockedSide === "no" ? "追加 NO · 50 MOB" : "站队 NO · 50 MOB";
  const yesDisabledAttr = yesBlocked ? ` disabled title="${escapeAttribute(sideStatusText)}"` : "";
  const noDisabledAttr = noBlocked ? ` disabled title="${escapeAttribute(sideStatusText)}"` : "";

  const oddsCards = [
    { label: "爆帖概率", value: `${Math.round(hotPrediction?.probability ?? post.hot_probability ?? 0)}%`, cls: "red", oddsValue: Number(hotPrediction?.odds_value ?? post.hot_odds ?? 1.8) },
    { label: "引战概率", value: `${Math.round(flamePrediction?.probability ?? post.flamewar_probability ?? 0)}%`, cls: "orange", oddsValue: Number(flamePrediction?.odds_value ?? 2.2) },
    { label: "被喷风险", value: `${Math.round(roastPrediction?.probability ?? 0)}%`, cls: "green", oddsValue: Number(roastPrediction?.odds_value ?? 2.6) },
  ];

  if (!supportsSupportBoard(post)) {
    els.detailOddsModule.innerHTML = `
      <div class="odds-title">
        ${boltIcon()}
        热度分析
      </div>
      <div class="odds-grid">
        ${oddsCards.map((item) => `
          <div class="odds-item">
            <div class="odds-label">${escapeHtml(item.label)}</div>
            <div class="odds-value ${item.cls}">${escapeHtml(item.value)}</div>
          </div>
        `).join("")}
      </div>
      ${renderLensAgentDetailCard(lensInsight)}
      <div class="support-opt-out-note">这篇帖子发布时没有勾选“参与支持率排行”，因此不会进入 Live Support Board，也不能参与 YES / NO 站队市场。</div>
      ${state.detailPredictions.slice(0, 3).map((item) => `
        <div class="agent-predict" style="margin-top:14px">
          <div class="agent-predict-avatar">${item.is_ai_agent ? "🤖" : "📡"}</div>
          <div class="agent-predict-main">
            <div class="agent-predict-name">${escapeHtml(item.predictor_name || "Arena Pulse")} · ${escapeHtml(item.prediction_label)} <span class="ai-disclosure">${escapeHtml(item.predictor_badge || "")}</span></div>
            <div class="agent-predict-text">${escapeHtml(item.headline)}${item.predictor_disclosure ? ` · ${escapeHtml(item.predictor_disclosure)}` : ""}</div>
          </div>
        </div>
      `).join("")}
    `;
    return;
  }

  els.detailOddsModule.innerHTML = `
    <div class="odds-title">
      ${boltIcon()}
      odds 分析
    </div>
    <div class="odds-grid">
      ${oddsCards.map((item) => `
        <div class="odds-item">
          <div class="odds-label">${escapeHtml(item.label)}</div>
          <div class="odds-value ${item.cls}">${escapeHtml(item.value)}</div>
          <div class="prediction-meta-row" style="margin-top:12px;justify-content:center">
            <span class="prediction-odds-chip">${Number(item.oddsValue || 0).toFixed(2)}x</span>
          </div>
        </div>
      `).join("")}
    </div>
    ${renderLensAgentDetailCard(lensInsight)}
    <div class="post-market-shell" data-countdown-key="detail-${escapeAttribute(post.id || "active")}" data-market-deadline="${escapeAttribute(marketDeadline || "")}">
      <div class="post-market-header">
        <div>
          <div class="post-market-kicker">${escapeHtml(marketLabel)}</div>
          <div class="post-market-question">${escapeHtml(marketQuestion)}</div>
              <div class="post-market-sub">${escapeHtml(marketRate.sourceLabel)} · YES / NO 会扣除钱包 MOB，并按站队时 odds 锁定结算倍率。</div>
        </div>
        <div class="post-market-balance">
          <span>Stake</span>
              <strong>50 MOB</strong>
        </div>
      </div>
      ${renderCountdownMarkup()}
      <div class="post-market-track-wrap">
        <div class="post-market-track">
          <div class="post-market-fill yes" style="width:${marketRate.yesWidth}%">YES ${yesProbability}%</div>
          <div class="post-market-fill no" style="width:${marketRate.noWidth}%">NO ${marketRate.noRate}%</div>
        </div>
      </div>
      ${detailSupportTrendMarkup}
      <div class="post-market-buttons">
        <button class="post-market-bet-btn primary" type="button" data-action="stake-post-side" data-market-type="${marketType}" data-side="yes" data-stake="50"${yesDisabledAttr}>${yesButtonText}</button>
        <button class="post-market-bet-btn" type="button" data-action="stake-post-side" data-market-type="${marketType}" data-side="no" data-stake="50"${noDisabledAttr}>${noButtonText}</button>
      </div>
      ${renderPostMarketResultControls({ post, marketDeadline })}
    </div>
    ${state.detailPredictions.slice(0, 3).map((item) => `
      <div class="agent-predict" style="margin-top:14px">
        <div class="agent-predict-avatar">${item.is_ai_agent ? "🤖" : "📡"}</div>
        <div class="agent-predict-main">
          <div class="agent-predict-name">${escapeHtml(item.predictor_name || "Arena Pulse")} · ${escapeHtml(item.prediction_label)} <span class="ai-disclosure">${escapeHtml(item.predictor_badge || "")}</span></div>
          <div class="agent-predict-text">${escapeHtml(item.headline)}${item.predictor_disclosure ? ` · ${escapeHtml(item.predictor_disclosure)}` : ""}</div>
          <div class="prediction-meta-row">
            <span class="prediction-odds-chip">${Math.round(item.probability || 0)}% · ${Number(item.odds_value || 0).toFixed(2)}x · ${escapeHtml(item.status || "open")}</span>
          </div>
        </div>
      </div>
    `).join("")}
    ${renderDetailMarketPosition({ post, marketType, marketDeadline })}
    <div class="inline-status" id="detailOddsStatus">${escapeHtml(resultStatusText)}</div>
  `;

  els.detailOddsModule.querySelectorAll('[data-action="stake-post-side"]').forEach((button) => {
    if (!postBettingReady) {
      button.disabled = true;
      const statusEl = els.detailOddsModule?.querySelector("#detailOddsStatus");
      if (statusEl && !statusEl.textContent.trim()) {
        statusEl.textContent = "Current backend has not enabled post-market writes yet.";
      }
    }

    button.addEventListener("click", () => {
      void handlePostSideStake(button);
    });
  });

  els.detailOddsModule.querySelector('[data-action="claim-post-market-reward"]')?.addEventListener("click", () => {
    void claimPostMarketRewards({
      postId: post.id,
      marketType,
    });
  });

  els.detailOddsModule.querySelectorAll('[data-action="publish-post-market-result"]').forEach((button) => {
    button.addEventListener("click", () => {
      void publishPostMarketResult({
        postId: post.id,
        result: button.dataset.result,
      });
    });
  });

  bindMarketCountdowns(els.detailOddsModule);
}

function renderDetailSupportTrend({
  post,
  marketType,
  supportBoardSignal,
  fallbackRate,
}) {
  if (!supportsSupportBoard(post)) {
    return "";
  }

  const hasDetailTrend = state.detailPostId === post?.id
    && state.detailSupportBoardMarketType === marketType
    && state.detailSupportBoardItem;
  const trendItem = hasDetailTrend ? state.detailSupportBoardItem : supportBoardSignal ?? {
    post_id: post?.id || "detail-post",
    market_type: marketType || SUPPORT_BOARD_DEFAULTS.marketType,
    yes_rate: fallbackRate,
    total_amount_total: 0,
  };
  const trendSeries = hasDetailTrend
    ? state.detailSupportBoardSeries
    : supportBoardSignal
      ? getSupportBoardSeries(supportBoardSignal)
      : [];

  return renderSupportBoardDetailTrend({
    series: trendSeries,
    item: trendItem,
    fallbackRate,
    className: "post-market-trend",
    clampNumber,
    formatCompact,
    escapeHtml,
  });
}

function renderPostMarketResultControls({ post, marketDeadline }) {
  const countdownSnapshot = getMarketCountdownSnapshot(marketDeadline);
  if (!countdownSnapshot.expired) {
    return "";
  }

  const result = getPostMarketResult(post);
  if (result) {
    return `<div class="support-opt-out-note" style="margin-top:12px">Result: ${escapeHtml(getPostMarketResultLabel(result))}</div>`;
  }

  if (!isCurrentUserPostAuthor(post)) {
    return `<div class="support-opt-out-note" style="margin-top:12px">Waiting for the post author to publish the result.</div>`;
  }

  return `
    <div class="support-opt-out-note" style="margin-top:12px">
      <strong style="display:block;margin-bottom:8px;color:var(--text-primary)">Publish result</strong>
      <div class="post-market-buttons">
        <button class="post-market-bet-btn primary" type="button" data-action="publish-post-market-result" data-result="yes">YES wins</button>
        <button class="post-market-bet-btn" type="button" data-action="publish-post-market-result" data-result="no">NO wins</button>
        <button class="post-market-bet-btn" type="button" data-action="publish-post-market-result" data-result="refund">Invalid refund</button>
      </div>
    </div>
  `;
}

function renderDetailMarketPosition({ post, marketType, marketDeadline }) {
  const position = summarizeMarketPosition(state.detailUserBets, marketType);
  if (!state.user || position.count === 0) {
    return "";
  }

  const countdownSnapshot = getMarketCountdownSnapshot(marketDeadline);
  const marketResult = getPostMarketResult(post);

  return `
    <div class="support-opt-out-note">
      <strong style="display:block;margin-bottom:8px;color:var(--text-primary)">我的 odds 仓位</strong>
      <div>YES ${formatCompact(position.yesStake)} MOB · NO ${formatCompact(position.noStake)} MOB · 已投入 ${formatCompact(position.totalStaked)} MOB</div>
            <div style="margin-top:6px">按站队时锁定的 odds 估算，最高可结算 ${formatCompact(position.potentialPayout)} MOB。</div>
      ${position.claimedPayout > 0 ? `<div style="margin-top:6px">已结算到钱包：${formatCompact(position.claimedPayout)} MOB</div>` : ""}
      ${countdownSnapshot.expired && !marketResult
        ? `<div style="margin-top:8px">Waiting for the post author to publish the result.</div>`
        : countdownSnapshot.expired && position.unsettledCount > 0
        ? `<button class="post-market-bet-btn primary" type="button" data-action="claim-post-market-reward" style="margin-top:12px">结算 odds 奖励</button>`
        : countdownSnapshot.expired
          ? `<div style="margin-top:8px">这场市场已经完成结算。</div>`
          : `<div style="margin-top:8px">市场结束后可在这里领取结算奖励。</div>`}
    </div>
  `;
}

function renderCountdownMarkup({ compact = false } = {}) {
  const compactClass = compact ? " compact" : "";
  return `
    <div class="market-countdown${compactClass}">
      <span class="market-countdown-label">倒计时</span>
      <span class="market-countdown-value">--:--:--</span>
      <span class="market-countdown-status">待同步</span>
    </div>
  `;
}

function bindMarketCountdowns(root) {
  if (!root) {
    return;
  }

  ensureMarketCountdownStyles();
  root.querySelectorAll("[data-countdown-key]").forEach((container) => {
    setupMarketCountdown(container);
  });
}

function setupMarketCountdown(container) {
  const countdownKey = container?.dataset?.countdownKey;
  if (!countdownKey) {
    return;
  }

  clearCountdownTimer(countdownKey);

  const deadline = container.dataset.marketDeadline || "";
  const valueEl = container.querySelector(".market-countdown-value");
  const statusEl = container.querySelector(".market-countdown-status");
  const buttons = [...container.querySelectorAll('[data-action="stake-post-side"], [data-action="feed-post-side"]')];

  buttons.forEach((button) => {
    if (!button.dataset.countdownLocked) {
      button.dataset.countdownLocked = button.disabled ? "true" : "false";
    }
  });

  const applySnapshot = () => {
    const snapshot = getMarketCountdownSnapshot(deadline);

    if (valueEl) {
      valueEl.textContent = snapshot.valueText;
    }

    if (statusEl) {
      statusEl.textContent = snapshot.statusText;
    }

    container.classList.toggle("is-market-ended", snapshot.expired);
    container.classList.toggle("is-market-live", snapshot.live);
    container.classList.toggle("is-market-pending", snapshot.pending);

    buttons.forEach((button) => {
      if (snapshot.expired) {
        button.disabled = true;
        button.title = "This market has closed.";
        return;
      }

      if (button.dataset.countdownLocked !== "true") {
        button.disabled = false;
      }

      button.title = "";
    });

    if (snapshot.expired || snapshot.pending) {
      clearCountdownTimer(countdownKey);
    }
  };

  const initialSnapshot = getMarketCountdownSnapshot(deadline);
  applySnapshot();

  if (initialSnapshot.expired || initialSnapshot.pending) {
    return;
  }

  const timerId = window.setInterval(applySnapshot, 1000);
  state.countdownTimers.set(countdownKey, timerId);
}

function clearCountdownTimer(countdownKey) {
  const timerId = state.countdownTimers.get(countdownKey);
  if (typeof timerId === "number") {
    window.clearInterval(timerId);
  }
  state.countdownTimers.delete(countdownKey);
}

function clearCountdownTimers(prefix = "") {
  [...state.countdownTimers.keys()]
    .filter((key) => !prefix || key.startsWith(prefix))
    .forEach((key) => {
      clearCountdownTimer(key);
    });
}

function resolveMarketDeadline({ post, prediction = null, marketType = "hot_24h" } = {}) {
  const explicitDeadline = findExplicitMarketDeadline(prediction) || findExplicitMarketDeadline(post);
  if (explicitDeadline) {
    return explicitDeadline;
  }

  const createdAtMs = parseTimestamp(post?.created_at);
  if (createdAtMs == null) {
    return "";
  }

  const fallbackWindowMs = marketType === "hot_24h"
    ? MARKET_COUNTDOWN_FALLBACK_MS
    : MARKET_COUNTDOWN_FALLBACK_MS;

  return new Date(createdAtMs + fallbackWindowMs).toISOString();
}

function findExplicitMarketDeadline(source) {
  if (!source || typeof source !== "object") {
    return "";
  }

  for (const field of MARKET_DEADLINE_FIELDS) {
    const value = source[field];
    if (!value) {
      continue;
    }

    const timestamp = parseTimestamp(value);
    if (timestamp != null) {
      return new Date(timestamp).toISOString();
    }
  }

  return "";
}

function ensureMarketCountdownStyles() {
  if (document.head?.querySelector("#market-countdown-style")) {
    return;
  }

  const styleEl = document.createElement("style");
  styleEl.id = "market-countdown-style";
  styleEl.textContent = `
    .market-countdown {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 14px;
      padding: 10px 12px;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      background: rgba(255,255,255,0.03);
    }

    .market-countdown.compact {
      margin-top: 10px;
      padding: 8px 10px;
      border-radius: 10px;
    }

    .market-countdown-label,
    .market-countdown-status {
      font-size: 12px;
      color: var(--text-secondary);
    }

    .market-countdown-value {
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: var(--text-primary);
    }

    .is-market-live .market-countdown-status {
      color: var(--green);
    }

    .is-market-ended .market-countdown-status,
    .is-market-ended .market-countdown-value {
      color: var(--red);
    }

    .is-market-ended .post-market-bet-btn,
    .is-market-ended .post-market-inline-btn {
      opacity: 0.55;
      cursor: not-allowed;
    }
  `;

  document.head.appendChild(styleEl);
}

async function handlePostSideStake(button) {
  const statusEl = els.detailOddsModule?.querySelector("#detailOddsStatus");

  if (!FEATURE_GATES.postMarketWrites) {
    setStatus(statusEl, "Post-market writes are disabled on the current backend main contract.", "error");
    return;
  }

  if (!state.user) {
    setStatus(els.authStatus, "Please log in before choosing a side for this post.", "error");
    setStatus(statusEl, "Please log in before choosing a side for this post.", "error");
    navigate("auth");
    return;
  }

  const marketType = button?.dataset?.marketType;
  const side = button?.dataset?.side;
  const stakeAmount = Number(button?.dataset?.stake || 50);
  const post = state.currentDetailPost;

  if (!post || !marketType || !side) {
    setStatus(statusEl, "This post side-selection data is outdated. Please refresh and try again.", "error");
    return;
  }

  if (isCurrentUserPostAuthor(post)) {
    setStatus(statusEl, getOwnPostMarketLockMessage(), "error");
    return;
  }

  if (!supportsSupportBoard(post)) {
    setStatus(statusEl, "该帖子没有参与支持率排行，无法站队。", "error");
    return;
  }

  const lockedSide = getMarketPositionSide(state.detailUserBets, marketType);
  if (isMarketSideBlocked(lockedSide, side)) {
    setStatus(statusEl, getMarketSideStatusText(lockedSide), "error");
    return;
  }

  button.disabled = true;
  button.classList.add("is-loading");
  setStatus(statusEl, "正在提交站队...", "");

  const result = await submitPostBet({ post, marketType, side, stakeAmount });

  button.classList.remove("is-loading");
  button.disabled = false;

  if (!result.ok) {
    setStatus(statusEl, result.message, "error");
    return;
  }

  playPostMarketOuteImpact(button);
  await Promise.allSettled([
    refreshWalletModule(),
    loadHomepageData(),
    state.detailPostId === post.id ? loadDetailData(post.id) : Promise.resolve(),
  ]);

  setStatus(statusEl, result.message, "success");
}

async function handleFeedPostSideStake(button) {
  const postId = button?.dataset?.postId;
  const marketType = button?.dataset?.marketType;
  const side = button?.dataset?.side;
  const stakeAmount = Number(button?.dataset?.stake || 50);
  const statusEl = postId ? document.getElementById(`feedPostStatus-${postId}`) : null;
  const post = state.posts.find((item) => item.id === postId);

  if (!FEATURE_GATES.postMarketWrites) {
    setStatus(statusEl, "Post-market writes are disabled on the current backend main contract.", "error");
    return;
  }

  if (!state.user) {
    setStatus(els.authStatus, "Please log in before choosing a side for this post.", "error");
    setStatus(statusEl, "Please log in before choosing a side for this post.", "error");
    navigate("auth");
    return;
  }

  if (!post || !marketType || !side) {
    setStatus(statusEl, "This post side-selection data is outdated. Please refresh and try again.", "error");
    return;
  }

  if (!supportsSupportBoard(post)) {
    setStatus(statusEl, "该帖子没有参与支持率排行，无法站队。", "error");
    return;
  }

  if (isCurrentUserPostAuthor(post)) {
    setStatus(statusEl, getOwnPostMarketLockMessage(), "error");
    return;
  }

  const lockedSide = getMarketPositionSide(getUserPostMarketBets(postId), marketType);
  if (isMarketSideBlocked(lockedSide, side)) {
    setStatus(statusEl, getMarketSideStatusText(lockedSide), "error");
    return;
  }

  button.disabled = true;
  button.classList.add("is-loading");
  setStatus(statusEl, "正在提交站队...", "");

  const result = await submitPostBet({ post, marketType, side, stakeAmount });

  button.classList.remove("is-loading");
  button.disabled = false;

  if (!result.ok) {
    setStatus(statusEl, result.message, "error");
    return;
  }

  playPostMarketOuteImpact(button);
  await Promise.allSettled([
    refreshWalletModule(),
    loadHomepageData(),
    state.detailPostId === post.id ? loadDetailData(post.id) : Promise.resolve(),
  ]);

  setStatus(document.getElementById(`feedPostStatus-${postId}`) ?? statusEl, result.message, "success");
}

async function submitPostBet({ post, marketType, side, stakeAmount }) {
  if (!FEATURE_GATES.postMarketWrites) {
    state.postBetFeatureStatus = "unsupported";
    return {
      ok: false,
      message: "Post-market writes are disabled on the current backend main contract.",
    };
  }

  if (!state.supabase || !state.user) {
    return {
      ok: false,
      message: "Please log in and configure Supabase first.",
    };
  }

  if (!supportsSupportBoard(post)) {
    return {
      ok: false,
      message: "该帖子没有参与支持率排行，无法站队。",
    };
  }

  if (isCurrentUserPostAuthor(post)) {
    return {
      ok: false,
      message: getOwnPostMarketLockMessage(),
    };
  }

  const result = await tryPostBetRpc("place_post_bet", buildPlacePostBetPayload({
    postId: post.id,
    marketType,
    side,
    stakeAmount,
    actorProfileId: state.user.id,
  }));

  if (result.ok) {
    return {
      ok: true,
      message: toPostBetSuccessMessage({ side, marketType, stakeAmount }),
    };
  }

  if (result.kind === "missing") {
    state.postBetFeatureStatus = "unsupported";
    renderFeed();
    renderDetailOdds();

    return {
      ok: false,
      message: "The wallet-backed odds endpoint is not live yet.",
    };
  }

  return {
    ok: false,
    message: result.message,
  };
}

async function claimPostMarketRewards({ postId, marketType }) {
  const statusEl = els.detailOddsModule?.querySelector("#detailOddsStatus");

  if (!state.user || !state.supabase) {
    setStatus(statusEl, "请先登录后再结算 odds 奖励。", "error");
    navigate("auth");
    return;
  }

  setStatus(statusEl, "正在结算 odds 奖励...", "");

  const { data, error } = await state.supabase.rpc("claim_post_market_rewards", {
    p_post_id: postId,
    p_market_type: marketType,
    p_actor_profile_id: state.user.id,
  });

  if (error) {
    setStatus(statusEl, mapPostBetError(error.message), "error");
    return;
  }

  const result = data && typeof data === "object" ? data : {};
  const message = toSettlementStatusMessage(result);

  await Promise.allSettled([
    refreshWalletModule(),
    loadHomepageData(),
    loadDetailData(postId),
  ]);

  setStatus(statusEl, message, "success");
}

async function tryPostBetRpc(functionName, payload) {
  const { error } = await state.supabase.rpc(functionName, payload);

  if (!error) {
    return { ok: true };
  }

  return {
    ok: false,
    kind: classifyPostBetError(error.message),
    message: mapPostBetError(error.message),
  };
}

function toggleLbRow(row) {
  const wasExpanded = row.classList.contains("expanded");
  document.querySelectorAll(".lb-row.expanded").forEach((item) => item.classList.remove("expanded"));
  if (!wasExpanded) {
    row.classList.add("expanded");
  }
}

function getLeaderboardContextKey() {
  return `${state.leaderboardTab}:${state.leaderboardTime}`;
}

function setLeaderboardLiveStatus(text, tone = "idle") {
  leaderboardMotion.setStatus(text, tone);
}

function debounce(fn, wait = 160) {
  let timerId = 0;

  return (...args) => {
    window.clearTimeout(timerId);
    timerId = window.setTimeout(() => fn(...args), wait);
  };
}

function startLeaderboardLiveUpdates() {
  if (!state.supabase || state.leaderboardRealtimeChannel) {
    return;
  }

  const scheduleRefresh = debounce(() => {
    void refreshLiveLeaderboard("live-update");
  });

  let channel = state.supabase.channel("leaderboard-live-rankings");
  SUPPORT_BOARD_REALTIME_TABLES.forEach((table) => {
    channel = channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      () => scheduleRefresh(),
    );
  });

  state.leaderboardRealtimeChannel = channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      state.leaderboardRealtimeSubscribed = true;
      setLeaderboardLiveStatus("Realtime sync connected", "live");
      return;
    }

    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      state.leaderboardRealtimeSubscribed = false;
      setLeaderboardLiveStatus("实时通道异常，已切换轮询", "polling");
    }
  });

  state.leaderboardRefreshTimer = window.setInterval(() => {
    void refreshLiveLeaderboard("poll");
  }, LEADERBOARD_REFRESH_MS);
}

async function refreshLiveLeaderboard(reason = "poll") {
  if (!state.supabase) {
    return;
  }

  if (state.leaderboardRefreshInFlight) {
    state.leaderboardRefreshPending = true;
    return;
  }

  state.leaderboardRefreshInFlight = true;
  const previousSupportBoardSignature = state.supportBoardRainSignature;

  try {
    await Promise.allSettled([
      loadHomepageData({ render: false }),
      loadLeaderboardData({ render: false }),
    ]);

    renderLiveSupportBoard();
    const nextSupportBoardSignature = getSupportBoardRainSignature();
    if (shouldTriggerSupportBoardRain({
      previousSignature: previousSupportBoardSignature,
      nextSignature: nextSupportBoardSignature,
      reason,
    })) {
      triggerSupportBoardUpdateRain();
    }
    state.supportBoardRainSignature = nextSupportBoardSignature;
    renderLeaderboard({
      mode: "reorder",
      reason,
    });
  } finally {
    state.leaderboardRefreshInFlight = false;

    if (state.leaderboardRefreshPending) {
      state.leaderboardRefreshPending = false;
      void refreshLiveLeaderboard(reason);
    }
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
  button.textContent = "Joined";
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
    return "Incorrect email or password. Please use your registered email instead of a username.";
  }

  if (message?.includes("Email not confirmed")) {
    return "This account has not completed email verification yet.";
  }

  if (mode === "signup" && message?.includes("User already registered")) {
    return "This email is already registered. Switch to login instead.";
  }

  return message || "Operation failed. Please try again later.";
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
    return `<span class="heat-badge heat-fire"${pinned ? ' style="margin-left:auto"' : ""}>⚔ 引战概率 ${flamewar}%</span>`;
  }

  if (post.hot_odds) {
    return `<span class="heat-badge heat-cool"${pinned ? ' style="margin-left:auto"' : ""}>odds ${Number(post.hot_odds).toFixed(2)}x</span>`;
  }

  return "";
}

function renderParagraphs(text) {
  return text
    .split(/\n{2,}/)
    .map((part) => `<p>${escapeHtml(part).replace(/\n/g, "<br>")}</p>`)
    .join("<br>");
}

function isEmojiAvatar(value) {
  return String(value || "").startsWith("emoji:");
}

function getEmojiAvatar(value) {
  return isEmojiAvatar(value) ? String(value).slice("emoji:".length) || DEFAULT_PROFILE_AVATAR.slice("emoji:".length) : "";
}

function renderAvatarElement(element, avatarValue, label) {
  if (!element) {
    return;
  }

  element.style.backgroundImage = "";
  element.textContent = "";
  if (isEmojiAvatar(avatarValue)) {
    element.textContent = getEmojiAvatar(avatarValue);
    return;
  }

  if (avatarValue) {
    element.style.backgroundImage = `url("${avatarValue}")`;
    element.style.backgroundSize = "cover";
    element.style.backgroundPosition = "center";
    return;
  }

  element.textContent = (label || "?").slice(0, 1).toUpperCase();
}

function renderAvatar(className, imageUrl, label) {
  if (isEmojiAvatar(imageUrl)) {
    return `<div class="${className}" style="display:flex;align-items:center;justify-content:center;">${escapeHtml(getEmojiAvatar(imageUrl))}</div>`;
  }

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
    return `${minutes} minutes ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hours ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days} days ago`;
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

function renderSupportBoardSparkline(series, fallbackRate = 50) {
  const points = series.length > 0 ? series : createFallbackSupportSeries({ yes_rate: fallbackRate });
  const lastPoint = points[points.length - 1] ?? { yes_rate: fallbackRate };
  const polyline = points.map((point, index) => {
    const x = points.length === 1 ? 56 : (index / (points.length - 1)) * 112;
    const y = 26 - (clampNumber(Number(point.yes_rate ?? fallbackRate), 0, 100) / 100) * 20;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
  const lastX = points.length === 1 ? 56 : 112;
  const lastY = 26 - (clampNumber(Number(lastPoint.yes_rate ?? fallbackRate), 0, 100) / 100) * 20;

  return `
    <svg viewBox="0 0 112 28" width="112" height="28" aria-hidden="true" focusable="false">
      <path d="M0 26.5 H112" stroke="rgba(255,255,255,0.12)" stroke-width="1" fill="none"></path>
      <polyline
        points="${polyline}"
        fill="none"
        stroke="rgba(124, 255, 203, 0.95)"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      ></polyline>
      <circle cx="${lastX}" cy="${lastY.toFixed(2)}" r="2.5" fill="rgba(124, 255, 203, 1)"></circle>
    </svg>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function highlightMentions(html) {
  return String(html ?? "").replace(/@([a-z0-9][a-z0-9-]{2,23})/gi, '<span class="mention-highlight">@$1</span>');
}

async function loadAgentDashboard() {
  const statsEl = document.getElementById("agent-stats");
  const listEl = document.getElementById("agent-list");
  const runsEl = document.getElementById("agent-runs");
  const toggleBtn = document.getElementById("agent-toggle-btn");

  if (!state.user || !state.supabase) {
    if (statsEl) {
      statsEl.innerHTML = '<div style="color:var(--text-secondary);">Sign in to view agent operations.</div>';
    }
    if (listEl) {
      listEl.innerHTML = "";
    }
    if (runsEl) {
      runsEl.innerHTML = "";
    }
    return;
  }

  const flagEnabled = state.featureFlags.agent_auto_reply ?? true;
  if (toggleBtn) {
    toggleBtn.textContent = flagEnabled ? "已开启" : "已关闭";
    toggleBtn.style.background = flagEnabled ? "var(--accent)" : "var(--bg-input)";
    toggleBtn.style.color = flagEnabled ? "var(--bg-primary)" : "var(--text-secondary)";
    toggleBtn.onclick = () => void toggleAgentAutoReply(!flagEnabled);
  }

  if (listEl) {
    const { data: agents, error } = await state.supabase
      .from("agents")
      .select("id,handle,display_name,persona,badge,kind,is_active")
      .order("kind", { ascending: true });

    if (error) {
      listEl.innerHTML = '<div style="color:var(--text-secondary);">Agent list unavailable.</div>';
    } else if (agents?.length) {
      listEl.innerHTML = agents.map((agent) => `
        <div style="padding:12px 16px;background:var(--bg-card);border-radius:var(--radius-sm);border:1px solid var(--border);">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <span style="font-weight:600;font-size:14px;">${escapeHtml(agent.display_name)}</span>
            <span class="mention-badge">${escapeHtml(agent.badge || "AI Agent")}</span>
            ${agent.is_active ? "" : '<span style="font-size:10px;color:var(--text-secondary);">inactive</span>'}
          </div>
          <div style="font-size:12px;color:var(--text-secondary);">@${escapeHtml(agent.handle)}</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;line-height:1.5;">${escapeHtml(String(agent.persona ?? "").slice(0, 80))}</div>
        </div>
      `).join("");
    } else {
      listEl.innerHTML = '<div style="color:var(--text-secondary);">No agents found.</div>';
    }
  }

  if (!statsEl || !runsEl) {
    return;
  }

  const { data, error } = await state.supabase.rpc("get_agent_dashboard", { p_limit: 20, p_offset: 0 });
  if (error || !data?.length) {
    statsEl.innerHTML = '<div style="color:var(--text-secondary);">Admin data unavailable.</div>';
    runsEl.innerHTML = "";
    return;
  }

  const first = data[0];
  statsEl.innerHTML = [
    { label: "总运行", value: first.total_runs ?? 0 },
    { label: "成功", value: first.success_runs ?? 0 },
    { label: "失败", value: first.error_runs ?? 0 },
    { label: "今日运行", value: first.runs_today ?? 0 },
    { label: "活跃 Agent", value: first.active_agents ?? 0 },
  ].map((item) => `
    <div style="padding:16px;background:var(--bg-card);border-radius:var(--radius-sm);border:1px solid var(--border);text-align:center;">
      <div style="font-size:24px;font-weight:700;">${escapeHtml(item.value)}</div>
      <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">${escapeHtml(item.label)}</div>
    </div>
  `).join("");

  runsEl.innerHTML = `
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="border-bottom:1px solid var(--border);text-align:left;font-size:11px;color:var(--text-secondary);">
          <th style="padding:8px;">时间</th>
          <th style="padding:8px;">模式</th>
          <th style="padding:8px;">状态</th>
          <th style="padding:8px;">模型</th>
          <th style="padding:8px;">错误</th>
        </tr>
      </thead>
      <tbody>
        ${data.map((run) => `
          <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
            <td style="padding:8px;">${formatRelativeTime(run.recent_created_at)}</td>
            <td style="padding:8px;"><code style="font-size:11px;">${escapeHtml(run.recent_run_mode ?? "")}</code></td>
            <td style="padding:8px;">${run.recent_status === "success"
              ? '<span style="color:#4ade80;">success</span>'
              : '<span style="color:#f87171;">error</span>'}</td>
            <td style="padding:8px;font-size:11px;">${escapeHtml(run.recent_model ?? "")}</td>
            <td style="padding:8px;font-size:11px;color:var(--text-secondary);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(run.recent_error ?? "")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function toggleAgentAutoReply(enable) {
  if (!state.supabase) {
    return;
  }

  const { error } = await state.supabase
    .from("app_feature_flags")
    .update({ enabled: enable, updated_at: new Date().toISOString() })
    .eq("feature_key", "agent_auto_reply");

  if (!error) {
    state.featureFlags.agent_auto_reply = enable;
    await loadAgentDashboard();
  }
}

function escapeRegExp(value) {
  return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function trashIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>';
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
