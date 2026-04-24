const SWITCH_DELAY_MS = 140;
const SWITCH_IN_MS = 400;
const FLIP_DURATION_MS = 560;
const FLIP_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";
const TRANSIENT_CLASSES = ["is-rank-up", "is-rank-down", "is-new-entry", "is-score-changed", "is-live-moving"];

export function createLeaderboardMotion({
  container,
  getKey,
  renderRow,
  statusEl = null,
} = {}) {
  const state = {
    contextKey: "",
    rows: [],
    cleanupTimer: 0,
    switchTimer: 0,
  };

  const prefersReducedMotion = () =>
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);

  const measureRows = () => {
    const layout = new Map();
    container?.querySelectorAll?.(".lb-row[data-row-key]").forEach((element) => {
      layout.set(element.dataset.rowKey, element.getBoundingClientRect());
    });
    return layout;
  };

  const clearTransientStyles = (element) => {
    if (!element) {
      return;
    }

    TRANSIENT_CLASSES.forEach((className) => element.classList.remove(className));
    element.style.transform = "";
    element.style.transition = "";
    element.style.willChange = "";
  };

  const scheduleCleanup = () => {
    window.clearTimeout(state.cleanupTimer);
    state.cleanupTimer = window.setTimeout(() => {
      container?.querySelectorAll?.(".lb-row").forEach(clearTransientStyles);
    }, FLIP_DURATION_MS + 120);
  };

  const applyRows = (rows) => {
    if (!container) {
      return;
    }

    container.innerHTML = rows.map((row) => renderRow(row)).join("");
  };

  const buildRowsForRender = (rows, enableHighlights) => {
    const previousIndexByKey = new Map(
      state.rows.map((row, index) => [String(getKey(row)), index]),
    );
    const previousRowByKey = new Map(
      state.rows.map((row) => [String(getKey(row)), row]),
    );

    return rows.map((row) => {
      const key = String(getKey(row));

      if (!enableHighlights) {
        return {
          ...row,
          motionKey: key,
          motionTrend: "same",
          motionClasses: "",
        };
      }

      const previousIndex = previousIndexByKey.get(key);
      const previousRow = previousRowByKey.get(key);
      const rankDelta = previousIndex == null ? 0 : previousIndex - row.rankIndex;
      const classes = [];
      let trend = "same";

      if (previousIndex == null) {
        classes.push("is-new-entry");
        trend = "new";
      } else if (rankDelta > 0) {
        classes.push("is-rank-up");
        trend = "up";
      } else if (rankDelta < 0) {
        classes.push("is-rank-down");
        trend = "down";
      }

      if (previousRow && Number(previousRow.score ?? 0) !== Number(row.score ?? 0)) {
        classes.push("is-score-changed");
      }

      return {
        ...row,
        motionKey: key,
        motionTrend: trend,
        motionClasses: classes.join(" "),
      };
    });
  };

  const replaceRows = (rows) => {
    if (!container) {
      return;
    }

    container.classList.add("switching");
    container.classList.remove("switching-in");
    window.clearTimeout(state.switchTimer);

    state.switchTimer = window.setTimeout(() => {
      applyRows(rows);
      container.classList.remove("switching");
      container.classList.add("switching-in");
      window.setTimeout(() => container.classList.remove("switching-in"), SWITCH_IN_MS);
      scheduleCleanup();
    }, SWITCH_DELAY_MS);
  };

  const animateReorder = (rows) => {
    if (!container) {
      return;
    }

    const previousLayout = measureRows();
    applyRows(rows);
    const nextLayout = measureRows();

    container.querySelectorAll(".lb-row[data-row-key]").forEach((element) => {
      const key = element.dataset.rowKey;
      const previousBox = previousLayout.get(key);
      const nextBox = nextLayout.get(key);

      if (!previousBox || !nextBox) {
        return;
      }

      const deltaY = previousBox.top - nextBox.top;
      if (Math.abs(deltaY) < 1) {
        return;
      }

      element.classList.add("is-live-moving");
      element.style.transition = "none";
      element.style.transform = `translateY(${deltaY}px)`;
      element.style.willChange = "transform";
      element.getBoundingClientRect();

      window.requestAnimationFrame(() => {
        element.style.transition = `transform ${FLIP_DURATION_MS}ms ${FLIP_EASING}`;
        element.style.transform = "translateY(0)";
      });
    });

    scheduleCleanup();
  };

  const update = (rows, { contextKey = "", mode = "replace" } = {}) => {
    if (!container) {
      return;
    }

    const canAnimateReorder =
      mode === "reorder" &&
      state.rows.length > 0 &&
      state.contextKey === contextKey &&
      !prefersReducedMotion();

    const renderedRows = buildRowsForRender(rows, canAnimateReorder);

    if (canAnimateReorder) {
      animateReorder(renderedRows);
    } else {
      replaceRows(renderedRows);
    }

    state.rows = rows.map((row) => ({ ...row }));
    state.contextKey = contextKey;
  };

  const setStatus = (text, tone = "idle") => {
    if (!statusEl) {
      return;
    }

    statusEl.textContent = text;
    statusEl.dataset.tone = tone;
  };

  return {
    update,
    setStatus,
  };
}
