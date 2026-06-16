// Dirt Diggers 3D — a blocky construction game built on Babylon.js.
// Drive brick-built trucks around a yard of 3D dirt blocks and dig / dump / push them.
(function () {
  "use strict";

  const B = BABYLON;

  // ---- Grid / world ----
  const GRID = 28;          // cells per side
  const CELL = 2;           // world units per cell
  const HALF = (GRID * CELL) / 2;
  const BASE = 3;           // base ground thickness (units) — lets you dig down
  const MAX_DIRT = 6;
  const REACH = CELL * 1.15;

  const dirt = new Float32Array(GRID * GRID);
  const tint = new Float32Array(GRID * GRID); // small per-cell colour variation
  const di = (c, r) => r * GRID + c;
  const inBounds = (c, r) => c >= 0 && c < GRID && r >= 0 && r < GRID;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const cellX = (c) => -HALF + (c + 0.5) * CELL;
  const cellZ = (r) => -HALF + (r + 0.5) * CELL;
  const worldToC = (x) => Math.round((x + HALF) / CELL - 0.5);
  const worldToR = (z) => Math.round((z + HALF) / CELL - 0.5);

  function seedDirt() {
    for (let i = 0; i < dirt.length; i++) { dirt[i] = 0; tint[i] = 0.86 + Math.random() * 0.14; }
    const mounds = [[8, 7, 4, 4.5], [20, 8, 3.4, 4], [14, 18, 5, 5], [22, 20, 3, 3.6], [6, 20, 3, 3.4]];
    for (const [mc, mr, rad, peak] of mounds)
      for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
        const d = Math.hypot(c - mc, r - mr);
        if (d < rad) dirt[di(c, r)] = clamp(dirt[di(c, r)] + peak * (1 - d / rad), -3, MAX_DIRT);
      }
  }

  function hex(n) { return new B.Color3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // ---- Shared input (HTML overlay + keyboard) ----
  const input = { mx: 0, my: 0, dig: false, dump: false };
  let heldDig = false, heldDump = false;
  const keys = Object.create(null);

  // =========================================================================
  const canvas = document.getElementById("renderCanvas");
  const engine = new B.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, antialias: true }, true);
  const scene = new B.Scene(engine);
  scene.clearColor = hex(0x8fc7dd).toColor4(1);
  scene.ambientColor = new B.Color3(0.5, 0.5, 0.5);

  // Camera: fixed-angle diorama that follows the truck's position (no spin — calm for kids).
  const CAM_OFFSET = new B.Vector3(13, 24, -20);
  const camera = new B.TargetCamera("cam", CAM_OFFSET.clone(), scene);
  camera.fov = 0.72;
  camera.minZ = 0.5; camera.maxZ = 400;
  scene.activeCamera = camera;

  // Lights + shadows.
  const hemi = new B.HemisphericLight("hemi", new B.Vector3(0.3, 1, 0.2), scene);
  hemi.intensity = 0.72; hemi.groundColor = hex(0x6a5a3a);
  const sun = new B.DirectionalLight("sun", new B.Vector3(-0.6, -1.2, -0.5), scene);
  sun.position = new B.Vector3(40, 70, 40); sun.intensity = 1.05;
  const shadow = new B.ShadowGenerator(1024, sun);
  shadow.useBlurExponentialShadowMap = true; shadow.blurKernel = 16; shadow.darkness = 0.45;

  // ---- Dirt blocks as thin instances of one box ----
  const block = B.MeshBuilder.CreateBox("block", { size: 1 }, scene);
  const blockMat = new B.StandardMaterial("blockMat", scene);
  blockMat.diffuseColor = new B.Color3(1, 1, 1);
  blockMat.specularColor = new B.Color3(0.04, 0.04, 0.04);
  block.material = blockMat;
  block.receiveShadows = true;

  const N = GRID * GRID;
  const matrixData = new Float32Array(N * 16);
  const colorData = new Float32Array(N * 4);
  const _scale = new B.Vector3(CELL * 0.96, 1, CELL * 0.96);
  const _pos = new B.Vector3();
  const _q = B.Quaternion.Identity();

  function dirtColor(h, i) {
    let r, g, b;
    if (h >= 0) { const k = Math.min(1, h / MAX_DIRT); r = lerp(0x86, 0xc4, k); g = lerp(0x5a, 0x9f, k); b = lerp(0x2c, 0x5f, k); }
    else { const k = Math.min(1, -h / 3); r = lerp(0x86, 0x49, k); g = lerp(0x5a, 0x33, k); b = lerp(0x2c, 0x16, k); }
    const t = tint[i];
    return [(r / 255) * t, (g / 255) * t, (b / 255) * t];
  }

  function writeCell(c, r) {
    const i = di(c, r);
    let top = BASE + dirt[i]; if (top < 0.5) top = 0.5;
    _scale.y = top; _pos.set(cellX(c), top / 2, cellZ(r));
    B.Matrix.Compose(_scale, _q, _pos).copyToArray(matrixData, i * 16);
    const col = dirtColor(dirt[i], i);
    colorData[i * 4] = col[0]; colorData[i * 4 + 1] = col[1]; colorData[i * 4 + 2] = col[2]; colorData[i * 4 + 3] = 1;
  }

  function buildBlocks() {
    for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) writeCell(c, r);
    block.thinInstanceSetBuffer("matrix", matrixData, 16, false);
    block.thinInstanceSetBuffer("color", colorData, 4, false);
  }
  let blocksDirty = false;
  function touchCell(c, r) { if (inBounds(c, r)) { writeCell(c, r); blocksDirty = true; } }

  // ---- Decorative corner cones for charm ----
  function buildFrame() {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const cone = B.MeshBuilder.CreateCylinder("cone", { diameterTop: 0, diameterBottom: 1.4, height: 2.2 }, scene);
      cone.position.set(sx * (HALF - 1.5), 1.1 + BASE, sz * (HALF - 1.5));
      const m = new B.StandardMaterial("c", scene); m.diffuseColor = hex(0xff7a1a); cone.material = m;
      shadow.addShadowCaster(cone);
    }
  }

  // =========================================================================
  // Trucks — brick-built from boxes, Lego style.
  // =========================================================================
  const matCache = {};
  function mat(n) {
    if (matCache[n]) return matCache[n];
    const m = new B.StandardMaterial("m" + n, scene);
    m.diffuseColor = hex(n); m.specularColor = new B.Color3(0.15, 0.15, 0.15);
    return (matCache[n] = m);
  }
  function box(name, w, h, d, x, y, z, material, parent) {
    const b = B.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    b.position.set(x, y, z); b.material = material; b.parent = parent;
    shadow.addShadowCaster(b);
    return b;
  }
  function studs(parent, w, d, topY, material) {
    const out = [];
    for (let i = -1; i <= 1; i += 2) for (let j = -1; j <= 1; j += 2) {
      const s = B.MeshBuilder.CreateCylinder("stud", { diameter: 0.42, height: 0.18 }, scene);
      s.position.set(i * w * 0.28, topY, j * d * 0.28); s.material = material; s.parent = parent;
      out.push(s);
    }
    return out;
  }

  let truckRoot = null, wheels = [];
  function buildTruck(def) {
    if (truckRoot) truckRoot.dispose();
    wheels = [];
    const root = new B.TransformNode("truck", scene);
    const shape = def.shape || {};
    const body = mat(def.color), accent = mat(def.accent), dark = mat(0x26221c), glass = mat(0x9fd8ec), tire = mat(0x1d1b19);

    // Chassis + cab (truck faces +Z).
    box("chassis", 2.2, 0.7, 3.2, 0, 0.95, 0, body, root);
    const cabZ = shape.bedBack ? 0.9 : -0.5;
    const cab = box("cab", 1.8, 0.95, 1.25, 0, 1.75, cabZ, accent, root);
    box("glass", 1.5, 0.5, 0.12, 0, 1.85, cabZ + 0.62, glass, root);
    studs(cab, 1.8, 1.25, 0.55, body);
    box("pipe", 0.18, 0.7, 0.18, 0.7, 1.9, cabZ - 0.4, dark, root);
    // Beacon.
    const beacon = box("beacon", 0.3, 0.22, 0.3, -0.55, 2.34, cabZ, mat(0xffd84a), root);
    beacon._isBeacon = true; root._beacon = beacon;

    // Tool.
    if (shape.bladeFront) box("blade", 2.7, 1.3, 0.35, 0, 0.9, 1.95, accent, root);
    if (shape.bucketFront) {
      box("arm", 0.25, 0.25, 1.1, 0.6, 0.9, 1.6, dark, root);
      box("arm2", 0.25, 0.25, 1.1, -0.6, 0.9, 1.6, dark, root);
      box("bucket", 2.0, 0.7, 0.8, 0, 0.55, 2.2, accent, root);
    }
    if (shape.bedBack) { const bed = box("bed", 2.0, 1.0, 2.0, 0, 1.55, -0.7, accent, root); studs(bed, 2.0, 2.0, 0.56, dark); }
    if (shape.armBack) { box("boom", 0.3, 0.3, 1.6, 0, 1.6, -1.9, accent, root); box("boom2", 0.3, 1.2, 0.3, 0, 1.2, -2.6, accent, root); box("dipper", 1.0, 0.5, 0.4, 0, 0.5, -2.7, dark, root); }
    if (shape.sideBucket) box("sidebkt", 0.7, 0.7, 2.6, 1.7, 0.6, 0, accent, root);

    // Wheels (spin via pivots).
    let layout;
    if (shape.tracks) layout = [[1.15, -1.0], [1.15, 1.0], [-1.15, -1.0], [-1.15, 1.0]];
    else if (shape.wheels === "twin") layout = [[1.15, -1.1], [1.15, 0], [1.15, 1.1], [-1.15, -1.1], [-1.15, 0], [-1.15, 1.1]];
    else layout = [[1.15, -1.05], [1.15, 1.05], [-1.15, -1.05], [-1.15, 1.05]];
    const wr = shape.wheels === "small" ? 0.5 : 0.6;
    for (const [wx, wz] of layout) {
      const pivot = new B.TransformNode("wp", scene); pivot.position.set(wx, wr, wz); pivot.parent = root;
      const cyl = B.MeshBuilder.CreateCylinder("wheel", { diameter: wr * 2, height: 0.45, tessellation: 12 }, scene);
      cyl.rotation.z = Math.PI / 2; cyl.material = tire; cyl.parent = pivot;
      shadow.addShadowCaster(cyl);
      wheels.push(pivot);
    }

    root.rotation.y = state.heading;
    root.position.copyFromFloats(state.x, BASE, state.z);
    truckRoot = root;
  }

  // =========================================================================
  // Dust particles
  // =========================================================================
  function dotTexture() {
    const dt = new B.DynamicTexture("dot", { width: 64, height: 64 }, scene, false);
    const ctx = dt.getContext();
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, "rgba(255,255,255,0.9)"); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64); dt.update();
    return dt;
  }
  const dust = new B.ParticleSystem("dust", 400, scene);
  dust.particleTexture = dotTexture();
  dust.emitter = new B.Vector3(0, BASE, 0);
  dust.minEmitBox = new B.Vector3(-0.4, 0, -0.4); dust.maxEmitBox = new B.Vector3(0.4, 0.3, 0.4);
  dust.color1 = hex(0xb59a6a).toColor4(0.8); dust.color2 = hex(0x8a6d3b).toColor4(0.7);
  dust.colorDead = new B.Color4(0.6, 0.5, 0.3, 0);
  dust.minSize = 0.3; dust.maxSize = 1.0; dust.minLifeTime = 0.25; dust.maxLifeTime = 0.6;
  dust.emitRate = 0; dust.gravity = new B.Vector3(0, 2.5, 0);
  dust.direction1 = new B.Vector3(-1, 1, -1); dust.direction2 = new B.Vector3(1, 2, 1);
  dust.minEmitPower = 0.4; dust.maxEmitPower = 1.4; dust.updateSpeed = 0.02;
  dust.start();

  // =========================================================================
  // Game state + loop
  // =========================================================================
  const state = {
    def: TRUCKS[0], x: 0, z: HALF - 8, heading: Math.PI, bucket: 0, rideY: BASE,
    animT: 0, lastDigPuff: 0, wasFull: false, snd: { dig: 0, dump: 0, beep: 0 },
    acting: { dig: false, dump: false, load: false, doze: false },
  };

  function setMachine(def, silent) {
    state.def = def;
    state.bucket = Math.min(state.bucket, def.capacity);
    buildTruck(def);
    document.getElementById("machine-label").textContent = def.name;
    document.querySelectorAll(".machine-btn").forEach((b) => b.classList.toggle("active", b.dataset.id === def.id));
    document.getElementById("btn-dig").classList.toggle("off", def.dig === false);
    document.getElementById("btn-dump").classList.toggle("off", def.dump === false);
    if (!silent) Sound.horn();
  }

  function levelYard() {
    for (let i = 0; i < dirt.length; i++) dirt[i] = 0;
    state.bucket = 0;
    for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) writeCell(c, r);
    blocksDirty = true;
  }

  function readKeyboard() {
    let kx = 0, ky = 0;
    if (keys["arrowleft"] || keys["a"]) kx -= 1;
    if (keys["arrowright"] || keys["d"]) kx += 1;
    if (keys["arrowup"] || keys["w"]) ky -= 1;
    if (keys["arrowdown"] || keys["s"]) ky += 1;
    if (kx || ky) { const m = Math.hypot(kx, ky); input.mx = kx / m; input.my = ky / m; }
    else if (!joyId) { input.mx = 0; input.my = 0; }
    input.dig = !!(keys["j"] || keys[" "]) || heldDig;
    input.dump = !!keys["k"] || heldDump;
  }

  // Camera-relative ground axes (constant because the camera angle is fixed).
  const camFwd = new B.Vector3(-CAM_OFFSET.x, 0, -CAM_OFFSET.z).normalize();
  const camRight = new B.Vector3(camFwd.z, 0, -camFwd.x);

  function frontCell(reach, side) {
    const a = state.heading + (side ? Math.PI / 2 : 0);
    return { c: worldToC(state.x + Math.sin(a) * reach), r: worldToR(state.z + Math.cos(a) * reach) };
  }
  function toolCell() { return state.def.scoop === "side" ? frontCell(REACH, true) : frontCell(REACH, false); }

  function update(dt) {
    const def = state.def;
    state.acting.dig = state.acting.dump = state.acting.load = state.acting.doze = false;
    readKeyboard();

    // Drive (camera-relative).
    const mag = Math.hypot(input.mx, input.my);
    if (mag > 0.08) {
      const dx = camRight.x * input.mx + camFwd.x * (-input.my);
      const dz = camRight.z * input.mx + camFwd.z * (-input.my);
      const len = Math.hypot(dx, dz) || 1;
      state.x = clamp(state.x + (dx / len) * mag * def.speed * dt, -HALF + 1, HALF - 1);
      state.z = clamp(state.z + (dz / len) * mag * def.speed * dt, -HALF + 1, HALF - 1);
      const target = Math.atan2(dx, dz);
      let d = target - state.heading;
      while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      state.heading += d * 0.25;
    }

    // Bulldozer push.
    if (def.dozer && mag > 0.2) {
      const b = frontCell(REACH, false), a = frontCell(REACH + CELL, false);
      if (inBounds(b.c, b.r) && inBounds(a.c, a.r)) {
        const bi = di(b.c, b.r), ai = di(a.c, a.r);
        if (dirt[bi] > 0) {
          const moved = Math.min(dirt[bi], 5 * dt * mag, MAX_DIRT - dirt[ai]);
          if (moved > 0) { dirt[bi] -= moved; dirt[ai] += moved; touchCell(b.c, b.r); touchCell(a.c, a.r); state.acting.doze = true; }
        }
      }
    }

    // Dump truck drive-over loading.
    if (def.scoop === "driveover" && mag > 0.2 && state.bucket < def.capacity) {
      const c = worldToC(state.x), r = worldToR(state.z);
      if (inBounds(c, r) && dirt[di(c, r)] > 0.3) {
        const i = di(c, r), want = Math.min((def.loadRate || def.digRate) * dt, def.capacity - state.bucket, dirt[i]);
        if (want > 0) { dirt[i] -= want; state.bucket += want; touchCell(c, r); state.acting.load = true; }
      }
    }

    // DIG.
    if (input.dig && def.dig !== false && state.bucket < def.capacity) {
      const t = toolCell();
      if (inBounds(t.c, t.r)) {
        const i = di(t.c, t.r), floorD = def.digMin != null ? def.digMin : -2;
        const want = Math.min(def.digRate * dt, def.capacity - state.bucket, dirt[i] - floorD);
        if (want > 0.0001) { dirt[i] -= want; state.bucket += want; touchCell(t.c, t.r); state.acting.dig = true; }
      }
    }

    // DUMP.
    if (input.dump && def.dump !== false && state.bucket > 0) {
      const t = toolCell();
      if (inBounds(t.c, t.r)) {
        if (def.spread) {
          const cells = [[t.c, t.r], [t.c + 1, t.r], [t.c - 1, t.r], [t.c, t.r + 1], [t.c, t.r - 1]].filter(([c, r]) => inBounds(c, r));
          let placed = 0; const per = (def.digRate * dt) / cells.length;
          for (const [c, r] of cells) { const i = di(c, r), give = Math.min(per, MAX_DIRT - dirt[i]); if (give > 0) { dirt[i] += give; placed += give; touchCell(c, r); } }
          placed = Math.min(placed, state.bucket);
          if (placed > 0) { state.bucket -= placed; state.acting.dump = true; }
        } else {
          const i = di(t.c, t.r), give = Math.min(def.digRate * dt, state.bucket, MAX_DIRT - dirt[i]);
          if (give > 0.0001) { dirt[i] += give; state.bucket -= give; touchCell(t.c, t.r); state.acting.dump = true; }
        }
      }
    }

    if (blocksDirty) { block.thinInstanceBufferUpdated("matrix"); block.thinInstanceBufferUpdated("color"); blocksDirty = false; }

    // Move + animate the truck (riding up over piles).
    if (truckRoot) {
      const cc = worldToC(state.x), rr = worldToR(state.z);
      const terr = inBounds(cc, rr) ? Math.max(0, dirt[di(cc, rr)]) : 0;
      state.rideY += (BASE + terr - state.rideY) * Math.min(1, dt * 8);
      truckRoot.position.set(state.x, state.rideY, state.z);
      truckRoot.rotation.y = state.heading;
      const working = state.acting.dig || state.acting.dump || state.acting.load || state.acting.doze;
      state.animT += dt * (working ? 17 : mag > 0.1 ? 9 + mag * 7 : 3);
      const bob = Math.sin(state.animT) * (working ? 0.09 : mag > 0.1 ? 0.06 : 0.02);
      truckRoot.position.y = state.rideY + Math.max(0, bob);
      for (const w of wheels) w.rotation.x += mag * def.speed * dt * 0.5;
      if (truckRoot._beacon) { const f = 0.5 + 0.5 * Math.sin(performance.now() * 0.016); truckRoot._beacon.scaling.y = 0.6 + f; }
    }

    // Camera follows.
    camera.position.set(state.x + CAM_OFFSET.x, CAM_OFFSET.y, state.z + CAM_OFFSET.z);
    camera.setTarget(new B.Vector3(state.x, BASE, state.z));

    // Dust.
    dust.emitter.set(state.x - Math.sin(state.heading) * 1.4, BASE + 0.2, state.z - Math.cos(state.heading) * 1.4);
    dust.emitRate = mag > 0.15 ? 90 : 0;
    if (state.acting.dig && performance.now() - state.lastDigPuff > 80) {
      const t = toolCell();
      dust.emitter.set(cellX(t.c), BASE + dirt[di(t.c, t.r)] + 0.3, cellZ(t.r));
      dust.manualEmitCount = 8; state.lastDigPuff = performance.now();
    }

    // Sound + HUD.
    Sound.engine(mag);
    state.snd.dig -= dt; state.snd.dump -= dt; state.snd.beep -= dt;
    if ((state.acting.dig || state.acting.load) && state.snd.dig <= 0) { Sound.dig(); state.snd.dig = 0.11; }
    if (state.acting.dump && state.snd.dump <= 0) { Sound.dump(); state.snd.dump = 0.14; }
    const full = state.bucket >= def.capacity - 0.02;
    if (full && !state.wasFull) Sound.ding();
    state.wasFull = full;
    if (def.scoop === "driveover" && mag > 0.25 && state.snd.beep <= 0) { Sound.beep(); state.snd.beep = 0.6; }

    document.getElementById("bucket-fill").style.width = clamp((state.bucket / def.capacity) * 100, 0, 100) + "%";
  }

  // =========================================================================
  // Controls
  // =========================================================================
  let joyId = null, joyOX = 0, joyOY = 0; const JOY_R = 56;
  let joyEl, knobEl;
  function startJoy(id, x, y) { joyId = id; joyOX = x; joyOY = y; joyEl.style.left = (x - 66) + "px"; joyEl.style.top = (y - 66) + "px"; joyEl.classList.add("active"); moveJoy(x, y); }
  function moveJoy(x, y) { let dx = x - joyOX, dy = y - joyOY; const d = Math.hypot(dx, dy); if (d > JOY_R) { dx = dx / d * JOY_R; dy = dy / d * JOY_R; } knobEl.style.transform = `translate(${dx}px, ${dy}px)`; input.mx = dx / JOY_R; input.my = dy / JOY_R; }
  function endJoy() { joyId = null; joyEl.classList.remove("active"); knobEl.style.transform = "translate(0,0)"; input.mx = 0; input.my = 0; }
  function isControl(t) { return t && t.closest && t.closest("button, .machine-picker, .action-buttons, .hud"); }

  function buildControls() {
    joyEl = document.getElementById("joystick"); knobEl = document.getElementById("joystick-knob");
    const picker = document.getElementById("machine-picker"); picker.innerHTML = "";
    TRUCKS.forEach((def) => {
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = "machine-btn"; btn.dataset.id = def.id;
      btn.innerHTML = `<span class="ico">${def.emoji}</span><span>${def.name}</span>`;
      btn.addEventListener("click", () => setMachine(def));
      picker.appendChild(btn);
    });
    document.getElementById("btn-flatten").addEventListener("click", levelYard);
    document.getElementById("btn-mute").addEventListener("click", (e) => { Sound.ensure(); e.currentTarget.textContent = Sound.toggleMute() ? "🔇" : "🔊"; });
    const hold = (id, set) => {
      const el = document.getElementById(id);
      const on = (e) => { Sound.ensure(); set(true); if (e.cancelable) e.preventDefault(); };
      const off = () => set(false);
      el.addEventListener("pointerdown", on); el.addEventListener("pointerup", off);
      el.addEventListener("pointercancel", off); el.addEventListener("pointerleave", off);
    };
    hold("btn-dig", (v) => (heldDig = v));
    hold("btn-dump", (v) => (heldDump = v));
    window.addEventListener("pointerdown", (e) => {
      Sound.ensure();
      if (joyId !== null || isControl(e.target)) return;
      if (e.clientX > window.innerWidth * 0.62) return;
      startJoy(e.pointerId, e.clientX, e.clientY);
    });
    window.addEventListener("pointermove", (e) => { if (e.pointerId === joyId) moveJoy(e.clientX, e.clientY); });
    window.addEventListener("pointerup", (e) => { if (e.pointerId === joyId) endJoy(); });
    window.addEventListener("pointercancel", (e) => { if (e.pointerId === joyId) endJoy(); });
  }
  window.addEventListener("keydown", (e) => { keys[e.key.toLowerCase()] = true; Sound.ensure(); });
  window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

  // =========================================================================
  // Boot
  // =========================================================================
  seedDirt();
  buildBlocks();
  buildFrame();
  buildControls();
  setMachine(TRUCKS[0], true);

  let booted = false;
  engine.runRenderLoop(() => {
    const dt = Math.min(0.05, engine.getDeltaTime() / 1000);
    update(dt);
    scene.render();
    if (!booted) {
      booted = true;
      const splash = document.getElementById("splash");
      splash.classList.add("gone"); setTimeout(() => splash.remove(), 450);
      document.getElementById("ui").classList.remove("hidden");
    }
  });
  window.addEventListener("resize", () => engine.resize());
})();
