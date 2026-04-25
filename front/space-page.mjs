import { DEFAULT_WORKSTATION_ID, SPACE_WORKSTATIONS } from "./space-data.mjs";
import {
  buildInitialSelection,
  buildSpaceDetailModel,
  findWorkstationById,
} from "./space-logic.mjs";
import { createSpaceScene } from "./space-scene.mjs";

const THREE_MODULE_URL = "https://esm.sh/three@0.165.0";
const ORBIT_CONTROLS_URL = "https://esm.sh/three@0.165.0/examples/jsm/controls/OrbitControls?deps=three@0.165.0";

let sceneController = null;
let selectorCleanup = null;
let dialogCleanup = null;
let loadToken = 0;

export function getSpacePageElements(root = document) {
  return {
    canvas: root.getElementById("spaceCanvas"),
    detailName: root.getElementById("spaceDetailName"),
    detailRole: root.getElementById("spaceDetailRole"),
    detailText: root.getElementById("spaceDetailText"),
    detailBoard: root.getElementById("spaceDetailBoard"),
    detailStatus: root.getElementById("spaceDetailStatus"),
    status: root.getElementById("spaceStatus"),
    dialog: root.getElementById("spaceDialog"),
    dialogName: root.getElementById("spaceDialogName"),
    dialogRole: root.getElementById("spaceDialogRole"),
    dialogLine: root.getElementById("spaceDialogLine"),
    dialogStatus: root.getElementById("spaceDialogStatus"),
    dialogClose: root.getElementById("spaceDialogClose"),
    selectorButtons: Array.from(root.querySelectorAll("[data-space-target]")),
  };
}

export function renderSpaceDetail(elements, workstation) {
  const detail = buildSpaceDetailModel(workstation);
  if (elements.detailName) elements.detailName.textContent = detail.name;
  if (elements.detailRole) elements.detailRole.textContent = detail.role;
  if (elements.detailText) elements.detailText.textContent = detail.summary;
  if (elements.detailBoard) elements.detailBoard.textContent = detail.board;
  if (elements.detailStatus) elements.detailStatus.textContent = detail.status;
  setActiveSpaceSelector(elements, detail.id);
  return detail;
}

export function buildSpaceDialogModel(workstation) {
  const detail = buildSpaceDetailModel(workstation);
  return {
    id: detail.id,
    name: detail.name,
    role: detail.role,
    line: workstation?.dialogue?.line ?? detail.summary,
    status: workstation?.dialogue?.status ?? workstation?.activity ?? detail.status,
    accent: workstation?.accent ?? "#7ba4db",
  };
}

export function openSpaceDialog(elements, workstation) {
  const model = buildSpaceDialogModel(workstation);
  if (!elements.dialog) {
    return model;
  }

  if (elements.dialogName) elements.dialogName.textContent = model.name;
  if (elements.dialogRole) elements.dialogRole.textContent = model.role;
  if (elements.dialogLine) elements.dialogLine.textContent = model.line;
  if (elements.dialogStatus) elements.dialogStatus.textContent = model.status;
  elements.dialog.dataset.spaceTarget = model.id;
  elements.dialog.style.setProperty("--space-dialog-accent", model.accent);
  elements.dialog.classList.add("is-open");
  elements.dialog.setAttribute("aria-hidden", "false");
  return model;
}

export function closeSpaceDialog(elements) {
  if (!elements.dialog) {
    return;
  }

  elements.dialog.classList.remove("is-open");
  elements.dialog.setAttribute("aria-hidden", "true");
}

export function setSpaceStatus(elements, message, tone = "loading") {
  if (!elements.status) {
    return;
  }
  elements.status.textContent = message;
  elements.status.dataset.tone = tone;
}

export function setActiveSpaceSelector(elements, workstationId) {
  elements.selectorButtons?.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.spaceTarget === workstationId);
  });
}

function bindSpaceSelectors(elements) {
  selectorCleanup?.();

  const removers = elements.selectorButtons?.map((button) => {
    const handleClick = () => {
      const workstation = findWorkstationById(SPACE_WORKSTATIONS, button.dataset.spaceTarget);
      if (!workstation) {
        return;
      }

      renderSpaceDetail(elements, workstation);
      sceneController?.focusWorkstation?.(workstation.id, true);
      openSpaceDialog(elements, workstation);
    };

    button.addEventListener("click", handleClick);
    return () => button.removeEventListener("click", handleClick);
  }) ?? [];

  selectorCleanup = () => {
    for (const remove of removers) {
      remove();
    }
    selectorCleanup = null;
  };
}

function bindSpaceDialog(elements) {
  dialogCleanup?.();

  const removers = [];
  if (elements.dialogClose) {
    const handleClose = () => closeSpaceDialog(elements);
    elements.dialogClose.addEventListener("click", handleClose);
    removers.push(() => elements.dialogClose.removeEventListener("click", handleClose));
  }

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      closeSpaceDialog(elements);
    }
  };
  document.addEventListener("keydown", handleKeyDown);
  removers.push(() => document.removeEventListener("keydown", handleKeyDown));

  dialogCleanup = () => {
    for (const remove of removers) {
      remove();
    }
    dialogCleanup = null;
  };
}

export async function loadSpacePage() {
  const currentToken = ++loadToken;
  const elements = getSpacePageElements();
  if (!elements.canvas) {
    return;
  }

  renderSpaceDetail(elements, buildInitialSelection(SPACE_WORKSTATIONS, DEFAULT_WORKSTATION_ID));
  bindSpaceSelectors(elements);
  bindSpaceDialog(elements);
  closeSpaceDialog(elements);

  if (sceneController) {
    setSpaceStatus(elements, "空间已就绪，点击头像窗口、工位或底部按钮即可查看详情。", "ready");
    return;
  }

  setSpaceStatus(elements, "空间加载中，请稍候...", "loading");

  try {
    const [THREE, controlsModule] = await Promise.all([
      import(THREE_MODULE_URL),
      import(ORBIT_CONTROLS_URL),
    ]);

    if (currentToken !== loadToken) {
      return;
    }

    sceneController = createSpaceScene({
      THREE,
      OrbitControls: controlsModule.OrbitControls,
      mount: elements.canvas,
      workstations: SPACE_WORKSTATIONS,
      selectedId: DEFAULT_WORKSTATION_ID,
      onSelect: (workstation) => {
        renderSpaceDetail(elements, findWorkstationById(SPACE_WORKSTATIONS, workstation?.id));
      },
      onActivate: (workstation) => {
        const selected = findWorkstationById(SPACE_WORKSTATIONS, workstation?.id);
        renderSpaceDetail(elements, selected);
        openSpaceDialog(elements, selected);
      },
      onStatusChange: ({ tone, message }) => {
        setSpaceStatus(elements, message, tone);
      },
    });
  } catch (error) {
    console.error("Failed to load /space scene.", error);
    setSpaceStatus(elements, "空间加载失败，请检查网络或稍后重试。", "error");
  }
}

export function disposeSpacePage() {
  loadToken += 1;
  selectorCleanup?.();
  dialogCleanup?.();
  closeSpaceDialog(getSpacePageElements());
  sceneController?.dispose?.();
  sceneController = null;
}
