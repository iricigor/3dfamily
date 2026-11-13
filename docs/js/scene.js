"use strict";

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
    const cameraInteraction = document.querySelector("#camera-interaction");
    let mode = "rotate";
    let spacePressed = false;
    const setMode = (nextMode) => {
      mode = nextMode;
      controls.mouseButtons.LEFT = !cameraModeSelector.checked && spacePressed
        ? THREE.MOUSE.PAN
        : mode === "pan" ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
      controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
      controls.touches.ONE = mode === "pan" ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
      controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
      panButton?.setAttribute("aria-pressed", String(mode === "pan"));
      rotateButton?.setAttribute("aria-pressed", String(mode === "rotate"));
    };
    const updateCameraModeSetting = () => {
      cameraInteraction.hidden = !cameraModeSelector.checked;
      if (!cameraModeSelector.checked) setMode("rotate");
    };
    panButton?.addEventListener("click", () => setMode("pan"));
    rotateButton?.addEventListener("click", () => setMode("rotate"));
    cameraModeSelector.addEventListener("change", updateCameraModeSetting);
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
    updateCameraModeSetting();
    document.addEventListener("keydown", (event) => {
      if (event.code !== "Space" || event.repeat || familyView.hidden || cameraModeSelector.checked ||
          event.target instanceof Element && event.target.closest("button, input, select, textarea, [contenteditable='true']")) return;
      spacePressed = true;
      controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
      event.preventDefault();
    });
    document.addEventListener("keyup", (event) => {
      if (event.code !== "Space" || !spacePressed) return;
      spacePressed = false;
      setMode(mode);
    });
    window.addEventListener("blur", () => {
      if (!spacePressed) return;
      spacePressed = false;
      setMode(mode);
    });
    controls.addEventListener("start", () => { pendingInitialFit = false; });
    controls.addEventListener("change", drawScene);
    ambientLight = new THREE.HemisphereLight(0xffffff, 0x536078, 1.4);
    world.add(ambientLight);
    keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
    keyLight.position.set(-3, 10, 6);
    world.add(keyLight);
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
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const updateHoveredPerson = (event) => {
      if (event.pointerType === "touch" || pointerStart?.dragged) {
        setHoveredPerson(null);
        return;
      }
      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointer.set(
        (event.clientX - rect.left) / rect.width * 2 - 1,
        -(event.clientY - rect.top) / rect.height * 2 + 1
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(tiles, false)[0];
      setHoveredPerson(hit?.object.userData.personId ?? null);
    };
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
      updateHoveredPerson(event);
    });
    renderer.domElement.addEventListener("pointerleave", () => setHoveredPerson(null));
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
      if (!rect.width || !rect.height) return;
      pointer.set(
        (event.clientX - rect.left) / rect.width * 2 - 1,
        -(event.clientY - rect.top) / rect.height * 2 + 1
      );
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

function updateSceneLighting(colors) {
  if (!ambientLight || !keyLight) return;
  ambientLight.color.set(colors.getPropertyValue("--scene-sky").trim());
  ambientLight.groundColor.set(colors.getPropertyValue("--scene-ground").trim());
  ambientLight.intensity = Number(colors.getPropertyValue("--scene-ambient-intensity"));
  keyLight.color.set(colors.getPropertyValue("--scene-light").trim());
  keyLight.intensity = Number(colors.getPropertyValue("--scene-key-intensity"));
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
  personCards.clear();
  hoveredPersonId = null;
  connectorPoints = [];
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
    const heightRatio = Math.max(0.4, (height - 64) / height);
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
