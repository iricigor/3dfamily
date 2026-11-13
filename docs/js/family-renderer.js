"use strict";

function wrapName(name, context, maxWidth) {
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
  if (best) return best.lines;

  const lines = [];
  let line = "";
  for (const word of words) {
    if (context.measureText(word).width <= maxWidth) {
      const combined = line ? `${line} ${word}` : word;
      if (line && context.measureText(combined).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = combined;
      }
      continue;
    }
    if (line) lines.push(line);
    line = "";
    const segmenter = typeof Intl.Segmenter === "function"
      ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
      : null;
    const characters = segmenter
      ? [...segmenter.segment(word)].map(({ segment }) => segment)
      : Array.from(word);
    for (const character of characters) {
      if (line && context.measureText(line + character).width > maxWidth) {
        lines.push(line);
        line = "";
      }
      line += character;
    }
    if (line) lines.push(line);
    line = "";
  }
  if (line) lines.push(line);
  return lines;
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
  if (document.documentElement.dataset.visualTheme === "heritage") {
    context.fillStyle = colors.getPropertyValue("--paper-grain").trim();
    for (let grain = 0; grain < 160; grain++) {
      context.fillRect((grain * 137) % 512, (grain * 89) % 320, 1, 1);
    }
  }
  if (role === "center" && document.documentElement.dataset.visualTheme === "heritage") {
    context.strokeStyle = colors.getPropertyValue("--center-inset").trim();
    context.lineWidth = 3;
    context.beginPath();
    context.roundRect(12, 12, 488, 296, 18);
    context.stroke();
  }
  context.fillStyle = colors.getPropertyValue("--text").trim();
  context.textAlign = "center";
  context.textBaseline = "middle";
  const maxWidth = 420;
  const nameFont = colors.getPropertyValue("--name-font").trim() || "system-ui, sans-serif";
  let size = 46;
  context.font = `600 ${size}px ${nameFont}`;
  while (context.measureText(name).width > maxWidth && size > 37) {
    size -= 1;
    context.font = `600 ${size}px ${nameFont}`;
  }
  const lines = context.measureText(name).width > maxWidth
    ? wrapName(name, context, maxWidth)
    : [name];
  const lineHeight = Math.max(size + 4, Math.min(size + 8, 220 / Math.max(1, lines.length - 1)));
  lines.forEach((line, index) => {
    context.fillText(line, 256, 132 + (index - (lines.length - 1) / 2) * lineHeight);
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
  personCards.set(person.id, [backing, tile, rear]);

  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = 256;
  shadowCanvas.height = 64;
  const context = shadowCanvas.getContext("2d");
  context.scale(1, 0.25);
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, colors.getPropertyValue("--scene-shadow").trim());
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

function setHoveredPerson(personId) {
  if (hoveredPersonId === personId) return;
  hoveredPersonId = personId;
  for (const [id, meshes] of personCards) {
    const highlighted = id === personId;
    for (const mesh of meshes) {
      mesh.scale.setScalar(highlighted ? 1.05 : 1);
      mesh.material.transparent = Boolean(personId && !highlighted);
      mesh.material.opacity = personId && !highlighted ? 0.5 : 1;
    }
  }
  drawScene();
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

function addSpaceGrid(colors) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  context.strokeStyle = colors.getPropertyValue("--grid-line").trim();
  context.lineWidth = 1;
  for (let position = 0; position <= 512; position += 16) {
    context.beginPath();
    context.moveTo(position, 0);
    context.lineTo(position, 512);
    context.moveTo(0, position);
    context.lineTo(512, position);
    context.stroke();
  }
  context.globalCompositeOperation = "destination-in";
  const fade = context.createLinearGradient(0, 0, 0, 512);
  fade.addColorStop(0, "rgba(255, 255, 255, 0)");
  fade.addColorStop(0.35, "rgba(255, 255, 255, 0.07)");
  fade.addColorStop(1, "rgba(255, 255, 255, 0.2)");
  context.fillStyle = fade;
  context.fillRect(0, 0, 512, 512);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const grid = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide })
  );
  grid.rotation.x = -Math.PI / 2;
  grid.position.y = 0.01;
  members.add(grid);
}

function renderFamily({ individuals, families }, centerId) {
  const initialFitPending = pendingInitialFit;
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
  updateSceneLighting(colors);
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
  if (document.documentElement.dataset.visualTheme === "space") addSpaceGrid(colors);

  const count = positions.size - 1;
  memberCount.textContent = `${count} family member${count === 1 ? "" : "s"} shown`;
  status.dataset.error = "false";
  status.textContent = `${center.name || `Unknown person (${center.id})`} is centered. ${count} family member${count === 1 ? "" : "s"} shown.`;
  familyView.hidden = false;
  pendingInitialFit = !familyData || initialFitPending;
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
