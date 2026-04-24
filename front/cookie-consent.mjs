export const COOKIE_PREFERENCES_STORAGE_KEY = "attrax_cookie_preferences_v1";
export const COOKIE_CONSENT_VERSION = "v1";

export const DEFAULT_COOKIE_PREFERENCES = Object.freeze({
  necessary: true,
  analytics: false,
  marketing: false,
  preference: false,
});

export function parseCookiePreferences(rawValue) {
  try {
    const parsed = JSON.parse(rawValue || "null");
    return {
      ...DEFAULT_COOKIE_PREFERENCES,
      ...(parsed && typeof parsed === "object" ? parsed : {}),
      necessary: true,
    };
  } catch (_error) {
    return { ...DEFAULT_COOKIE_PREFERENCES };
  }
}

export function getInitialCookieConsentPrompt(rawValue) {
  return {
    showBar: !hasSavedCookiePreferences(rawValue),
    openModal: false,
  };
}

export function buildCookiePreferences(mode, currentPreferences = {}) {
  if (mode === true) {
    return {
      necessary: true,
      analytics: true,
      marketing: true,
      preference: true,
    };
  }

  if (mode === false) {
    return {
      necessary: true,
      analytics: false,
      marketing: false,
      preference: false,
    };
  }

  return {
    ...DEFAULT_COOKIE_PREFERENCES,
    ...(currentPreferences || {}),
    necessary: true,
  };
}

export function buildCookieConsentRecord({
  profileId,
  preferences,
  decision = "custom",
  source = "web",
  now = new Date().toISOString(),
}) {
  if (!profileId) {
    return null;
  }

  const normalizedPreferences = buildCookiePreferences("custom", preferences);

  return {
    profile_id: profileId,
    consent_version: COOKIE_CONSENT_VERSION,
    necessary: true,
    analytics: normalizedPreferences.analytics,
    marketing: normalizedPreferences.marketing,
    preference: normalizedPreferences.preference,
    last_decision: normalizeCookieDecision(decision, normalizedPreferences),
    source,
    client_updated_at: now,
  };
}

export function parseCookieConsentRecord(record) {
  if (!record || typeof record !== "object") {
    return null;
  }

  return buildCookiePreferences("custom", {
    necessary: true,
    analytics: Boolean(record.analytics),
    marketing: Boolean(record.marketing),
    preference: Boolean(record.preference),
  });
}

export function normalizeCookieDecision(decision, preferences = {}) {
  if (decision === true || decision === "accept_all") {
    return "accept_all";
  }

  if (decision === false || decision === "reject_all") {
    return "reject_all";
  }

  const normalizedPreferences = buildCookiePreferences("custom", preferences);
  if (
    normalizedPreferences.analytics
    && normalizedPreferences.marketing
    && normalizedPreferences.preference
  ) {
    return "accept_all";
  }

  if (
    !normalizedPreferences.analytics
    && !normalizedPreferences.marketing
    && !normalizedPreferences.preference
  ) {
    return "reject_all";
  }

  return "custom";
}

function hasSavedCookiePreferences(rawValue) {
  if (!rawValue) {
    return false;
  }

  try {
    const parsed = JSON.parse(rawValue);
    return Boolean(parsed && typeof parsed === "object");
  } catch (_error) {
    return false;
  }
}
