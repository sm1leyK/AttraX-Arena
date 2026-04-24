export const SUPPORT_BOARD_MIN_LEAD_MINUTES = 15;
export const SUPPORT_BOARD_MAX_DEADLINE_LOCAL = "2026-04-26T18:00";
export const SUPPORT_BOARD_MAX_DEADLINE_ISO = "2026-04-26T10:00:00.000Z";
export const PROJECT_SUBMISSION_DEADLINE_LOCAL = "2026-04-26T00:00:00+08:00";
export const PROJECT_SUBMISSION_DEADLINE_ISO = "2026-04-25T16:00:00.000Z";
export const PROJECT_SUBMISSION_DEADLINE_LABEL = "2026年4月25日24时";
export const PROJECT_SUBMISSION_DEADLINE_TIMEZONE = "Asia/Shanghai";
export const PROJECT_SUBMISSION_DEADLINE_RPC = "get_project_submission_deadline";

export function getFallbackProjectSubmissionDeadlineConfig() {
  return {
    source: "fallback",
    deadlineIso: PROJECT_SUBMISSION_DEADLINE_ISO,
    deadlineLocal: PROJECT_SUBMISSION_DEADLINE_LOCAL,
    timezone: PROJECT_SUBMISSION_DEADLINE_TIMEZONE,
    label: PROJECT_SUBMISSION_DEADLINE_LABEL,
  };
}

export async function loadProjectSubmissionDeadlineConfig({ supabase } = {}) {
  if (!supabase?.rpc) {
    return getFallbackProjectSubmissionDeadlineConfig();
  }

  try {
    const { data, error } = await supabase.rpc(PROJECT_SUBMISSION_DEADLINE_RPC);
    if (error) {
      throw error;
    }

    return normalizeProjectSubmissionDeadlineConfig(data) ?? getFallbackProjectSubmissionDeadlineConfig();
  } catch (_error) {
    return getFallbackProjectSubmissionDeadlineConfig();
  }
}

export function normalizeProjectSubmissionDeadlineConfig(data) {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    return null;
  }

  const deadlineSource = row.deadline_at ?? row.deadlineIso ?? row.deadline_iso;
  const parsedDeadline = new Date(deadlineSource);
  if (!Number.isFinite(parsedDeadline.getTime())) {
    return null;
  }

  return {
    source: "backend",
    deadlineIso: parsedDeadline.toISOString(),
    deadlineLocal: row.deadline_local || PROJECT_SUBMISSION_DEADLINE_LOCAL,
    timezone: row.timezone || PROJECT_SUBMISSION_DEADLINE_TIMEZONE,
    label: row.label || PROJECT_SUBMISSION_DEADLINE_LABEL,
  };
}

export function parseLocalDateTimeInput(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function formatForDateTimeLocal(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function getSupportDeadlineBounds({ now = new Date() } = {}) {
  const minDate = new Date(now.getTime() + SUPPORT_BOARD_MIN_LEAD_MINUTES * 60_000);
  const maxDate = new Date(SUPPORT_BOARD_MAX_DEADLINE_ISO);
  return { minDate, maxDate };
}

export function buildSupportDeadlineValidation(selectedDate, { now = new Date() } = {}) {
  const { minDate, maxDate } = getSupportDeadlineBounds({ now });

  if (!selectedDate || !Number.isFinite(selectedDate.getTime())) {
    return {
      ok: false,
      message: `请选择支持率截止时间，范围为现在起至少 ${SUPPORT_BOARD_MIN_LEAD_MINUTES} 分钟，最晚到 2026 年 4 月 26 日 18:00。`,
    };
  }

  if (selectedDate.getTime() < minDate.getTime()) {
    return {
      ok: false,
      message: `支持率截止时间至少要晚于当前时间 ${SUPPORT_BOARD_MIN_LEAD_MINUTES} 分钟。`,
    };
  }

  if (selectedDate.getTime() > maxDate.getTime()) {
    return {
      ok: false,
      message: "支持率截止时间不能晚于 2026 年 4 月 26 日 18:00。",
    };
  }

  return {
    ok: true,
    message: `剩余 ${formatCountdownDuration(selectedDate.getTime() - now.getTime())}`,
  };
}

export function getMarketCountdownSnapshot(deadline, { now = new Date() } = {}) {
  const deadlineMs = parseTimestamp(deadline);
  if (deadlineMs == null) {
    return {
      expired: false,
      live: false,
      pending: true,
      valueText: "--:--:--",
      statusText: "待同步",
    };
  }

  const remainingMs = deadlineMs - now.getTime();
  if (remainingMs <= 0) {
    return {
      expired: true,
      live: false,
      pending: false,
      valueText: "00:00:00",
      statusText: "已结束",
    };
  }

  return {
    expired: false,
    live: true,
    pending: false,
    valueText: formatCountdownDuration(remainingMs),
    statusText: "进行中",
  };
}

export function getProjectSubmissionCountdownSnapshot({
  now = new Date(),
  deadlineIso = PROJECT_SUBMISSION_DEADLINE_ISO,
} = {}) {
  const deadlineMs = parseTimestamp(deadlineIso) ?? Date.parse(PROJECT_SUBMISSION_DEADLINE_ISO);
  const remainingMs = deadlineMs - now.getTime();
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    expired: remainingMs <= 0,
    live: remainingMs > 0,
    remainingMs: Math.max(0, remainingMs),
    days,
    hours,
    minutes,
    seconds,
    valueText: formatCountdownDuration(remainingMs),
  };
}

export function formatCountdownDuration(remainingMs) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${padCountdownPart(hours)}:${padCountdownPart(minutes)}:${padCountdownPart(seconds)}`;
  }

  return `${padCountdownPart(Math.floor(totalSeconds / 3600))}:${padCountdownPart(minutes)}:${padCountdownPart(seconds)}`;
}

export function parseTimestamp(value) {
  if (!value) {
    return null;
  }

  const timestamp = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function padCountdownPart(value) {
  return String(Math.max(0, Number(value) || 0)).padStart(2, "0");
}
