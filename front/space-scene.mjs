import { buildFocusTarget } from "./space-logic.mjs";

const FLOOR_SIZE = { width: 34, depth: 20 };
const WALL_HEIGHT = 10;
const PIXEL_CANVAS_SIZE = 256;

function createMaterial(THREE, color, extras = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.76,
    metalness: 0.1,
    ...extras,
  });
}

function createBasicTextureMaterial(THREE, texture, extras = {}) {
  return new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    toneMapped: false,
    ...extras,
  });
}

function createCanvasTexture(THREE, canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function drawRect(context, x, y, width, height, color) {
  context.fillStyle = color;
  context.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
}

function drawStrokeRect(context, x, y, width, height, color, lineWidth = 3) {
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(width), Math.round(height));
}

function fillRoundRect(context, x, y, width, height, radius, color) {
  const right = x + width;
  const bottom = y + height;
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(right - radius, y);
  context.quadraticCurveTo(right, y, right, y + radius);
  context.lineTo(right, bottom - radius);
  context.quadraticCurveTo(right, bottom, right - radius, bottom);
  context.lineTo(x + radius, bottom);
  context.quadraticCurveTo(x, bottom, x, bottom - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
  context.fillStyle = color;
  context.fill();
}

function drawFitText(context, text, x, y, maxWidth, maxSize = 22, minSize = 14, color = "#171717") {
  const family = "'Cascadia Mono', 'SFMono-Regular', Consolas, monospace";
  let size = maxSize;
  do {
    context.font = `700 ${size}px ${family}`;
    if (context.measureText(text).width <= maxWidth || size <= minSize) {
      break;
    }
    size -= 1;
  } while (size >= minSize);

  context.fillStyle = color;
  context.fillText(text, x, y);
}

function drawWindowChrome(context, accent) {
  drawRect(context, 18, 14, 224, 228, "#0e0f14");
  drawRect(context, 13, 10, 224, 228, "#3a302a");
  drawRect(context, 17, 14, 216, 220, "#15120f");
  drawRect(context, 22, 36, 206, 174, "#f7f8ff");
  drawRect(context, 22, 18, 206, 20, "#282018");
  drawRect(context, 22, 38, 10, 172, "#e7e7f2");
  drawRect(context, 218, 38, 10, 172, "#d8d7e7");
  drawStrokeRect(context, 17, 14, 216, 220, "#060606", 4);
  drawStrokeRect(context, 22, 36, 206, 174, "#272b3b", 3);

  for (const x of [188, 212]) {
    drawRect(context, x, 21, 11, 11, "#a77b69");
    drawStrokeRect(context, x, 21, 11, 11, "#5d4038", 2);
  }

  drawRect(context, 44, 54, 148, 8, "#eceaf5");
  drawRect(context, 51, 84, 156, 8, "#eceaf5");
  drawRect(context, 36, 116, 168, 8, "#eceaf5");
  drawRect(context, 170, 51, 32, 8, accent);
  drawRect(context, 44, 141, 22, 9, accent);
  drawRect(context, 178, 142, 30, 9, "#cbd5e1");
}

function drawSpeechBubble(context, text) {
  fillRoundRect(context, 20, 164, 216, 45, 8, "rgba(0,0,0,0.18)");
  fillRoundRect(context, 18, 160, 216, 45, 8, "#ffffff");
  drawStrokeRect(context, 18, 160, 216, 45, "#d6d6d6", 2);
  drawRect(context, 116, 154, 14, 10, "#ffffff");
  drawFitText(context, text, 30, 190, 192, 21, 14);
}

function drawNameTag(context, label) {
  const text = String(label ?? "").trim();
  if (!text) {
    return;
  }

  context.font = "700 17px 'Cascadia Mono', 'SFMono-Regular', Consolas, monospace";
  const width = Math.min(Math.max(context.measureText(text).width + 24, 66), 130);
  const x = Math.round((PIXEL_CANVAS_SIZE - width) / 2);
  drawRect(context, x + 4, 224, width, 23, "rgba(0,0,0,0.22)");
  drawRect(context, x, 219, width, 23, "#050505");
  drawStrokeRect(context, x, 219, width, 23, "#2f2f2f", 2);
  context.fillStyle = "#ffffff";
  context.fillText(text, x + 12, 236);
}

function drawDeskProp(context, avatar, mood = "idle", accent = "#7ba4db") {
  const isActive = mood !== "idle";

  if (avatar.accessory === "monitor") {
    drawRect(context, 29, 138, 55, 36, "#2f3b5b");
    drawRect(context, 33, 142, 47, 26, isActive ? "#b9ecff" : "#7fb8ff");
    drawRect(context, 40, 170, 34, 6, "#1f2638");
    for (let i = 0; i < 5; i += 1) {
      drawRect(context, 37 + i * 8, 146 + i * 2, 5, isActive ? 7 : 4, "#c8eeff");
    }
  }

  if (avatar.accessory === "paper") {
    drawRect(context, 78, 143, 100, 45, "#f5f1de");
    drawStrokeRect(context, 78, 143, 100, 45, "#d7ccb7", 2);
    drawRect(context, 91, 154, 70, 5, "#d9cfbf");
    drawRect(context, 89, 166, 78, 5, "#d9cfbf");
    drawRect(context, 94, 178, 58, 5, "#d9cfbf");
    if (isActive) {
      drawRect(context, 88, 187, 70, 5, accent);
    }
  }

  if (avatar.accessory === "notes") {
    drawRect(context, 38, 134, 42, 32, "#ffe2a7");
    drawRect(context, 180, 67, 24, 31, "#7bc9ff");
    drawRect(context, 188, 106, 22, 18, "#ffe27a");
    if (isActive) {
      drawRect(context, 172, 99, 28, 8, accent);
    }
  }
}

function drawFrontHuman(context, avatar, mood = "idle") {
  const isActive = mood !== "idle";

  drawRect(context, 78, 143, 100, 66, avatar.shadow);
  drawRect(context, 86, 134, 84, 76, avatar.shirt);
  drawRect(context, 112, 118, 32, 29, avatar.skin);
  drawRect(context, 80, 79, 96, 72, avatar.skin);
  drawRect(context, 72, 70, 112, 34, avatar.hair);
  drawRect(context, 64, 91, 24, 65, avatar.hairShade);
  drawRect(context, 168, 91, 22, 67, avatar.hairShade);
  drawRect(context, 91, 67, 70, 17, avatar.hair);
  drawRect(context, 119, 92, 56, 15, avatar.hairShade);
  drawRect(context, 98, isActive ? 116 : 119, isActive ? 11 : 9, isActive ? 27 : 25, "#4b2d2f");
  drawRect(context, 151, isActive ? 116 : 119, isActive ? 11 : 9, isActive ? 27 : 25, "#4b2d2f");
  if (isActive) {
    drawRect(context, 101, 120, 4, 6, "#fff7ed");
    drawRect(context, 154, 120, 4, 6, "#fff7ed");
  }
  drawRect(context, isActive ? 117 : 121, 145, isActive ? 25 : 17, isActive ? 7 : 6, "#c96f61");
  drawRect(context, 103, 71, 9, 7, "rgba(255,255,255,0.18)");
  drawRect(context, 134, 81, 36, 7, "rgba(255,255,255,0.14)");
}

function drawSideHuman(context, avatar, mood = "idle") {
  const isActive = mood !== "idle";
  const isRight = avatar.view === "right";
  const faceX = isRight ? 92 : 91;
  const hairBackX = isRight ? 78 : 81;
  const profileX = isRight ? 141 : 82;
  const eyeX = isRight ? 150 : 95;
  const mouthX = isRight ? 145 : 100;

  drawRect(context, 85, 143, 88, 66, avatar.shadow);
  drawRect(context, isRight ? 83 : 89, 134, 80, 76, avatar.shirt);
  drawRect(context, 107, 119, 32, 26, avatar.skin);
  drawRect(context, faceX, 82, 72, 72, avatar.skin);
  drawRect(context, profileX, 109, 18, 25, avatar.skin);
  drawRect(context, hairBackX, 72, 92, 37, avatar.hair);
  drawRect(context, isRight ? 75 : 77, 94, 28, 69, avatar.hairShade);
  drawRect(context, isRight ? 84 : 144, 91, 28, 19, avatar.hairShade);
  drawRect(context, eyeX, isActive ? 112 : 115, isActive ? 10 : 8, isActive ? 28 : 24, "#4b2d2f");
  if (isActive) {
    drawRect(context, eyeX + 3, 116, 4, 6, "#fff7ed");
  }
  drawRect(context, mouthX, 147, isActive ? 22 : 18, isActive ? 6 : 5, "#b75f56");
  drawRect(context, isRight ? 117 : 102, 76, 42, 8, "rgba(255,255,255,0.16)");

  if (avatar.accessory === "glasses") {
    drawRect(context, 150, 105, 20, 27, "#83e7ff");
    drawStrokeRect(context, 150, 105, 20, 27, "#111827", 4);
    drawRect(context, 86, 66, 78, 20, avatar.hairShade);
    drawRect(context, 82, 55, 92, 30, avatar.hair);
  }
}

function drawRobot(context, avatar, mood = "idle") {
  const isActive = mood !== "idle";

  drawRect(context, 77, 144, 102, 66, avatar.shadow);
  drawRect(context, 88, 132, 80, 78, avatar.shirt);
  drawRect(context, 65, 92, 20, 54, "#59627b");
  drawRect(context, 171, 92, 20, 54, "#59627b");
  drawRect(context, 77, 69, 102, 88, avatar.skin);
  drawRect(context, 85, 61, 86, 19, "#e8eef9");
  drawRect(context, 74, 84, 11, 28, "#d7dfed");
  drawRect(context, 171, 84, 11, 28, "#d7dfed");
  drawStrokeRect(context, 77, 69, 102, 88, "#6b7280", 5);
  drawRect(context, 101, isActive ? 107 : 111, isActive ? 12 : 9, isActive ? 27 : 23, isActive ? "#20d47b" : "#8a2d3a");
  drawRect(context, 148, isActive ? 107 : 111, isActive ? 12 : 9, isActive ? 27 : 23, isActive ? "#20d47b" : "#8a2d3a");
  drawRect(context, 113, 150, isActive ? 34 : 30, isActive ? 8 : 7, isActive ? "#94f5c2" : "#cbd5e1");
  drawRect(context, 94, 134, 69, 9, "#f1f5f9");
  drawRect(context, 56, 158, 26, 17, "#e5e7eb");
  drawRect(context, 174, 158, 26, 17, "#e5e7eb");
}

function drawPixelAvatar(context, workstation, mood = "idle") {
  const avatar = workstation.avatar ?? {};
  drawDeskProp(context, avatar, mood, workstation.accent);

  if (avatar.type === "robot") {
    drawRobot(context, avatar, mood);
    return;
  }

  if (avatar.view === "left" || avatar.view === "right") {
    drawSideHuman(context, avatar, mood);
    return;
  }

  drawFrontHuman(context, avatar, mood);
}

function createPixelWindowTexture(THREE, workstation, mood = "idle") {
  const canvas = document.createElement("canvas");
  canvas.width = PIXEL_CANVAS_SIZE;
  canvas.height = PIXEL_CANVAS_SIZE;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;

  context.clearRect(0, 0, canvas.width, canvas.height);
  drawWindowChrome(context, workstation.accent);
  drawPixelAvatar(context, workstation, mood);
  drawSpeechBubble(context, mood === "idle" ? workstation.activity ?? workstation.status : workstation.hoverActivity ?? workstation.activity ?? workstation.status);
  drawNameTag(context, workstation.avatar?.label ?? workstation.name);

  return createCanvasTexture(THREE, canvas);
}

function wrapLine(context, text, maxWidth) {
  const words = String(text ?? "").split("");
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = `${current}${word}`;
    if (context.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

function createBoardTexture(THREE, workstation) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 240;
  const context = canvas.getContext("2d");

  context.fillStyle = "#111827";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = workstation.accent;
  context.lineWidth = 10;
  context.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);

  context.fillStyle = "rgba(255,255,255,0.86)";
  context.font = "700 30px Cascadia Mono, monospace";
  context.fillText(workstation.name, 30, 54);

  context.fillStyle = workstation.accent;
  context.font = "600 22px sans-serif";
  context.fillText(workstation.role, 30, 89);

  context.fillStyle = "rgba(255,255,255,0.74)";
  context.font = "20px sans-serif";
  let y = 126;
  for (const line of [workstation.board, workstation.status]) {
    for (const wrapped of wrapLine(context, line, 430)) {
      context.fillText(wrapped, 30, y);
      y += 28;
      if (y > 218) {
        return createCanvasTexture(THREE, canvas);
      }
    }
  }

  return createCanvasTexture(THREE, canvas);
}

function createRoundedDeskDecor(THREE, color) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.38, 10),
    createMaterial(THREE, color, { emissive: color, emissiveIntensity: 0.18 }),
  );
  mesh.castShadow = true;
  return mesh;
}

function addWallPanel(THREE, scene, x, y, width, height, color = 0x2c3547) {
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, 0.05),
    createMaterial(THREE, color, { roughness: 0.88, metalness: 0.04 }),
  );
  panel.position.set(x, y, -FLOOR_SIZE.depth / 2 + 0.33);
  panel.receiveShadow = true;
  scene.add(panel);
}

function buildRoom(THREE, scene) {
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(FLOOR_SIZE.width, 0.6, FLOOR_SIZE.depth),
    createMaterial(THREE, 0x151923, { roughness: 0.94, metalness: 0.05 }),
  );
  floor.position.set(0, -0.3, 0);
  floor.receiveShadow = true;
  scene.add(floor);

  const wallMaterial = createMaterial(THREE, 0x1e2430, { roughness: 0.86, metalness: 0.06 });
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(FLOOR_SIZE.width, WALL_HEIGHT, 0.4), wallMaterial);
  backWall.position.set(0, WALL_HEIGHT / 2 - 0.3, -FLOOR_SIZE.depth / 2 + 0.1);
  backWall.receiveShadow = true;
  scene.add(backWall);

  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.4, WALL_HEIGHT, FLOOR_SIZE.depth), wallMaterial);
  leftWall.position.set(-FLOOR_SIZE.width / 2 + 0.1, WALL_HEIGHT / 2 - 0.3, 0);
  leftWall.receiveShadow = true;
  scene.add(leftWall);

  const rightWall = leftWall.clone();
  rightWall.position.x = FLOOR_SIZE.width / 2 - 0.1;
  scene.add(rightWall);

  for (let x = -14; x <= 14; x += 4) {
    addWallPanel(THREE, scene, x, 3.2, 0.08, 6.4, 0x3b4659);
  }
  for (let y = 1.2; y <= 7.2; y += 2) {
    addWallPanel(THREE, scene, 0, y, FLOOR_SIZE.width - 2, 0.08, 0x323b4d);
  }
  addWallPanel(THREE, scene, -10.2, 6.4, 3.4, 1.4, 0x273044);
  addWallPanel(THREE, scene, 10.4, 6.1, 3.1, 1.8, 0x273044);

  const grid = new THREE.GridHelper(FLOOR_SIZE.width, 24, 0x334155, 0x1f2937);
  grid.position.y = 0.01;
  grid.material.opacity = 0.22;
  grid.material.transparent = true;
  scene.add(grid);
}

function buildCharacter(THREE, workstation) {
  const group = new THREE.Group();
  const panelTextures = {
    idle: createPixelWindowTexture(THREE, workstation, "idle"),
    hover: createPixelWindowTexture(THREE, workstation, "hover"),
  };
  const frameMaterial = createMaterial(THREE, 0x0b0d12, { roughness: 0.8, metalness: 0.18 });
  const accentMaterial = createMaterial(THREE, workstation.accent, {
    emissive: workstation.accent,
    emissiveIntensity: 0.18,
  });

  const frame = new THREE.Mesh(new THREE.BoxGeometry(3.08, 3.08, 0.18), frameMaterial);
  frame.position.set(0, 2.66, 0.54);
  frame.castShadow = true;
  frame.receiveShadow = true;
  frame.userData = { workstationId: workstation.id, interactive: true, type: "character-frame" };
  group.add(frame);

  const portrait = new THREE.Mesh(
    new THREE.PlaneGeometry(2.92, 2.92),
    createBasicTextureMaterial(THREE, panelTextures.idle),
  );
  portrait.position.set(0, 2.66, 0.64);
  portrait.userData = {
    workstationId: workstation.id,
    interactive: true,
    type: "character",
    mood: "idle",
    textures: panelTextures,
  };
  group.add(portrait);

  const leftPost = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.18, 0.12), accentMaterial);
  leftPost.position.set(-1.05, 0.98, 0.43);
  leftPost.castShadow = true;
  group.add(leftPost);

  const rightPost = leftPost.clone();
  rightPost.position.x = 1.05;
  group.add(rightPost);

  group.userData = {
    workstationId: workstation.id,
    interactive: true,
    type: "character",
    mood: "idle",
  };

  return group;
}

function createDeskDecor(THREE, workstation) {
  if (workstation.decor === "charts") {
    const group = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 0.45), createMaterial(THREE, 0x0f172a));
    group.add(base);
    for (const [index, height] of [0.18, 0.32, 0.24].entries()) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, height, 0.12), createMaterial(THREE, workstation.accent));
      bar.position.set(-0.18 + index * 0.18, 0.04 + height / 2, 0);
      group.add(bar);
    }
    return group;
  }

  if (workstation.decor === "antenna") {
    const group = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.1, 10), createMaterial(THREE, 0x0f172a));
    group.add(base);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.62, 8), createMaterial(THREE, workstation.accent));
    tower.position.y = 0.32;
    group.add(tower);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), createMaterial(THREE, workstation.accent));
    ball.position.y = 0.66;
    group.add(ball);
    return group;
  }

  if (workstation.decor === "notes") {
    const group = new THREE.Group();
    for (const [index, color] of [0xfff7c2, 0xfed7aa, 0xbfdbfe].entries()) {
      const note = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 0.28), createMaterial(THREE, color));
      note.position.set(-0.16 + index * 0.16, 0.02, -0.04 + index * 0.02);
      group.add(note);
    }
    return group;
  }

  if (workstation.decor === "ringlight") {
    const group = new THREE.Group();
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.68, 8), createMaterial(THREE, 0x0f172a));
    stand.position.y = 0.34;
    group.add(stand);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.22, 0.04, 8, 16),
      createMaterial(THREE, workstation.accent, { emissive: workstation.accent, emissiveIntensity: 0.24 }),
    );
    ring.position.y = 0.78;
    group.add(ring);
    return group;
  }

  const group = new THREE.Group();
  const clipboard = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.03, 0.52), createMaterial(THREE, 0xe5e7eb));
  group.add(clipboard);
  const clip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.08), createMaterial(THREE, workstation.accent));
  clip.position.set(0, 0.03, -0.18);
  group.add(clip);
  return group;
}

function buildWorkstation(THREE, workstation) {
  const root = new THREE.Group();
  root.position.set(workstation.position.x, workstation.position.y, workstation.position.z);
  root.rotation.y = workstation.facing;
  root.userData = { workstationId: workstation.id, interactive: true, type: "station" };

  const deskMaterial = createMaterial(THREE, workstation.deskColor);
  const accentMaterial = createMaterial(THREE, workstation.accent, {
    emissive: workstation.accent,
    emissiveIntensity: 0.12,
  });
  const darkMaterial = createMaterial(THREE, 0x0f172a);

  const character = buildCharacter(THREE, workstation);
  character.userData = { ...character.userData, workstationId: workstation.id, interactive: true, type: "character" };
  root.userData.character = character;
  root.add(character);

  const deskTop = new THREE.Mesh(new THREE.BoxGeometry(2.85, 0.18, 1.22), deskMaterial);
  deskTop.position.set(0, 1.02, 0.98);
  deskTop.castShadow = true;
  deskTop.receiveShadow = true;
  root.add(deskTop);

  const deskFront = new THREE.Mesh(new THREE.BoxGeometry(2.95, 0.68, 0.12), deskMaterial);
  deskFront.position.set(0, 0.62, 1.56);
  deskFront.castShadow = true;
  deskFront.receiveShadow = true;
  root.add(deskFront);

  for (const offsetX of [-1.12, 1.12]) {
    for (const offsetZ of [0.48, 1.42]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.94, 0.14), darkMaterial);
      leg.position.set(offsetX, 0.5, offsetZ);
      leg.castShadow = true;
      root.add(leg);
    }
  }

  const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.05, 0.32), createMaterial(THREE, 0xe5e7eb));
  keyboard.position.set(0.08, 1.15, 1.16);
  root.add(keyboard);

  const boardTexture = createBoardTexture(THREE, workstation);
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 0.75),
    new THREE.MeshStandardMaterial({ map: boardTexture, roughness: 0.78, metalness: 0.04 }),
  );
  board.position.set(0.02, 1.42, 1.62);
  board.rotation.x = -Math.PI / 7;
  board.userData = { workstationId: workstation.id, interactive: true, type: "board" };
  root.add(board);

  const boardLip = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.08, 0.1), darkMaterial);
  boardLip.position.set(0.02, 1.08, 1.87);
  root.add(boardLip);

  const mug = createRoundedDeskDecor(THREE, workstation.accent);
  mug.scale.set(1, 0.7, 1);
  mug.position.set(-0.94, 1.24, 1.05);
  root.add(mug);

  const sideDecor = createDeskDecor(THREE, workstation);
  sideDecor.position.set(0.92, 1.2, 0.98);
  root.add(sideDecor);

  const halo = new THREE.Mesh(
    new THREE.CylinderGeometry(1.68, 1.68, 0.04, 24),
    createMaterial(THREE, workstation.accent, {
      emissive: workstation.accent,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.24,
    }),
  );
  halo.position.set(0, 0.03, 1.05);
  halo.userData = {
    workstationId: workstation.id,
    type: "halo",
    baseOpacity: 0.24,
    baseScale: 1,
  };
  root.userData.halo = halo;
  root.add(halo);

  return root;
}

function setStationMood(station, mood) {
  if (!station || station.userData?.mood === mood) {
    return;
  }

  station.userData.mood = mood;
  station.traverse((child) => {
    const textures = child.userData?.textures;
    if (!textures) {
      return;
    }

    const nextTexture = textures[mood] ?? textures.idle;
    if (child.material?.map !== nextTexture) {
      child.material.map = nextTexture;
      child.material.needsUpdate = true;
    }
    child.userData.mood = mood;
  });
}

function createRenderer(THREE, mount) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(mount.clientWidth || window.innerWidth, mount.clientHeight || window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  mount.innerHTML = "";
  mount.appendChild(renderer.domElement);
  return renderer;
}

function buildResponsiveFocus(THREE, mount, focusTarget) {
  const target = new THREE.Vector3(focusTarget.target.x, focusTarget.target.y, focusTarget.target.z);
  const position = new THREE.Vector3(focusTarget.position.x, focusTarget.position.y, focusTarget.position.z);
  const width = mount.clientWidth || window.innerWidth || 1;
  const height = mount.clientHeight || window.innerHeight || 1;

  if (width / Math.max(height, 1) < 0.82) {
    const direction = position.clone().sub(target).multiplyScalar(1.38);
    position.copy(target).add(direction);
    position.y += 0.35;
    target.y -= 0.95;
  }

  return { position, target };
}

export function createSpaceScene({ THREE, OrbitControls, mount, workstations, selectedId, onSelect, onActivate, onStatusChange }) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0c1016, 20, 44);
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

  const renderer = createRenderer(THREE, mount);
  const camera = new THREE.PerspectiveCamera(43, (mount.clientWidth || 1) / Math.max(mount.clientHeight || 1, 1), 0.1, 200);
  camera.position.set(0, 8.8, 22);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 8;
  controls.maxDistance = 32;
  controls.maxPolarAngle = Math.PI / 2.05;
  controls.target.set(0, 2.6, -1.4);

  scene.add(new THREE.AmbientLight(0xffffff, 1.34));

  const mainLight = new THREE.DirectionalLight(0xf1f5ff, 1.55);
  mainLight.position.set(5, 12, 10);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.set(2048, 2048);
  mainLight.shadow.camera.left = -24;
  mainLight.shadow.camera.right = 24;
  mainLight.shadow.camera.top = 24;
  mainLight.shadow.camera.bottom = -24;
  scene.add(mainLight);

  const fillLight = new THREE.PointLight(0x9bc5ff, 1.35, 42, 2);
  fillLight.position.set(-10, 7, 8);
  scene.add(fillLight);

  const rimLight = new THREE.PointLight(0xffd18c, 0.78, 34, 2);
  rimLight.position.set(12, 6, -8);
  scene.add(rimLight);

  buildRoom(THREE, scene);

  const clickableObjects = [];
  const stationMap = new Map();

  for (const workstation of workstations) {
    const station = buildWorkstation(THREE, workstation);
    scene.add(station);
    stationMap.set(workstation.id, station);
    station.traverse((child) => {
      if (child.userData?.interactive) {
        clickableObjects.push(child);
      }
    });
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let animationFrameId = 0;
  let currentSelectionId = selectedId;
  let hoveredId = "";
  let destroyed = false;
  let focusTween = null;

  focusWorkstation(selectedId, false);

  renderer.domElement.style.touchAction = "manipulation";
  renderer.domElement.addEventListener("pointermove", handlePointerMove);
  renderer.domElement.addEventListener("pointerleave", handlePointerLeave);
  renderer.domElement.addEventListener("pointerdown", handlePointerDown);
  window.addEventListener("resize", handleResize);

  animate();
  onStatusChange?.({ tone: "ready", message: "空间已就绪，点击头像窗口、工位或底部按钮即可查看详情。" });

  return {
    focusWorkstation,
    dispose,
  };

  function focusWorkstation(workstationId, animated = true) {
    const workstation = workstations.find((item) => item.id === workstationId) ?? workstations[0];
    if (!workstation) {
      return;
    }

    currentSelectionId = workstation.id;
    const nextFocus = buildResponsiveFocus(THREE, mount, buildFocusTarget(workstation));
    if (!animated) {
      camera.position.copy(nextFocus.position);
      controls.target.copy(nextFocus.target);
      controls.update();
    } else {
      focusTween = {
        startedAt: performance.now(),
        duration: 650,
        fromPosition: camera.position.clone(),
        fromTarget: controls.target.clone(),
        toPosition: nextFocus.position,
        toTarget: nextFocus.target,
      };
    }

    onSelect?.(workstation);
  }

  function handlePointerDown(event) {
    const workstationId = getPointerWorkstationId(event);
    if (workstationId) {
      setHoverWorkstation(workstationId);
      focusWorkstation(workstationId, true);
      onActivate?.(workstations.find((item) => item.id === workstationId) ?? null);
    }
  }

  function handlePointerMove(event) {
    setHoverWorkstation(getPointerWorkstationId(event));
  }

  function handlePointerLeave() {
    setHoverWorkstation("");
  }

  function getPointerWorkstationId(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(clickableObjects, true)[0];
    return findInteractiveWorkstationId(hit?.object);
  }

  function setHoverWorkstation(workstationId) {
    const nextId = workstationId && stationMap.has(workstationId) ? workstationId : "";
    if (hoveredId === nextId) {
      return;
    }

    hoveredId = nextId;
    renderer.domElement.style.cursor = hoveredId ? "pointer" : "";
    for (const [id, station] of stationMap.entries()) {
      setStationMood(station, id === hoveredId ? "hover" : "idle");
    }
  }

  function findInteractiveWorkstationId(object) {
    let current = object;
    while (current) {
      if (current.userData?.workstationId) {
        return current.userData.workstationId;
      }
      current = current.parent;
    }
    return "";
  }

  function handleResize() {
    if (destroyed) {
      return;
    }
    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    focusWorkstation(currentSelectionId, false);
  }

  function animate(now = performance.now()) {
    if (destroyed) {
      return;
    }

    animationFrameId = requestAnimationFrame(animate);

    if (focusTween) {
      const progress = Math.min((now - focusTween.startedAt) / focusTween.duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      camera.position.lerpVectors(focusTween.fromPosition, focusTween.toPosition, eased);
      controls.target.lerpVectors(focusTween.fromTarget, focusTween.toTarget, eased);
      if (progress >= 1) {
        focusTween = null;
      }
    }

    for (const [id, station] of stationMap.entries()) {
      const isHovered = id === hoveredId;
      const isSelected = id === currentSelectionId;
      const character = station.userData?.character;
      const halo = station.userData?.halo;
      const targetLift = reduceMotion ? 0 : isHovered ? 0.16 + Math.sin(now / 180) * 0.025 : isSelected ? 0.035 : 0;
      const targetScale = reduceMotion ? 1 : isHovered ? 1.045 : isSelected ? 1.015 : 1;

      if (character) {
        character.position.y += (targetLift - character.position.y) * 0.16;
        const nextScale = character.scale.x + (targetScale - character.scale.x) * 0.14;
        character.scale.setScalar(nextScale);
      }

      if (halo?.material) {
        const pulse = Math.sin(now / (isHovered ? 210 : 320)) * (isHovered ? 0.08 : 0.04);
        halo.material.opacity = isHovered ? 0.42 + pulse : isSelected ? 0.3 + pulse : 0.18;
        if (halo.material.emissive) {
          halo.material.emissiveIntensity = isHovered ? 0.52 + pulse : isSelected ? 0.34 + pulse : 0.2;
        }
        const haloScale = isHovered ? 1.08 : isSelected ? 1.03 : 1;
        halo.scale.set(haloScale, 1, haloScale);
      }
    }

    controls.update();
    renderer.render(scene, camera);
  }

  function dispose() {
    destroyed = true;
    cancelAnimationFrame(animationFrameId);
    renderer.domElement.removeEventListener("pointermove", handlePointerMove);
    renderer.domElement.removeEventListener("pointerleave", handlePointerLeave);
    renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
    window.removeEventListener("resize", handleResize);
    controls.dispose();
    const disposedTextures = new Set();
    scene.traverse((node) => {
      if (node.material?.map) {
        disposedTextures.add(node.material.map);
        node.material.map.dispose?.();
      }
      for (const texture of Object.values(node.userData?.textures ?? {})) {
        if (!disposedTextures.has(texture)) {
          texture.dispose?.();
          disposedTextures.add(texture);
        }
      }
      node.material?.dispose?.();
      node.geometry?.dispose?.();
    });
    renderer.dispose();
    mount.innerHTML = "";
  }
}
