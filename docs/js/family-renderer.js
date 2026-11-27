"use strict";

const cardScales = { center: 1.4, grandparent: 0.8 };
const cardDepth = 0.16;
const connectorRadius = 0.05;

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
  if (role !== "center") {
    context.font = "28px system-ui, sans-serif";
    context.fillStyle = colors.getPropertyValue("--person-muted").trim();
    context.fillText(role.replace("-", " "), 256, 270);
  }
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
  card.append(name);
  if (role !== "center") {
    const label = document.createElement("small");
    label.textContent = role.replace("-", " ");
    card.append(label);
  }
  peopleList.append(card);

  const scale = cardScales[role] ?? 1;
  const height = 2.6 * scale;
  const width = 4.2 * scale;
  const border = role === "center" ? 0.08 : 0.045;
  const radius = 0.24 * scale;
  const shape = roundedShape(width, height, radius);
  const backing = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: cardDepth, bevelEnabled: false, curveSegments: 8 }),
    new THREE.MeshStandardMaterial({
      color: colors.getPropertyValue(role === "center" ? "--center-border" : "--border").trim(),
      roughness: 1, metalness: 0
    })
  );
  backing.position.set(x, height / 2, z);
  backing.renderOrder = 2;
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
      map: tileTexture(displayName, role, colors, person)
    })
  );
  tile.position.set(x, height / 2, z + cardDepth + 0.006);
  tile.renderOrder = 1;
  tile.userData.personId = person.id;
  members.add(tile);
  tiles.push(tile);
  const rear = new THREE.Mesh(geometry.clone(), tile.material.clone());
  rear.position.set(x, height / 2, z - 0.006);
  rear.rotation.y = Math.PI;
  rear.renderOrder = 1;
  rear.userData.personId = person.id;
  members.add(rear);
  tiles.push(rear);
  for (const mesh of [backing, tile, rear]) mesh.userData.baseY = height / 2;
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
  return { x, z, halfWidth: width / 2 };
}

function addPartnerToggle(x, z, visibleIndex, count, colors) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const context = canvas.getContext("2d");
  context.fillStyle = colors.getPropertyValue("--card-bg").trim();
  context.fillRect(0, 0, 512, 160);
  context.fillStyle = colors.getPropertyValue("--text").trim();
  context.font = `600 56px ${colors.getPropertyValue("--name-font").trim() || "system-ui, sans-serif"}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(`Partners · ${count}`, 236, 82);
  context.strokeStyle = colors.getPropertyValue("--text").trim();
  context.lineWidth = 8;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(438, 58);
  context.lineTo(462, 82);
  context.lineTo(438, 106);
  context.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const width = 2.8, height = 0.875, border = 0.045;
  const backing = new THREE.Mesh(
    new THREE.ExtrudeGeometry(roundedShape(width, height, height / 2), { depth: cardDepth, bevelEnabled: false, curveSegments: 12 }),
    new THREE.MeshStandardMaterial({ color: colors.getPropertyValue("--border").trim(), roughness: 1, metalness: 0 })
  );
  backing.position.set(x, height / 2, z);
  members.add(backing);
  const faceWidth = width - border * 2, faceHeight = height - border * 2;
  const geometry = new THREE.ShapeGeometry(roundedShape(faceWidth, faceHeight, faceHeight / 2), 12);
  const positions = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < positions.count; i++) {
    uv.setXY(i, positions.getX(i) / faceWidth + 0.5, positions.getY(i) / faceHeight + 0.5);
  }
  const material = new THREE.MeshBasicMaterial({ map: texture });
  for (const [offset, rotation] of [[cardDepth + 0.006, 0], [-0.006, Math.PI]]) {
    const face = new THREE.Mesh(offset ? geometry : geometry.clone(), offset ? material : material.clone());
    face.position.set(x, height / 2, z + offset);
    face.rotation.y = rotation;
    face.userData.action = "next-partner";
    members.add(face);
    tiles.push(face);
  }

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "person partner-toggle";
  toggle.setAttribute("aria-label", `Show next partner (${visibleIndex + 1} of ${count} shown)`);
  const label = document.createElement("strong");
  label.textContent = `Partners · ${count}`;
  const hint = document.createElement("small");
  hint.textContent = "show next partner";
  toggle.append(label, hint);
  peopleList.append(toggle);
}

function showNextPartner() {
  if (!familyData) return;
  partnerIndexes.set(centerPersonId, (partnerIndexes.get(centerPersonId) ?? 0) + 1);
  renderFamily(familyData, centerPersonId);
}

function setHoveredPerson(personId) {
  if (hoveredPersonId === personId) return;
  hoveredPersonId = personId;
  const descendants = new Set();
  if (personId && familyData) {
    const childrenByParent = new Map();
    for (const family of familyData.families.values()) {
      for (const parent of [family.husband, family.wife]) {
        if (!parent) continue;
        if (!childrenByParent.has(parent)) childrenByParent.set(parent, []);
        childrenByParent.get(parent).push(...family.children);
      }
    }
    const pending = [personId];
    const visited = new Set(pending);
    while (pending.length) {
      for (const child of childrenByParent.get(pending.pop()) || []) {
        if (visited.has(child)) continue;
        visited.add(child);
        descendants.add(child);
        pending.push(child);
      }
    }
  }
  for (const [id, meshes] of personCards) {
    const highlighted = id === personId;
    const transparent = descendants.has(id);
    for (const mesh of meshes) {
      const scale = highlighted ? 1.2 : 1;
      mesh.scale.setScalar(scale);
      mesh.position.y = mesh.userData.baseY * scale;
      if (mesh.material.transparent !== transparent) {
        mesh.material.transparent = transparent;
        mesh.material.needsUpdate = true;
      }
      mesh.material.depthWrite = !transparent;
      mesh.material.opacity = transparent ? 0.5 : 1;
    }
  }
  drawScene();
}

function addConnector(points, color, dashed = false) {
  const path = points.map(({ x, z }) => new THREE.Vector3(x, 0.06, z))
    .filter((point, index, all) => !index || point.distanceTo(all[index - 1]) > 0.001);
  if (path.length < 2) return;
  const material = new THREE.MeshBasicMaterial({ color });
  if (dashed) {
    const dash = 0.3, gap = 0.22;
    for (let i = 1; i < path.length; i++) {
      const start = path[i - 1], end = path[i];
      const length = start.distanceTo(end);
      for (let at = 0; at < length; at += dash + gap) {
        const from = start.clone().lerp(end, at / length);
        const to = start.clone().lerp(end, Math.min(length, at + dash) / length);
        members.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(from, to), 1, connectorRadius, 8, false), material));
      }
    }
    return;
  }
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
  members.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, connectorRadius, 8, false), material));
}

function cardEdge(card, side) {
  // Edges sit at floor level, halfway through the card slab.
  if (side === "left") return { x: card.x - card.halfWidth, z: card.z + cardDepth / 2 };
  if (side === "right") return { x: card.x + card.halfWidth, z: card.z + cardDepth / 2 };
  if (side === "front") return { x: card.x, z: card.z + cardDepth + 0.04 };
  return { x: card.x, z: card.z - 0.04 };
}

function connectAncestors(routes, child, parents, color, familyIndex) {
  if (!parents.length) return;
  const add = (points) => routes.push({ points, color, familyIndex });
  const start = cardEdge(child, "back");
  const sorted = [...parents].sort((a, b) => a.x - b.x);
  if (sorted.length === 1) {
    const end = cardEdge(sorted[0], "front");
    const midZ = (start.z + end.z) / 2;
    add(Math.abs(end.x - start.x) < 0.001
      ? [start, end]
      : [start, { x: start.x, z: midZ }, { x: end.x, z: midZ }, end]);
    return;
  }
  // Rise to the parents' midline, then branch into their inner sides.
  const railStart = cardEdge(sorted[0], "right");
  const railEnd = cardEdge(sorted.at(-1), "left");
  add([railStart, railEnd]);
  const stemX = Math.min(Math.max(start.x, railStart.x), railEnd.x);
  const midZ = (start.z + railStart.z) / 2;
  add(Math.abs(stemX - start.x) < 0.001
    ? [start, { x: stemX, z: railStart.z }]
    : [start, { x: start.x, z: midZ }, { x: stemX, z: midZ }, { x: stemX, z: railStart.z }]);
}

function connectDescendants(routes, anchor, targets, busZ, color, familyIndex) {
  if (!targets.length) return;
  const add = (points, dashed) => routes.push({ points, color, familyIndex, dashed });
  if (targets.length === 1 && Math.abs(targets[0].point.x - anchor.x) < 0.001) {
    add([anchor, targets[0].point], targets[0].dashed);
    return;
  }
  add([anchor, { x: anchor.x, z: busZ }], targets.every((target) => target.dashed));
  for (const side of [-1, 1]) {
    const sideTargets = targets
      .filter((target) => Math.sign(Math.round((target.point.x - anchor.x) * 1000)) === side)
      .sort((a, b) => Math.abs(a.point.x - anchor.x) - Math.abs(b.point.x - anchor.x));
    let fromX = anchor.x;
    sideTargets.forEach((target, index) => {
      // A bus segment is dashed only when every branch beyond it is dashed.
      add([{ x: fromX, z: busZ }, { x: target.point.x, z: busZ }],
        sideTargets.slice(index).every((other) => other.dashed));
      fromX = target.point.x;
    });
  }
  for (const target of targets) add([{ x: target.point.x, z: busZ }, target.point], target.dashed);
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
          addConnector(part, route.color, route.dashed);
          part = [{ x: start.x, z: start.z + direction * after }];
        }
      }
      part.push(end);
    }
    addConnector(part, route.color, route.dashed);
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
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: colors.getPropertyValue("--orbit-ring").trim(), side: THREE.DoubleSide, depthWrite: false
  });
  for (const radius of [7, 13, 19]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.03, radius + 0.03, 160), ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    members.add(ring);
  }
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
    return positions.get(person.id);
  };
  const gap = 1.6;
  const beside = (card, direction, role) =>
    card.x + direction * (card.halfWidth + gap + 2.1 * (cardScales[role] ?? 1));
  const row = (people, role, z, spacing = 5.2, offset = 0) => people.map((person, index) =>
    place(person, role, offset + (index - (people.length - 1) / 2) * spacing, z));
  const centerCard = place(center, "center", 0, 0);

  const grandparentIds = new Set(relatives.grandparents.map((person) => person.id));
  const parentCards = row(relatives.parents, "parent", -6, grandparentIds.size ? 9 : 5.2);
  const ancestorGroups = relatives.parents.map((parent, index) => {
    const ids = new Set(parent.famc.flatMap((familyId) => {
      const family = families.get(familyId);
      return family ? [family.husband, family.wife] : [];
    }).filter((id) => grandparentIds.has(id)));
    const people = [...ids].map((id) => individuals.get(id));
    return { child: parentCards[index], parents: row(people, "grandparent", -12, 4.4, parentCards[index].x) };
  });

  const partners = relatives.spouses;
  const partnerIndex = partners.length ? (partnerIndexes.get(center.id) ?? 0) % partners.length : 0;
  const partner = partners[partnerIndex];
  const partnerCard = partner && place(partner, "spouse", beside(centerCard, -1, "spouse"), 0);
  if (partners.length > 1) {
    addPartnerToggle(partnerCard.x - partnerCard.halfWidth - gap - 1.4, 0, partnerIndex, partners.length, colors);
  }

  const siblingCards = [];
  for (const sibling of relatives.siblings) {
    const previous = siblingCards.at(-1) ?? centerCard;
    siblingCards.push(place(sibling, "sibling", beside(previous, 1, "sibling"), 0));
  }

  // Children of a partner who is not shown get dashed branches and sit leftmost, near the partner toggle.
  const otherParentHidden = (child) => {
    const shared = center.fams.map((id) => families.get(id)).filter((family) => family?.children.includes(child.id));
    return shared.length > 0 && shared.every((family) => {
      const other = [family.husband, family.wife].find((id) => id && id !== center.id);
      return other && other !== partner?.id;
    });
  };
  const childEntries = relatives.children
    .map((child) => ({ child, dashed: otherParentHidden(child) }))
    .sort((a, b) => Number(b.dashed) - Number(a.dashed));
  const childCards = row(childEntries.map(({ child }) => child), "child", 6);
  const grandchildIds = new Set(relatives.grandchildren.map((person) => person.id));
  row(relatives.grandchildren, "grandchild", 12);

  const color = colors.getPropertyValue("--connector").trim();
  const routes = [];
  connectAncestors(routes, centerCard, parentCards, color, 1);
  ancestorGroups.forEach(({ child, parents }, index) => connectAncestors(routes, child, parents, color, 2 + index));
  if (partnerCard) {
    routes.push({ points: [cardEdge(centerCard, "left"), cardEdge(partnerCard, "right")], color, familyIndex: 0 });
  }
  siblingCards.forEach((card, index) => routes.push({
    points: [cardEdge(siblingCards[index - 1] ?? centerCard, "right"), cardEdge(card, "left")], color, familyIndex: 0
  }));
  connectDescendants(routes, cardEdge(centerCard, "front"), childCards.map((card, index) => ({
    point: cardEdge(card, "back"), dashed: childEntries[index].dashed
  })), 3, color, 100);
  childEntries.forEach(({ child }, index) => {
    const ids = new Set(child.fams.flatMap((familyId) => families.get(familyId)?.children ?? [])
      .filter((id) => grandchildIds.has(id)));
    connectDescendants(routes, cardEdge(childCards[index], "front"),
      [...ids].map((id) => ({ point: cardEdge(positions.get(id), "back"), dashed: false })),
      9 + (index - (childEntries.length - 1) / 2) * 0.4, color, 200 + index);
  });
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
  memberCount.hidden = false;
  document.querySelector(".relatives").hidden = false;
  status.dataset.error = "false";
  status.textContent = `${center.name || `Unknown person (${center.id})`} is centered. ${count} family member${count === 1 ? "" : "s"} shown.`;
  familyView.hidden = false;
  document.querySelector("#view-actions").hidden = false;
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
