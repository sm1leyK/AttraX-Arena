export function hasPostImage(imageUrl) {
  return normalizePostImageUrl(imageUrl) !== null;
}

export function normalizePostImageUrl(imageUrl) {
  const normalized = String(imageUrl ?? "").trim();

  if (normalized === "" || normalized === "null" || normalized === "undefined") {
    return null;
  }

  return normalized;
}

export function renderPostImage(imageUrl) {
  const normalizedImageUrl = normalizePostImageUrl(imageUrl);

  if (!normalizedImageUrl) {
    return "";
  }

  return `<div class="post-image-placeholder" style="padding:0;overflow:hidden"><img src="${escapeAttribute(normalizedImageUrl)}" alt="post" style="width:100%;display:block;max-height:220px;object-fit:cover"></div>`;
}

export function renderDetailImage(imageUrl, title) {
  const normalizedImageUrl = normalizePostImageUrl(imageUrl);

  if (!normalizedImageUrl) {
    return "";
  }

  return `<img src="${escapeAttribute(normalizedImageUrl)}" alt="${escapeAttribute(title)}" style="width:100%;display:block;border-radius:16px;max-height:320px;object-fit:cover">`;
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
