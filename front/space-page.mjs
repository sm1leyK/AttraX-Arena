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

export async function loadSpacePage() {
  const currentToken = ++loadToken;
  const elements = getSpacePageElements();
  if (!elements.canvas) {
    return;
  }

  renderSpaceDetail(elements, buildInitialSelection(SPACE_WORKSTATIONS, DEFAULT_WORKSTATION_ID));
  bindSpaceSelectors(elements);

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
  sceneController?.dispose?.();
  sceneController = null;
}
