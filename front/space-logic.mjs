import { DEFAULT_WORKSTATION_ID } from "./space-data.mjs";

export function findWorkstationById(workstations, id) {
  const normalizedId = String(id ?? "").trim();
  return workstations.find((item) => item.id === normalizedId) ?? workstations[0] ?? null;
}

export function buildSpaceDetailModel(workstation) {
  if (!workstation) {
    return {
      id: "",
      name: "未找到工位",
      role: "暂无角色信息",
      summary: "当前没有可展示的工位数据。",
      board: "--",
      status: "--",
    };
  }

  return {
    id: workstation.id,
    name: workstation.name,
    role: workstation.role,
    summary: workstation.summary,
    board: workstation.board,
    status: workstation.status,
  };
}

export function buildFocusTarget(workstation) {
  const focus = workstation?.focus ?? { x: 0, y: 3, z: 0 };
  const cameraOffset = workstation?.cameraOffset ?? { x: 0, y: 4.2, z: 7 };

  return {
    target: { ...focus },
    position: {
      x: focus.x + cameraOffset.x,
      y: focus.y + cameraOffset.y,
      z: focus.z + cameraOffset.z,
    },
  };
}

export function buildInitialSelection(workstations, preferredId = DEFAULT_WORKSTATION_ID) {
  return findWorkstationById(workstations, preferredId);
}

export function shouldActivateSpacePage(nextPage, currentPage) {
  return nextPage === "space" && currentPage !== "space";
}

export function shouldDisposeSpacePage(nextPage, currentPage) {
  return currentPage === "space" && nextPage !== "space";
}
