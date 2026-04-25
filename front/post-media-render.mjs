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

  const escapedImageUrl = escapeAttribute(normalizedImageUrl);

  return `<div class="post-image-placeholder"><a class="post-image-link" href="${escapedImageUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" aria-label="Open post image"><img src="${escapedImageUrl}" alt="post"></a></div>`;
}

export function renderDetailImage(imageUrl, title) {
  const normalizedImageUrl = normalizePostImageUrl(imageUrl);

  if (!normalizedImageUrl) {
    return "";
  }

  const escapedImageUrl = escapeAttribute(normalizedImageUrl);

  return `<a class="detail-image-link" href="${escapedImageUrl}" target="_blank" rel="noopener noreferrer" aria-label="Open post image"><img src="${escapedImageUrl}" alt="${escapeAttribute(title)}"></a>`;
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
