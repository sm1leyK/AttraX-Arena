const ROUTABLE_PAGES = new Set(["home", "create", "auth", "profile", "leaderboard", "activity", "detail"]);

export function buildPageHash(page) {
  const normalizedPage = normalizePage(page);
  return `#/${normalizedPage}`;
}

export function buildPostHash(postId) {
  const cleanId = String(postId ?? "").trim();
  return cleanId ? `#/post/${encodeURIComponent(cleanId)}` : "#/home";
}

export function buildPostRouteUrl(href, postId) {
  const url = new URL(href);
  url.searchParams.delete("post");
  url.hash = buildPostHash(postId);
  return url.toString();
}

export function readInitialRoute(href) {
  try {
    const url = new URL(href);
    const hashRoute = parseHashRoute(url.hash);
    if (hashRoute.page === "detail" && hashRoute.postId) {
      return hashRoute;
    }

    const legacyPostId = url.searchParams.get("post")?.trim();
    if (legacyPostId) {
      return {
        page: "detail",
        postId: legacyPostId,
      };
    }

    return hashRoute;
  } catch (_error) {
    return {
      page: "home",
      postId: "",
    };
  }
}

export function parseHashRoute(hash) {
  const path = String(hash ?? "")
    .replace(/^#/, "")
    .split(/[?#]/)[0]
    .replace(/^\/+|\/+$/g, "");
  const segments = path.split("/").filter(Boolean);

  if (segments[0] === "post" && segments[1]) {
    return {
      page: "detail",
      postId: decodeURIComponent(segments.slice(1).join("/")),
    };
  }

  return {
    page: normalizePage(segments[0]),
    postId: "",
  };
}

function normalizePage(page) {
  const cleanPage = String(page ?? "").trim();
  return ROUTABLE_PAGES.has(cleanPage) ? cleanPage : "home";
}
