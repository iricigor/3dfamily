"use strict";

const fileInput = document.querySelector("#gedcom-file");
const uploadArea = document.querySelector(".upload");
const welcome = document.querySelector("#welcome");
const status = document.querySelector("#status");
const familyView = document.querySelector("#family-view");
const scene = document.querySelector("#scene");
const peopleList = document.querySelector("#people");
const themeToggle = document.querySelector("#theme-toggle");
const simplifyNames = document.querySelector("#simplify-names");
const showSecondRelatives = document.querySelector("#show-second-relatives");
const cardColors = document.querySelector("#card-colors");
const colorLegend = document.querySelector("#color-legend");
const menuToggle = document.querySelector("#menu-toggle");
const menu = document.querySelector("#menu");
const personPicker = document.querySelector("#person-picker");
const personOptions = document.querySelector("#person-options");
const memberCount = document.querySelector("#member-count");
const pickerIds = new Map();
const main = document.querySelector("main");
let familyData = null;
let centerPersonId;
let THREE, renderer, world, camera, controls, members;
let tiles = [];
let connectorPoints = [];
let sceneReady;
let sceneResizeObserver;
let pendingInitialFit = false;
let uploadVersion = 0;

function setMenuOpen(open) {
  menu.hidden = !open;
  menuToggle.setAttribute("aria-expanded", String(open));
}

menuToggle.addEventListener("click", () => {
  const open = menu.hidden;
  setMenuOpen(open);
  if (open) menu.querySelector("button, input, select").focus();
});
document.addEventListener("click", (event) => {
  if (!menu.hidden && !menu.contains(event.target) && !menuToggle.contains(event.target)) setMenuOpen(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !menu.hidden) {
    setMenuOpen(false);
    menuToggle.focus();
  }
});
menu.addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  const controls = [...menu.querySelectorAll("button, input, select")]
    .filter((control) => !control.disabled && control.getClientRects().length);
  const first = controls[0], last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

function updatePersonChooser(individuals, selectedId) {
  const people = [...individuals.values()];
  const names = new Map();
  for (const person of people) {
    const name = person.name || `Unknown person (${person.id})`;
    names.set(name, (names.get(name) || 0) + 1);
  }
  pickerIds.clear();
  personOptions.replaceChildren();
  for (const person of people) {
    const name = person.name || `Unknown person (${person.id})`;
    const label = names.get(name) > 1 ? `${name} (${person.id})` : name;
    const option = document.createElement("option");
    option.value = label;
    personOptions.append(option);
    pickerIds.set(label, person.id);
  }
  const selected = individuals.get(selectedId);
  personPicker.value = selected
    ? (names.get(selected.name || `Unknown person (${selected.id})`) > 1
      ? `${selected.name || `Unknown person (${selected.id})`} (${selected.id})`
      : selected.name || `Unknown person (${selected.id})`)
    : "";
}

personPicker.addEventListener("change", () => {
  const id = pickerIds.get(personPicker.value);
  if (familyData && id) renderFamily(familyData, id);
});

themeToggle.addEventListener("click", () => {
  const isDark = document.documentElement.dataset.theme !== "dark";
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  themeToggle.setAttribute("aria-pressed", String(isDark));
  themeToggle.textContent = isDark ? "Light mode" : "Dark mode";
  if (familyData) renderFamily(familyData, centerPersonId);
});

simplifyNames.addEventListener("change", () => {
  if (familyData) renderFamily(familyData, centerPersonId);
});

showSecondRelatives.addEventListener("change", () => {
  if (familyData) renderFamily(familyData, centerPersonId);
});

cardColors.addEventListener("change", () => {
  colorLegend.hidden = cardColors.value !== "sex";
  if (familyData) renderFamily(familyData, centerPersonId);
});

document.querySelector("#change-file").addEventListener("click", () => fileInput.click());

function parseGedcom(text) {
  const individuals = new Map();
  const families = new Map();
  let current = null;

  for (const rawLine of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^0(?:\s|$)/.test(line)) {
      current = null;
      const record = line.match(/^0\s+(@[^@]+@)\s+(INDI|FAM)\b/);
      if (!record) continue;
      current = record[2] === "INDI"
        ? { type: "INDI", id: record[1], name: "", lastName: "", sex: "", famc: [], fams: [] }
        : { type: "FAM", id: record[1], husband: "", wife: "", children: [] };
      (current.type === "INDI" ? individuals : families).set(current.id, current);
      continue;
    }

    if (!current) continue;

    const field = line.match(/^1\s+(\w+)(?:\s+(.*))?$/);
    if (!field) continue;
    const [, tag, value = ""] = field;

    if (current.type === "INDI") {
      if (tag === "NAME") {
        current.name = value.replaceAll("/", "").replace(/\s+/g, " ").trim();
        current.lastName = value.match(/\/([^/]*)\//)?.[1].trim() || "";
      }
      if (tag === "SEX") current.sex = value.trim();
      if (tag === "FAMC") current.famc.push(value.trim());
      if (tag === "FAMS") current.fams.push(value.trim());
    } else {
      if (tag === "HUSB") current.husband = value.trim();
      if (tag === "WIFE") current.wife = value.trim();
      if (tag === "CHIL") current.children.push(value.trim());
    }
  }

  return { individuals, families };
}

const exampleGedcom = `0 HEAD
1 SOUR 3D Family example
0 @I1@ INDI
1 NAME Sam /Example/
1 SEX X
1 FAMC @F1@
0 @I2@ INDI
1 NAME Alex /Example/
1 SEX X
1 FAMS @F1@
0 @I3@ INDI
1 NAME Jamie /Example/
1 SEX X
1 FAMS @F1@
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I3@
1 CHIL @I1@
0 TRLR`;

function relativesOf(center, individuals, families) {
  const parents = new Set();
  const siblings = new Set();
  const spouses = new Set();
  const children = new Set();
  const grandparents = new Set();
  const grandchildren = new Set();

  for (const familyId of center.famc) {
    const family = families.get(familyId);
    if (!family) continue;
    if (family.husband) parents.add(family.husband);
    if (family.wife) parents.add(family.wife);
    for (const childId of family.children) {
      if (childId !== center.id) siblings.add(childId);
    }
  }

  for (const familyId of center.fams) {
    const family = families.get(familyId);
    if (!family) continue;
    for (const partnerId of [family.husband, family.wife]) {
      if (partnerId && partnerId !== center.id) spouses.add(partnerId);
    }
    for (const childId of family.children) {
      if (childId !== center.id) children.add(childId);
    }
  }

  const people = (ids) => [...ids]
    .map((id) => individuals.get(id))
    .filter(Boolean);
  const directIds = new Set([center.id, ...parents, ...siblings, ...spouses, ...children]);
  const secondIds = new Set();
  const addSecondDegree = (ids) => people(ids)
    .filter((person) => !directIds.has(person.id) && !secondIds.has(person.id))
    .filter((person) => secondIds.add(person.id));

  for (const parent of people(parents)) {
    for (const familyId of parent.famc) {
      const family = families.get(familyId);
      if (!family) continue;
      if (family.husband) grandparents.add(family.husband);
      if (family.wife) grandparents.add(family.wife);
    }
  }

  for (const child of people(children)) {
    for (const familyId of child.fams) {
      const family = families.get(familyId);
      if (family) family.children.forEach((id) => grandchildren.add(id));
    }
  }

  return {
    parents: people(parents),
    siblings: people(siblings),
    spouses: people(spouses),
    children: people(children),
    grandparents: addSecondDegree(grandparents),
    grandchildren: addSecondDegree(grandchildren)
  };
}

function initializeScene() {
  return sceneReady ??= createScene().catch((error) => {
    sceneReady = null;
    throw error;
  });
}

async function createScene() {
  try {
    THREE = await import("three");
    const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.setAttribute("aria-hidden", "true");
    scene.append(renderer.domElement);
    world = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(0, 8, 15);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.minPolarAngle = 0.1;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 3;
    controls.maxDistance = 2000;
    const panButton = document.querySelector("#pan-mode");
    const rotateButton = document.querySelector("#rotate-mode");
    const setMode = (mode) => {
      controls.mouseButtons.LEFT = mode === "pan" ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
      controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
      controls.touches.ONE = mode === "pan" ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
      controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
      panButton?.setAttribute("aria-pressed", String(mode === "pan"));
      rotateButton?.setAttribute("aria-pressed", String(mode === "rotate"));
    };
    panButton?.addEventListener("click", () => setMode("pan"));
    rotateButton?.addEventListener("click", () => setMode("rotate"));
    document.querySelector("#fit-family")?.addEventListener("click", () => {
      pendingInitialFit = false;
      layoutScene(true);
    });
    document.querySelector("#reset-view")?.addEventListener("click", () => {
      pendingInitialFit = false;
      camera.position.set(0, 8, 15);
      controls.target.set(0, 0, 0);
      layoutScene(true);
    });
    setMode("rotate");
    controls.addEventListener("start", () => { pendingInitialFit = false; });
    controls.addEventListener("change", drawScene);
    world.add(new THREE.HemisphereLight(0xffffff, 0x536078, 1.4));
    const light = new THREE.DirectionalLight(0xffffff, 1.5);
    light.position.set(-3, 10, 6);
    world.add(light);
    members = new THREE.Group();
    world.add(members);
    if ("ResizeObserver" in window) {
      sceneResizeObserver = new ResizeObserver(() => {
        if (familyView.hidden || !scene.clientWidth || !scene.clientHeight) return;
        layoutScene(pendingInitialFit);
        pendingInitialFit = false;
      });
      sceneResizeObserver.observe(scene);
    }

    let pointerStart;
    const activePointers = new Set();
    renderer.domElement.addEventListener("pointerdown", (event) => {
      activePointers.add(event.pointerId);
      if (activePointers.size > 1 && pointerStart) pointerStart.dragged = true;
      if (event.isPrimary && event.button === 0) {
        pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: activePointers.size > 1 };
      }
    });
    renderer.domElement.addEventListener("pointermove", (event) => {
      if (pointerStart?.id === event.pointerId &&
          Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 5) {
        pointerStart.dragged = true;
      }
    });
    renderer.domElement.addEventListener("pointercancel", (event) => {
      activePointers.delete(event.pointerId);
      pointerStart = null;
    });
    renderer.domElement.addEventListener("pointerup", (event) => {
      activePointers.delete(event.pointerId);
      if (pointerStart?.id !== event.pointerId) return;
      const start = pointerStart;
      pointerStart = null;
      if (!familyData || !event.isPrimary || event.button !== 0 || start.dragged ||
          Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2(
        (event.clientX - rect.left) / rect.width * 2 - 1,
        -(event.clientY - rect.top) / rect.height * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(tiles, false)[0];
      if (hit) renderFamily(familyData, hit.object.userData.personId);
    });
  } catch {
    sceneResizeObserver?.disconnect();
    sceneResizeObserver = null;
    controls?.dispose();
    renderer?.dispose();
    renderer = null;
    scene.replaceChildren();
    throw new Error("The 3D view needs WebGL and access to the Three.js CDN. Enable WebGL and check your connection, then choose the file again.");
  }
}

function drawScene() {
  if (renderer && !familyView.hidden) renderer.render(world, camera);
}

function clearScene() {
  if (!members) return;
  members.traverse((object) => {
    object.geometry?.dispose();
    if (object.material) {
      object.material.map?.dispose();
      object.material.dispose();
    }
  });
  members.clear();
  tiles = [];
  connectorPoints = [];
}

function tileTexture(name, role, colors, person) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 320;
  const context = canvas.getContext("2d");
  const sex = person.sex.trim().toUpperCase();
  const fill = cardColors.value === "sex" && (sex === "M" || sex === "F")
    ? sex === "M" ? "--sex-m-bg" : "--sex-f-bg"
    : "--card-bg";
  context.fillStyle = colors.getPropertyValue(fill).trim();
  context.fillRect(0, 0, 512, 320);
  context.fillStyle = colors.getPropertyValue("--text").trim();
  context.textAlign = "center";
  context.textBaseline = "middle";
  const maxWidth = 420;
  let size = 46;
  context.font = `600 ${size}px system-ui, sans-serif`;
  while (context.measureText(name).width > maxWidth && size > 37) {
    size -= 1;
    context.font = `600 ${size}px system-ui, sans-serif`;
  }
  let lines = [name];
  if (context.measureText(name).width > maxWidth) {
    const words = name.trim().split(/\s+/);
    let best;
    for (let split = 1; split < words.length; split++) {
      const first = words.slice(0, split).join(" ");
      const second = words.slice(split).join(" ");
      const firstWidth = context.measureText(first).width;
      const secondWidth = context.measureText(second).width;
      if (Math.max(firstWidth, secondWidth) <= maxWidth &&
          (!best || Math.abs(firstWidth - secondWidth) < best.difference)) {
        best = { lines: [first, second], difference: Math.abs(firstWidth - secondWidth) };
      }
    }
    if (best) lines = best.lines;
  }
  lines.forEach((line, index) => {
    context.fillText(line, 256, 132 + (index - (lines.length - 1) / 2) * (size + 8), maxWidth);
  });
  context.font = "28px system-ui, sans-serif";
  context.fillStyle = colors.getPropertyValue("--person-muted").trim();
  context.fillText(role === "center" ? "Center person" : role.replace("-", " "), 256, 270);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function personDisplayName(person, center) {
  const name = person.name || `Unknown person (${person.id})`;
  if (!simplifyNames.checked || person.id === center.id || !person.lastName ||
      person.lastName.toLocaleLowerCase() !== center.lastName?.toLocaleLowerCase()) return name;
  return name.split(/\s+/)[0] || name;
}

function roundedShape(width, height, radius) {
  const x = -width / 2, y = -height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

function addPerson(person, role, x, z, colors, center) {
  const displayName = personDisplayName(person, center);
  const card = document.createElement("button");
  card.type = "button";
  card.className = `person ${role}`;
  card.dataset.personId = person.id;
  card.setAttribute("aria-label", `${person.name || `Unknown person (${person.id})`}, ${role === "center" ? "center person" : role.replace("-", " ")}`);
  card.title = person.name || `Unknown person (${person.id})`;
  if (cardColors.value === "sex" && person.sex.trim().toUpperCase() === "M") card.classList.add("sex-m");
  if (cardColors.value === "sex" && person.sex.trim().toUpperCase() === "F") card.classList.add("sex-f");
  if (role === "center") card.setAttribute("aria-current", "true");

  const name = document.createElement("strong");
  name.textContent = displayName;
  const label = document.createElement("small");
  label.textContent = role === "center" ? "Center person" : role.replace("-", " ");
  card.append(name, label);
  peopleList.append(card);

  const height = role === "center" ? 2.73 : 2.6;
  const width = role === "center" ? 4.4 : 4.2;
  const border = role === "center" ? 0.08 : 0.045;
  const radius = 0.24;
  const shape = roundedShape(width, height, radius);
  const backing = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: 0.09, bevelEnabled: false, curveSegments: 8 }),
    new THREE.MeshStandardMaterial({
      color: colors.getPropertyValue(role === "center" ? "--center-border" : "--border").trim(),
      roughness: 1, metalness: 0
    })
  );
  backing.position.set(x, height / 2, z);
  members.add(backing);
  const faceWidth = width - border * 2, faceHeight = height - border * 2;
  const geometry = new THREE.ShapeGeometry(roundedShape(faceWidth, faceHeight, Math.max(0.03, radius - border)), 8);
  const positions = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < positions.count; i++) {
    uv.setXY(i, positions.getX(i) / faceWidth + 0.5, positions.getY(i) / faceHeight + 0.5);
  }
  const tile = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      map: tileTexture(displayName, role, colors, person),
      side: THREE.DoubleSide
    })
  );
  tile.position.set(x, height / 2, z + 0.091);
  tile.userData.personId = person.id;
  members.add(tile);
  tiles.push(tile);
  const rear = new THREE.Mesh(geometry.clone(), tile.material.clone());
  rear.position.set(x, height / 2, z - 0.001);
  rear.rotation.y = Math.PI;
  rear.userData.personId = person.id;
  members.add(rear);
  tiles.push(rear);

  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = 256;
  shadowCanvas.height = 64;
  const context = shadowCanvas.getContext("2d");
  context.scale(1, 0.25);
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, "rgba(0,0,0,0.25)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 1.35, 1.1),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(shadowCanvas),
      transparent: true,
      depthWrite: false,
      toneMapped: false
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(x, 0.01, z);
  members.add(shadow);
  return { x, z };
}

function addConnector(points, color) {
  const path = points.map(({ x, z }) => new THREE.Vector3(x, 0.06, z))
    .filter((point, index, all) => !index || point.distanceTo(all[index - 1]) > 0.001);
  if (path.length < 2) return;
  const curve = new THREE.CurvePath();
  let previous = path[0];
  for (let i = 1; i < path.length - 1; i++) {
    const corner = path[i];
    const incoming = previous.clone().sub(corner);
    const outgoing = path[i + 1].clone().sub(corner);
    const radius = Math.min(0.3, incoming.length() / 2, outgoing.length() / 2);
    const before = corner.clone().add(incoming.normalize().multiplyScalar(radius));
    const after = corner.clone().add(outgoing.normalize().multiplyScalar(radius));
    if (previous.distanceTo(before) > 0.001) curve.add(new THREE.LineCurve3(previous, before));
    curve.add(new THREE.QuadraticBezierCurve3(before, corner, after));
    previous = after;
  }
  if (previous.distanceTo(path.at(-1)) > 0.001) {
    curve.add(new THREE.LineCurve3(previous, path.at(-1)));
  }
  if (!curve.curves.length) return;
  members.add(new THREE.Mesh(
    new THREE.TubeGeometry(curve, 24, 0.035, 8, false),
    new THREE.MeshBasicMaterial({ color })
  ));
}

function connectFamily(parents, children, colors, routes, busZs, familyIndex, lane) {
  const familyColor = colors.getPropertyValue("--connector").trim();
  const spouseColor = colors.getPropertyValue("--spouse-connector").trim();
  const add = (points, color, bus = false) => routes.push({ points, color, bus, familyIndex });
  const cardEdge = (point, toward) => {
    const dx = toward.x - point.x, dz = toward.z - point.z;
    if (Math.abs(dx) >= Math.abs(dz)) {
      return { x: point.x + Math.sign(dx || 1) * 2.1, z: point.z };
    }
    return { x: point.x, z: point.z + Math.sign(dz || 1) * 0.12 };
  };
  let parentAnchor = parents[0];

  if (parents.length === 2) {
    const [first, second] = parents;
    const vertical = Math.abs(first.x - second.x) < 0.01;
    if (vertical) {
      const railX = first.x - 2.8 + lane;
      parentAnchor = { x: railX, z: (first.z + second.z) / 2 };
      for (const offset of [-0.09, 0.09]) {
        const x = railX + offset;
        add([cardEdge(first, { x, z: first.z }), { x, z: first.z }, { x, z: second.z },
          cardEdge(second, { x, z: second.z })], spouseColor);
      }
      if (children.length) add([
        { x: railX - 0.09, z: parentAnchor.z }, { x: railX + 0.09, z: parentAnchor.z }
      ], familyColor);
    } else {
      const railZ = (Math.abs(first.z - second.z) < 0.01
        ? first.z - 1.4 : (first.z + second.z) / 2) + lane;
      parentAnchor = { x: (first.x + second.x) / 2, z: railZ };
      for (const offset of [-0.09, 0.09]) {
        const z = railZ + offset;
        add([cardEdge(first, second), { x: first.x, z }, { x: second.x, z }, cardEdge(second, first)], spouseColor);
      }
      if (children.length) add([
        { x: parentAnchor.x, z: railZ - 0.09 }, { x: parentAnchor.x, z: railZ + 0.09 }
      ], familyColor);
    }
  }

  if (!children.length || (!parentAnchor && children.length < 2)) return;
  const childrenZ = children.reduce((sum, child) => sum + child.z, 0) / children.length;
  let busZ = (parentAnchor && Math.abs(parentAnchor.z - childrenZ) > 0.01
    ? (parentAnchor.z + childrenZ) / 2 : childrenZ - 0.8) + lane;
  while (busZs.some((used) => Math.abs(used - busZ) < 0.3)) busZ += 0.3;
  busZs.push(busZ);
  const xs = children.map((child) => child.x);
  if (parentAnchor) xs.push(parentAnchor.x);
  const left = Math.min(...xs), right = Math.max(...xs);
  add([{ x: left, z: busZ }, { x: right, z: busZ }], familyColor, true);
  for (const child of children) {
    const rail = { x: child.x, z: busZ };
    add([cardEdge(child, rail), rail], familyColor);
  }
  if (parentAnchor) {
    const rail = { x: parentAnchor.x, z: busZ };
    add([parents.length === 1 ? cardEdge(parentAnchor, rail) : parentAnchor, rail], familyColor);
  } else {
    const marker = new THREE.Mesh(
      new THREE.RingGeometry(0.1, 0.17, 24),
      new THREE.MeshBasicMaterial({ color: familyColor, side: THREE.DoubleSide })
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.set((left + right) / 2, 0.065, busZ);
    members.add(marker);
  }
}

function drawConnectors(routes) {
  const horizontals = [];
  for (const route of routes) {
    for (let i = 1; i < route.points.length; i++) {
      const start = route.points[i - 1], end = route.points[i];
      if (Math.abs(start.z - end.z) < 0.001 && Math.abs(start.x - end.x) > 0.001) {
        horizontals.push({ start, end, familyIndex: route.familyIndex });
      }
    }
  }
  for (const route of routes) {
    let part = [route.points[0]];
    for (let i = 1; i < route.points.length; i++) {
      const start = route.points[i - 1], end = route.points[i];
      if (Math.abs(start.x - end.x) < 0.001 && Math.abs(start.z - end.z) > 0.001) {
        const direction = Math.sign(end.z - start.z);
        // Break foreign branches at crossings rather than implying a junction.
        const crossings = horizontals.filter((line) => line.familyIndex !== route.familyIndex &&
          start.x >= Math.min(line.start.x, line.end.x) &&
          start.x <= Math.max(line.start.x, line.end.x) &&
          (line.start.z - start.z) * direction > 0.12 &&
          (end.z - line.start.z) * direction > 0.12)
          .map((line) => (line.start.z - start.z) * direction)
          .sort((a, b) => a - b);
        const gaps = [];
        for (const crossing of crossings) {
          const last = gaps.at(-1);
          if (last && crossing - 0.12 <= last[1]) last[1] = Math.max(last[1], crossing + 0.12);
          else gaps.push([crossing - 0.12, crossing + 0.12]);
        }
        for (const [before, after] of gaps) {
          part.push({ x: start.x, z: start.z + direction * before });
          addConnector(part, route.color);
          part = [{ x: start.x, z: start.z + direction * after }];
        }
      }
      part.push(end);
    }
    addConnector(part, route.color);
  }
}

function layoutScene(fit = false) {
  if (!renderer || familyView.hidden) return;
  const width = scene.clientWidth;
  const height = scene.clientHeight;
  if (!width || !height) return;
  camera.aspect = width / height;
  if (fit === true && tiles.length) {
    const bounds = new THREE.Box3();
    tiles.forEach((tile) => bounds.expandByObject(tile));
    connectorPoints.forEach(({ x, z }) => bounds.expandByPoint(new THREE.Vector3(x, 0, z)));
    const target = bounds.getCenter(new THREE.Vector3());
    const direction = camera.position.clone().sub(controls.target).normalize();
    const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    const tanVertical = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const picker = document.querySelector(".picker-panel").getBoundingClientRect();
    const toolbar = document.querySelector(".toolbar").getBoundingClientRect();
    const topInset = Math.max(0, picker.bottom) + 16;
    const bottomInset = Math.max(0, height - toolbar.top) + 16;
    const heightRatio = Math.max(0.4, (height - topInset - bottomInset) / height);
    const widthRatio = Math.max(0.6, (width - 32) / width);
    let distance = 8;
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          const offset = new THREE.Vector3(x, y, z).sub(target);
          const depth = offset.dot(direction);
          distance = Math.max(distance,
            Math.abs(offset.dot(right)) * 1.15 / (tanVertical * camera.aspect * widthRatio) + depth,
            Math.abs(offset.dot(up)) * 1.15 / (tanVertical * heightRatio) + depth);
        }
      }
    }
    target.add(up.multiplyScalar(
      distance * tanVertical * (topInset - bottomInset) / height
    ));
    controls.target.copy(target);
    camera.position.copy(target).add(direction.multiplyScalar(distance));
    camera.far = Math.max(1000, distance * 5);
    controls.minDistance = 4;
    controls.maxDistance = Math.max(2000, distance * 3);
    controls.update();
  }
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  drawScene();
}

function renderFamily({ individuals, families }, centerId) {
  const center = centerId === undefined
    ? individuals.values().next().value
    : individuals.get(centerId);
  if (!center) throw new Error("No people were found. Choose a GEDCOM file containing INDI records.");

  const relatives = relativesOf(center, individuals, families);
  if (!showSecondRelatives.checked) {
    relatives.grandparents = [];
    relatives.grandchildren = [];
  }
  centerPersonId = center.id;
  updatePersonChooser(individuals, center.id);
  clearScene();
  peopleList.replaceChildren();
  const colors = getComputedStyle(document.documentElement);
  world.background = new THREE.Color(colors.getPropertyValue("--page-bg").trim());
  const positions = new Map();
  const place = (person, role, x, z) => {
    if (!positions.has(person.id)) positions.set(person.id, addPerson(person, role, x, z, colors, center));
  };
  place(center, "center", 0, 0);
  const row = (people, role, z) => people.forEach((person, index) =>
    place(person, role, (index - (people.length - 1) / 2) * 5.2, z));
  row(relatives.parents, "parent", -6);
  row(relatives.grandparents, "grandparent", -12);
  relatives.spouses.forEach((person, index) => place(person, "spouse", -5.2 - index * 5.2, 0));
  relatives.siblings.forEach((person, index) => place(person, "sibling", 5.2 + index * 5.2, 0));
  row(relatives.children, "child", 6);
  row(relatives.grandchildren, "grandchild", 12);
  const visibleFamilies = [];
  for (const family of families.values()) {
    const parents = [...new Set([family.husband, family.wife])].filter((id) => positions.has(id));
    const children = [...new Set(family.children)].filter((id) => positions.has(id) && !parents.includes(id));
    if (parents.length + children.length < 2) continue;
    visibleFamilies.push({ parents, children });
  }
  const routes = [], busZs = [];
  visibleFamilies.forEach(({ parents, children }, index) => connectFamily(
    parents.map((id) => positions.get(id)), children.map((id) => positions.get(id)),
    colors, routes, busZs, index, (index - (visibleFamilies.length - 1) / 2) * 0.4
  ));
  connectorPoints = routes.flatMap((route) => route.points);
  drawConnectors(routes);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000),
    new THREE.MeshBasicMaterial({ color: colors.getPropertyValue("--page-bg").trim() })
  );
  floor.rotation.x = -Math.PI / 2;
  members.add(floor);

  const count = positions.size - 1;
  memberCount.textContent = `${count} family member${count === 1 ? "" : "s"} shown`;
  status.dataset.error = "false";
  status.textContent = `${center.name || `Unknown person (${center.id})`} is centered. ${count} family member${count === 1 ? "" : "s"} shown.`;
  familyView.hidden = false;
  pendingInitialFit = !familyData;
  layoutScene(pendingInitialFit);
  if (pendingInitialFit) {
    const version = uploadVersion;
    requestAnimationFrame(() => {
      if (version !== uploadVersion || !pendingInitialFit || familyView.hidden ||
          !scene.clientWidth || !scene.clientHeight) return;
      layoutScene(true);
      pendingInitialFit = false;
    });
  }
}

peopleList.addEventListener("click", (event) => {
  const card = event.target.closest(".person");
  if (!familyData || !card || !peopleList.contains(card)) return;
  renderFamily(familyData, card.dataset.personId);
  peopleList.querySelector(".person.center").focus();
});

window.addEventListener("resize", () => layoutScene());

uploadArea.addEventListener("dragover", (event) => {
  event.preventDefault();
  uploadArea.classList.add("is-dragging");
});

uploadArea.addEventListener("dragleave", (event) => {
  if (!uploadArea.contains(event.relatedTarget)) uploadArea.classList.remove("is-dragging");
});

uploadArea.addEventListener("drop", (event) => {
  event.preventDefault();
  uploadArea.classList.remove("is-dragging");
  if (event.dataTransfer.files.length) {
    fileInput.files = event.dataTransfer.files;
    fileInput.dispatchEvent(new Event("change"));
  }
});

async function openFamilyFile(file) {
  const version = ++uploadVersion;
  if (!file) return;

  delete status.dataset.error;
  status.dataset.loading = "true";
  status.textContent = `Opening ${file.name}…`;
  try {
    const data = parseGedcom(await file.text());
    if (!data.individuals.size) {
      throw new Error("We couldn't find any people in that file. Choose a GEDCOM (.ged) family-tree export and try again.");
    }
    if (version !== uploadVersion) return;
    await initializeScene();
    if (version !== uploadVersion) return;
    familyData = null;
    familyView.hidden = true;
    clearScene();
    peopleList.replaceChildren();
    personPicker.value = "";
    document.querySelector("#explorer-help").hidden = false;
    welcome.classList.add("loaded");
    uploadArea.classList.add("loaded");
    main.classList.add("exploring");
    document.querySelector("#upload-label").textContent = "Change file";
    const filename = document.querySelector("#filename");
    filename.textContent = file.name;
    renderFamily(data);
    familyData = data;
  } catch (error) {
    if (version !== uploadVersion) return;
    status.dataset.error = "true";
    status.textContent = error instanceof Error
      ? error.message
      : "We couldn't open that family-tree file. Please try another GEDCOM (.ged) file.";
  } finally {
    if (version === uploadVersion) delete status.dataset.loading;
  }
}

fileInput.addEventListener("change", () => openFamilyFile(fileInput.files?.[0]));
document.querySelector("#try-example").addEventListener("click", () => {
  openFamilyFile(new File([exampleGedcom], "example-family.ged", { type: "text/plain" }));
});
