import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCookieConsentRecord,
  buildCookiePreferences,
  getInitialCookieConsentPrompt,
  parseCookieConsentRecord,
  parseCookiePreferences,
} from "./cookie-consent.mjs";

test("initial cookie consent prompt uses a non-blocking bar on first visit", () => {
  assert.deepEqual(getInitialCookieConsentPrompt(null), {
    showBar: true,
    openModal: false,
  });
});

test("initial cookie consent prompt stays hidden after a saved decision", () => {
  assert.deepEqual(getInitialCookieConsentPrompt(JSON.stringify({ necessary: true })), {
    showBar: false,
    openModal: false,
  });
});

test("cookie preference parsing always keeps necessary cookies enabled", () => {
  assert.deepEqual(parseCookiePreferences(JSON.stringify({ necessary: false, analytics: true })), {
    necessary: true,
    analytics: true,
    marketing: false,
    preference: false,
  });
});

test("cookie preference builder handles accept, reject, and custom modes", () => {
  assert.deepEqual(buildCookiePreferences(true), {
    necessary: true,
    analytics: true,
    marketing: true,
    preference: true,
  });

  assert.deepEqual(buildCookiePreferences(false), {
    necessary: true,
    analytics: false,
    marketing: false,
    preference: false,
  });

  assert.deepEqual(buildCookiePreferences("custom", { necessary: false, preference: true }), {
    necessary: true,
    analytics: false,
    marketing: false,
    preference: true,
  });
});

test("builds a backend consent record for authenticated users", () => {
  assert.deepEqual(
    buildCookieConsentRecord({
      profileId: "profile-1",
      preferences: { necessary: false, analytics: true, preference: true },
      decision: "custom",
      now: "2026-04-25T00:00:00.000Z",
    }),
    {
      profile_id: "profile-1",
      consent_version: "v1",
      necessary: true,
      analytics: true,
      marketing: false,
      preference: true,
      last_decision: "custom",
      source: "web",
      client_updated_at: "2026-04-25T00:00:00.000Z",
    },
  );
});

test("parses backend consent rows into local preferences", () => {
  assert.deepEqual(parseCookieConsentRecord({
    necessary: false,
    analytics: true,
    marketing: true,
    preference: false,
  }), {
    necessary: true,
    analytics: true,
    marketing: true,
    preference: false,
  });

  assert.equal(parseCookieConsentRecord(null), null);
});
