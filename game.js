// Dirt Diggers 3D — a blocky construction game built on Babylon.js.
// A whole fleet of brick-built trucks shares one dirt yard. Tap a truck to
// drive it; loaders and backhoes can dump their dirt into the dump truck.
(function () {
  "use strict";

  const B = BABYLON;

  // ---- Grid / world ----
  const GRID = 40;
  const CELL = 2;
  const HALF = (GRID * CELL) / 2;
  const BASE = 3;
  const MAX_DIRT = 6;
  const REACH = CELL * 1.15;
  const SPEED_SCALE = 0.05; // 2D-tuned speeds -> calm 3D pace

  const dirt = new Float32Array(GRID * GRID);
  const tint = new Float32Array(GRID * GRID);
  const rough = new Float32Array(GRID * GRID); // tiny surface unevenness
  const di = (c, r) => r * GRID + c;
  const inBounds = (c, r) => c >= 0 && c < GRID && r >= 0 && r < GRID;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const cellX = (c) => -HALF + (c + 0.5) * CELL;
  const cellZ = (r) => -HALF + (r + 0.5) * CELL;
  const worldToC = (x) => Math.round((x + HALF) / CELL - 0.5);
  const worldToR = (z) => Math.round((z + HALF) / CELL - 0.5);
  const lerp = (a, b, t) => a + (b - a) * t;

  function seedDirt() {
    for (let i = 0; i < dirt.length; i++) {
      dirt[i] = 0;
      tint[i] = 0.9 + Math.random() * 0.12;
      rough[i] = (Math.random() * 2 - 1) * 0.05;
    }
    const mounds = [
      [10, 9, 5, 4.5], [28, 11, 4, 4], [20, 22, 6, 5], [32, 30, 4, 4.2],
      [8, 30, 4, 3.8], [31, 7, 3.5, 3.6], [14, 33, 4, 4], [23, 6, 3.5, 3.6], [33, 20, 3.5, 3.8],
    ];
    for (const [mc, mr, rad, peak] of mounds)
      for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
        const d = Math.hypot(c - mc, r - mr);
        if (d < rad) dirt[di(c, r)] = clamp(dirt[di(c, r)] + peak * (1 - d / rad), -3, MAX_DIRT);
      }
  }

  function hex(n) { return new B.Color3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); }

  // ---- Shared input ----
  const input = { mx: 0, my: 0, dig: false, dump: false };
  let heldDig = false, heldDump = false;
  const keys = Object.create(null);

  // ---- Engine / scene ----
  const canvas = document.getElementById("renderCanvas");
  const engine = new B.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, antialias: true }, true);
  const scene = new B.Scene(engine);
  scene.clearColor = hex(0x8fc7dd).toColor4(1);
  scene.ambientColor = new B.Color3(0.5, 0.5, 0.5);

  const CAM_OFFSET = new B.Vector3(13, 24, -20);
  const camera = new B.TargetCamera("cam", CAM_OFFSET.clone(), scene);
  camera.fov = 0.72; camera.minZ = 0.5; camera.maxZ = 400;
  scene.activeCamera = camera;
  const camLook = new B.Vector3(0, BASE, 0);

  const hemi = new B.HemisphericLight("hemi", new B.Vector3(0.3, 1, 0.2), scene);
  hemi.intensity = 0.72; hemi.groundColor = hex(0x6a5a3a);
  const sun = new B.DirectionalLight("sun", new B.Vector3(-0.6, -1.2, -0.5), scene);
  sun.position = new B.Vector3(50, 80, 50); sun.intensity = 1.05;
  const shadow = new B.ShadowGenerator(1024, sun);
  shadow.useBlurExponentialShadowMap = true; shadow.blurKernel = 16; shadow.darkness = 0.45;

  // ---- Dirt textures (diffuse soil + normal map for relief) ----
  function makeDirtTexture() {
    const dt = new B.DynamicTexture("dirt", { width: 256, height: 256 }, scene, true);
    const ctx = dt.getContext();
    ctx.fillStyle = "#8a5d33"; ctx.fillRect(0, 0, 256, 256);
    const blob = (n, cols, rmin, rmax, a) => {
      ctx.globalAlpha = a;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = cols[(Math.random() * cols.length) | 0];
        const x = Math.random() * 256, y = Math.random() * 256, r = rmin + Math.random() * (rmax - rmin);
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      }
    };
    blob(460, ["#7a4f2a", "#946334", "#6e4524"], 1, 4, 0.6);
    blob(150, ["#5e3c1f", "#4f3318"], 2, 6, 0.5);
    blob(110, ["#a9824f", "#b9925a"], 1, 3, 0.6);
    blob(50, ["#9a9384", "#857c6b", "#736a59"], 2, 5, 0.75);
    ctx.globalAlpha = 1; dt.update();
    return dt;
  }
  function makeDirtNormal() {
    const S = 128, G = 18;
    const nt = new B.DynamicTexture("dirtN", { width: S, height: S }, scene, true);
    const ctx = nt.getContext();
    const img = ctx.createImageData(S, S);
    const grid = new Float32Array((G + 1) * (G + 1));
    for (let i = 0; i < grid.length; i++) grid[i] = Math.random();
    const sm = (t) => t * t * (3 - 2 * t);
    const h = (x, y) => {
      const fx = (x / S) * G, fy = (y / S) * G;
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const g = (i, j) => grid[(j % (G + 1)) * (G + 1) + (i % (G + 1))];
      return lerp(lerp(g(x0, y0), g(x0 + 1, y0), sm(tx)), lerp(g(x0, y0 + 1), g(x0 + 1, y0 + 1), sm(tx)), sm(ty));
    };
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let nx = (h((x - 1 + S) % S, y) - h((x + 1) % S, y)) * 2.2;
      let ny = (h(x, (y - 1 + S) % S) - h(x, (y + 1) % S)) * 2.2;
      let nz = 1; const inv = 1 / Math.hypot(nx, ny, nz); nx *= inv; ny *= inv; nz *= inv;
      const idx = (y * S + x) * 4;
      img.data[idx] = (nx * 0.5 + 0.5) * 255; img.data[idx + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[idx + 2] = (nz * 0.5 + 0.5) * 255; img.data[idx + 3] = 255;
    }
    ctx.putImageData(img, 0, 0); nt.update();
    return nt;
  }

  const block = B.MeshBuilder.CreateBox("block", { size: 1 }, scene);
  const blockMat = new B.StandardMaterial("blockMat", scene);
  blockMat.diffuseColor = new B.Color3(1, 1, 1);
  blockMat.diffuseTexture = makeDirtTexture();
  blockMat.bumpTexture = makeDirtNormal(); blockMat.bumpTexture.level = 0.55;
  blockMat.specularColor = new B.Color3(0.05, 0.05, 0.05);
  block.material = blockMat;
  block.receiveShadows = true;

  const N = GRID * GRID;
  const matrixData = new Float32Array(N * 16);
  const colorData = new Float32Array(N * 4);
  const _scale = new B.Vector3(CELL * 0.96, 1, CELL * 0.96);
  const _pos = new B.Vector3();
  const _q = B.Quaternion.Identity();

  function dirtColor(h, i) {
    const t = tint[i];
    const f = h >= 0 ? lerp(1.0, 1.25, Math.min(1, h / MAX_DIRT)) : lerp(1.0, 0.55, Math.min(1, -h / 3));
    return [f * t, f * t * 0.97, f * t * 0.9];
  }
  function writeCell(c, r) {
    const i = di(c, r);
    let top = BASE + dirt[i] + rough[i]; if (top < 0.5) top = 0.5;
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

  // ---- Materials ----
  const matCache = {};
  function mat(n) {
    if (matCache[n]) return matCache[n];
    const m = new B.StandardMaterial("m" + n, scene);
    m.diffuseColor = hex(n); m.specularColor = new B.Color3(0.15, 0.15, 0.15);
    return (matCache[n] = m);
  }

  // ---- Environment ----
  function buildEnvironment() {
    const gm = new B.StandardMaterial("grassMat", scene);
    gm.diffuseColor = hex(0x6cb24a); gm.specularColor = new B.Color3(0, 0, 0);
    const OUT = 120;
    const patch = (cx, cz, w, d) => {
      const g = B.MeshBuilder.CreateGround("grass", { width: w, height: d }, scene);
      g.position.set(cx, BASE - 0.05, cz); g.material = gm; g.receiveShadows = true;
    };
    patch(0, (HALF + OUT) / 2, 2 * OUT, OUT - HALF);
    patch(0, -(HALF + OUT) / 2, 2 * OUT, OUT - HALF);
    patch((HALF + OUT) / 2, 0, OUT - HALF, 2 * HALF);
    patch(-(HALF + OUT) / 2, 0, OUT - HALF, 2 * HALF);

    scene.fogMode = B.Scene.FOGMODE_EXP2; scene.fogColor = hex(0x9fcfe0); scene.fogDensity = 0.005;

    const trunkMat = mat(0x7a5230), leaf = mat(0x4f9e3a), leaf2 = mat(0x63bd4a), rock = mat(0x8d8d8d);
    const tree = (x, z, s) => {
      s = s || 1;
      const t = B.MeshBuilder.CreateBox("trunk", { width: 0.6 * s, height: 1.6 * s, depth: 0.6 * s }, scene);
      t.position.set(x, BASE + 0.8 * s, z); t.material = trunkMat; shadow.addShadowCaster(t);
      for (const [oy, sz, m] of [[1.95, 1.8, leaf], [2.8, 1.25, leaf2]]) {
        const l = B.MeshBuilder.CreateBox("leaf", { size: sz * s }, scene);
        l.position.set(x, BASE + oy * s, z); l.material = m; l.receiveShadows = true; shadow.addShadowCaster(l);
      }
    };
    const building = (x, z, w, d, h, colA, roofCol) => {
      const b = B.MeshBuilder.CreateBox("bld", { width: w, height: h, depth: d }, scene);
      b.position.set(x, BASE + h / 2, z); b.material = mat(colA); b.receiveShadows = true; shadow.addShadowCaster(b);
      const roof = B.MeshBuilder.CreateBox("roof", { width: w + 0.5, height: 0.5, depth: d + 0.5 }, scene);
      roof.position.set(x, BASE + h + 0.25, z); roof.material = mat(roofCol); shadow.addShadowCaster(roof);
      const door = B.MeshBuilder.CreateBox("door", { width: Math.min(2, w * 0.4), height: h * 0.5, depth: 0.12 }, scene);
      door.position.set(x, BASE + h * 0.25, z + d / 2 + 0.07); door.material = mat(0x3a2f22);
    };
    const R = HALF + 10;
    tree(-R, -R * 0.4, 1.2); tree(-R + 4, R * 0.3, 1); tree(R * 0.2, -R, 1.1);
    tree(R, R * 0.5, 1.3); tree(-R * 0.5, R, 1); tree(R * 0.7, R * 0.8, 0.9); tree(-R, R, 1.1);
    building(R, -R * 0.15, 8, 6, 5, 0xb24a2a, 0x6a3320);
    building(-R, -R * 0.9, 5, 5, 3.5, 0xd9c34a, 0x8a7a2a);
    building(R * 0.25, R, 6, 5, 4, 0x4d7fb0, 0x33597f);
    for (const [rx, rz] of [[-R * 0.2, -R * 0.7], [R * 0.85, -R * 0.6], [-R * 0.85, R * 0.2]]) {
      const rk = B.MeshBuilder.CreateBox("rock", { width: 1.6, height: 1.0, depth: 1.4 }, scene);
      rk.position.set(rx, BASE + 0.4, rz); rk.material = rock; shadow.addShadowCaster(rk);
    }
    const cloud = mat(0xffffff);
    for (const [cx, cz] of [[-22, 44], [32, -32], [12, 54], [-44, -22]]) {
      const cl = B.MeshBuilder.CreateBox("cloud", { width: 9, height: 2.6, depth: 5 }, scene);
      cl.position.set(cx, 40, cz); cl.material = cloud;
    }
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const cone = B.MeshBuilder.CreateCylinder("cone", { diameterTop: 0, diameterBottom: 1.2, height: 1.8 }, scene);
      cone.position.set(sx * (HALF - 1.5), BASE + 0.9, sz * (HALF - 1.5));
      cone.material = mat(0xff7a1a); shadow.addShadowCaster(cone);
    }
  }

  // ---- Trucks ----
  function tbox(t, name, w, h, d, x, y, z, material, parent) {
    const b = B.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    b.position.set(x, y, z); b.material = material; b.parent = parent; b.truckRef = t;
    shadow.addShadowCaster(b);
    return b;
  }
  function studs(t, parent, w, d, topY, material) {
    for (let i = -1; i <= 1; i += 2) for (let j = -1; j <= 1; j += 2) {
      const s = B.MeshBuilder.CreateCylinder("stud", { diameter: 0.42, height: 0.18 }, scene);
      s.position.set(i * w * 0.28, topY, j * d * 0.28); s.material = material; s.parent = parent; s.truckRef = t;
    }
  }

  function buildTruckMeshes(t) {
    const def = t.def, shape = def.shape || {};
    const root = new B.TransformNode("truck_" + def.id, scene);
    const body = mat(def.color), accent = mat(def.accent), dark = mat(0x26221c), glass = mat(0x9fd8ec), tire = mat(0x1d1b19);

    tbox(t, "chassis", 2.2, 0.7, 3.2, 0, 0.95, 0, body, root);
    const cabZ = shape.bedBack ? 0.9 : -0.5;
    const cab = tbox(t, "cab", 1.8, 0.95, 1.25, 0, 1.75, cabZ, accent, root);
    tbox(t, "glass", 1.5, 0.5, 0.12, 0, 1.85, cabZ + 0.62, glass, root);
    studs(t, cab, 1.8, 1.25, 0.55, body);
    tbox(t, "pipe", 0.18, 0.7, 0.18, 0.7, 1.9, cabZ - 0.4, dark, root);
    t.beacon = tbox(t, "beacon", 0.3, 0.22, 0.3, -0.55, 2.34, cabZ, mat(0xffd84a), root);

    let toolPivot = null, toolKind = null;
    const pivot = (x, y, z) => { const p = new B.TransformNode("toolp", scene); p.position.set(x, y, z); p.parent = root; return p; };
    if (shape.bladeFront) { toolPivot = pivot(0, 0.9, 1.4); toolKind = "blade"; tbox(t, "blade", 2.7, 1.3, 0.35, 0, 0, 0.55, accent, toolPivot); }
    if (shape.bucketFront) {
      toolPivot = pivot(0, 1.0, 1.45); toolKind = "bucket";
      tbox(t, "arm", 0.22, 0.22, 1.0, 0.62, 0, 0.1, dark, toolPivot);
      tbox(t, "arm2", 0.22, 0.22, 1.0, -0.62, 0, 0.1, dark, toolPivot);
      tbox(t, "bucket", 2.0, 0.5, 0.85, 0, -0.32, 0.7, accent, toolPivot);
      tbox(t, "lip", 2.0, 0.16, 0.3, 0, -0.55, 1.0, dark, toolPivot);
    }
    if (shape.bedBack) {
      toolPivot = pivot(0, 1.05, -1.55); toolKind = "bed";
      const bed = tbox(t, "bed", 2.0, 0.95, 2.0, 0, 0.4, 0.95, accent, toolPivot);
      studs(t, bed, 2.0, 2.0, 0.54, dark);
      t.bedDirt = tbox(t, "beddirt", 1.7, 0.6, 1.7, 0, -0.075, 0.95, mat(0x6e4a24), toolPivot);
      t.bedDirt.setEnabled(false);
    }
    if (shape.armBack) { tbox(t, "boom", 0.3, 0.3, 1.6, 0, 1.6, -1.9, accent, root); tbox(t, "boom2", 0.3, 1.2, 0.3, 0, 1.2, -2.6, accent, root); tbox(t, "dipper", 1.0, 0.5, 0.4, 0, 0.5, -2.7, dark, root); }
    if (shape.sideBucket) {
      toolPivot = pivot(1.2, 0.7, 0); toolKind = "side";
      tbox(t, "sidebkt", 0.7, 0.5, 2.4, 0.5, -0.2, 0, accent, toolPivot);
      tbox(t, "sidelip", 0.3, 0.16, 2.4, 0.85, -0.42, 0, dark, toolPivot);
    }
    t.toolPivot = toolPivot; t.toolKind = toolKind;

    let layout;
    if (shape.tracks) layout = [[1.15, -1.0], [1.15, 1.0], [-1.15, -1.0], [-1.15, 1.0]];
    else if (shape.wheels === "twin") layout = [[1.15, -1.1], [1.15, 0], [1.15, 1.1], [-1.15, -1.1], [-1.15, 0], [-1.15, 1.1]];
    else layout = [[1.15, -1.05], [1.15, 1.05], [-1.15, -1.05], [-1.15, 1.05]];
    const wr = shape.wheels === "small" ? 0.5 : 0.6;
    t.wheels = [];
    for (const [wx, wz] of layout) {
      const wp = new B.TransformNode("wp", scene); wp.position.set(wx, wr, wz); wp.parent = root;
      const cyl = B.MeshBuilder.CreateCylinder("wheel", { diameter: wr * 2, height: 0.45, tessellation: 12 }, scene);
      cyl.rotation.z = Math.PI / 2; cyl.material = tire; cyl.parent = wp; cyl.truckRef = t;
      shadow.addShadowCaster(cyl); t.wheels.push(wp);
    }

    root.position.set(t.x, BASE, t.z); root.rotation.y = t.heading;
    t.root = root;
  }

  // ---- Fleet ----
  const SPAWN = {
    bulldozer: [-15, -7], frontloader: [-4, 4], backhoe: [9, 5],
    dumptruck: [2, -1], skidsteer: [16, 10], sideloader: [-13, 12],
  };
  const machines = [];
  TRUCKS.forEach((def) => {
    const [x, z] = SPAWN[def.id] || [0, 0];
    const t = {
      def, x, z, heading: Math.atan2(-x, -z), bucket: 0, rideY: BASE,
      animT: Math.random() * 6, phase: Math.random() * 6, lastDust: 0, lastDigPuff: 0,
      wasFull: false, snd: { dig: 0, dump: 0, beep: 0 },
      acting: { dig: false, dump: false, load: false, doze: false },
      root: null, wheels: [], beacon: null, toolPivot: null, toolKind: null, bedDirt: null,
    };
    buildTruckMeshes(t);
    machines.push(t);
  });
  let active = machines.find((m) => m.def.id === "frontloader") || machines[0];
  camera.position.set(active.x + CAM_OFFSET.x, CAM_OFFSET.y, active.z + CAM_OFFSET.z);
  camLook.set(active.x, BASE, active.z);

  function setActive(t, silent) {
    active = t;
    document.getElementById("machine-label").textContent = t.def.name;
    document.querySelectorAll(".machine-btn").forEach((b) => b.classList.toggle("active", b.dataset.id === t.def.id));
    document.getElementById("btn-dig").classList.toggle("off", t.def.dig === false);
    document.getElementById("btn-dump").classList.toggle("off", t.def.dump === false);
    if (!silent) Sound.horn();
  }
  function levelYard() {
    for (let i = 0; i < dirt.length; i++) dirt[i] = 0;
    for (const m of machines) m.bucket = 0;
    for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) writeCell(c, r);
    blocksDirty = true;
  }

  // ---- Dust ----
  function dotTexture() {
    const dt = new B.DynamicTexture("dot", { width: 64, height: 64 }, scene, false);
    const ctx = dt.getContext();
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, "rgba(255,255,255,0.9)"); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64); dt.update(); return dt;
  }
  const dust = new B.ParticleSystem("dust", 500, scene);
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
  function puff(x, y, z, n) { dust.emitter.set(x, y, z); dust.manualEmitCount = n; }

  // ---- Geometry helpers (operate on a given truck) ----
  const camFwd = new B.Vector3(-CAM_OFFSET.x, 0, -CAM_OFFSET.z).normalize();
  const camRight = new B.Vector3(camFwd.z, 0, -camFwd.x);
  function frontCell(t, reach, side) {
    const a = t.heading + (side ? Math.PI / 2 : 0);
    return { c: worldToC(t.x + Math.sin(a) * reach), r: worldToR(t.z + Math.cos(a) * reach) };
  }
  function toolCell(t) { return t.def.scoop === "side" ? frontCell(t, REACH, true) : frontCell(t, REACH, false); }

  // ---- Per-frame ----
  function update(dt) {
    const t = active, def = t.def;
    for (const m of machines) { m.acting.dig = m.acting.dump = m.acting.load = m.acting.doze = false; }
    readKeyboard();

    // Drive the active truck (camera-relative).
    const mag = Math.hypot(input.mx, input.my);
    if (mag > 0.08) {
      const dx = camRight.x * input.mx + camFwd.x * (-input.my);
      const dz = camRight.z * input.mx + camFwd.z * (-input.my);
      const len = Math.hypot(dx, dz) || 1, v = def.speed * SPEED_SCALE;
      t.x = clamp(t.x + (dx / len) * mag * v * dt, -HALF + 1, HALF - 1);
      t.z = clamp(t.z + (dz / len) * mag * v * dt, -HALF + 1, HALF - 1);
      const target = Math.atan2(dx, dz);
      let d = target - t.heading; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      t.heading += d * 0.25;
    }

    // Bulldozer push.
    if (def.dozer && mag > 0.2) {
      const b = frontCell(t, REACH, false), a = frontCell(t, REACH + CELL, false);
      if (inBounds(b.c, b.r) && inBounds(a.c, a.r)) {
        const bi = di(b.c, b.r), ai = di(a.c, a.r);
        if (dirt[bi] > 0) { const moved = Math.min(dirt[bi], 5 * dt * mag, MAX_DIRT - dirt[ai]); if (moved > 0) { dirt[bi] -= moved; dirt[ai] += moved; touchCell(b.c, b.r); touchCell(a.c, a.r); t.acting.doze = true; } }
      }
    }

    // Dump truck drive-over loading from ground.
    if (def.scoop === "driveover" && mag > 0.2 && t.bucket < def.capacity) {
      const c = worldToC(t.x), r = worldToR(t.z);
      if (inBounds(c, r) && dirt[di(c, r)] > 0.3) {
        const i = di(c, r), want = Math.min((def.loadRate || def.digRate) * dt, def.capacity - t.bucket, dirt[i]);
        if (want > 0) { dirt[i] -= want; t.bucket += want; touchCell(c, r); t.acting.load = true; }
      }
    }

    // DIG.
    if (input.dig && def.dig !== false && t.bucket < def.capacity) {
      const tc = toolCell(t);
      if (inBounds(tc.c, tc.r)) {
        const i = di(tc.c, tc.r), floorD = def.digMin != null ? def.digMin : -2;
        const want = Math.min(def.digRate * dt, def.capacity - t.bucket, dirt[i] - floorD);
        if (want > 0.0001) { dirt[i] -= want; t.bucket += want; touchCell(tc.c, tc.r); t.acting.dig = true; }
      }
    }

    // DUMP — into a nearby dump truck if there is one, else onto the ground.
    if (input.dump && def.dump !== false && t.bucket > 0) {
      const tc = toolCell(t), tx = cellX(tc.c), tz = cellZ(tc.r);
      const truck = machines.find((m) => m !== t && m.def.scoop === "driveover" && m.bucket < m.def.capacity - 0.01 && Math.hypot(m.x - tx, m.z - tz) < 3.2);
      if (truck) {
        const give = Math.min(def.digRate * dt, t.bucket, truck.def.capacity - truck.bucket);
        if (give > 0.0001) { t.bucket -= give; truck.bucket += give; t.acting.dump = true; if (Math.random() < 0.3) puff(truck.x, truck.rideY + 1.6, truck.z, 2); }
      } else if (inBounds(tc.c, tc.r)) {
        if (def.spread) {
          const cells = [[tc.c, tc.r], [tc.c + 1, tc.r], [tc.c - 1, tc.r], [tc.c, tc.r + 1], [tc.c, tc.r - 1]].filter(([c, r]) => inBounds(c, r));
          let placed = 0; const per = (def.digRate * dt) / cells.length;
          for (const [c, r] of cells) { const i = di(c, r), g = Math.min(per, MAX_DIRT - dirt[i]); if (g > 0) { dirt[i] += g; placed += g; touchCell(c, r); } }
          placed = Math.min(placed, t.bucket); if (placed > 0) { t.bucket -= placed; t.acting.dump = true; }
        } else {
          const i = di(tc.c, tc.r), g = Math.min(def.digRate * dt, t.bucket, MAX_DIRT - dirt[i]);
          if (g > 0.0001) { dirt[i] += g; t.bucket -= g; touchCell(tc.c, tc.r); t.acting.dump = true; }
        }
      }
    }

    if (blocksDirty) { block.thinInstanceBufferUpdated("matrix"); block.thinInstanceBufferUpdated("color"); blocksDirty = false; }

    for (const m of machines) animateTruck(m, dt, m === t ? mag : 0);

    // Camera eases to the active truck.
    const k = Math.min(1, dt * 5);
    camera.position.x += (active.x + CAM_OFFSET.x - camera.position.x) * k;
    camera.position.y += (CAM_OFFSET.y - camera.position.y) * k;
    camera.position.z += (active.z + CAM_OFFSET.z - camera.position.z) * k;
    camLook.x += (active.x - camLook.x) * k; camLook.z += (active.z - camLook.z) * k; camLook.y = BASE;
    camera.setTarget(camLook);

    // Dust trail + dig puffs for the active truck.
    if (mag > 0.15 && performance.now() - t.lastDust > 45) { puff(t.x - Math.sin(t.heading) * 1.4, t.rideY + 0.2, t.z - Math.cos(t.heading) * 1.4, 2); t.lastDust = performance.now(); }
    if (t.acting.dig && performance.now() - t.lastDigPuff > 80) { const c = toolCell(t); puff(cellX(c.c), t.rideY + 0.4, cellZ(c.r), 6); t.lastDigPuff = performance.now(); }

    // Sound (active only) + HUD.
    Sound.engine(mag);
    t.snd.dig -= dt; t.snd.dump -= dt; t.snd.beep -= dt;
    if ((t.acting.dig || t.acting.load) && t.snd.dig <= 0) { Sound.dig(); t.snd.dig = 0.11; }
    if (t.acting.dump && t.snd.dump <= 0) { Sound.dump(); t.snd.dump = 0.14; }
    const full = t.bucket >= def.capacity - 0.02;
    if (full && !t.wasFull) Sound.ding();
    t.wasFull = full;
    if (def.scoop === "driveover" && mag > 0.25 && t.snd.beep <= 0) { Sound.beep(); t.snd.beep = 0.6; }
    document.getElementById("bucket-fill").style.width = clamp((t.bucket / def.capacity) * 100, 0, 100) + "%";
  }

  function animateTruck(m, dt, mag) {
    const def = m.def;
    const cc = worldToC(m.x), rr = worldToR(m.z);
    const terr = inBounds(cc, rr) ? Math.max(0, dirt[di(cc, rr)]) : 0;
    m.rideY += (BASE + terr - m.rideY) * Math.min(1, dt * 8);
    m.root.position.set(m.x, m.rideY, m.z); m.root.rotation.y = m.heading;
    const working = m.acting.dig || m.acting.dump || m.acting.load || m.acting.doze;
    m.animT += dt * (working ? 17 : mag > 0.1 ? 9 + mag * 7 : 3);
    const bob = Math.sin(m.animT) * (working ? 0.09 : mag > 0.1 ? 0.06 : 0.02);
    m.root.position.y = m.rideY + Math.max(0, bob);
    for (const w of m.wheels) w.rotation.x += (mag * def.speed * SPEED_SCALE * dt) / 0.6;
    if (m.beacon) m.beacon.scaling.y = 0.6 + (0.5 + 0.5 * Math.sin(performance.now() * 0.016 + m.phase));

    if (m.toolPivot) {
      let target = 0, kind = m.toolKind;
      if (kind === "bucket" || kind === "side") {
        if (m.acting.dig || m.acting.load) target = -0.55 - 0.18 * Math.sin(m.animT * 12);
        else if (m.acting.dump) target = 0.8;
      } else if (kind === "bed") target = m.acting.dump ? -1.0 : 0;
      else if (kind === "blade") target = m.acting.doze ? -0.1 + 0.05 * Math.sin(m.animT * 16) : 0;
      m.toolPivot.rotation.x += (target - m.toolPivot.rotation.x) * Math.min(1, dt * 10);
    }
    if (m.bedDirt) {
      const fill = m.bucket / def.capacity;
      m.bedDirt.setEnabled(fill > 0.02);
      m.bedDirt.scaling.y = Math.max(0.04, fill);
      m.bedDirt.position.y = -0.075 + 0.3 * fill;
    }
  }

  // ---- Controls ----
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

  let joyId = null, joyOX = 0, joyOY = 0; const JOY_R = 56;
  let joyEl, knobEl;
  const taps = {}; // pointerId -> {x,y,moved,truck}
  function startJoy(id, x, y) { joyId = id; joyOX = x; joyOY = y; joyEl.style.left = (x - 66) + "px"; joyEl.style.top = (y - 66) + "px"; joyEl.classList.add("active"); moveJoy(x, y); }
  function moveJoy(x, y) { let dx = x - joyOX, dy = y - joyOY; const d = Math.hypot(dx, dy); if (d > JOY_R) { dx = dx / d * JOY_R; dy = dy / d * JOY_R; } knobEl.style.transform = `translate(${dx}px, ${dy}px)`; input.mx = dx / JOY_R; input.my = dy / JOY_R; }
  function endJoy() { joyId = null; joyEl.classList.remove("active"); knobEl.style.transform = "translate(0,0)"; input.mx = 0; input.my = 0; }
  function isControl(t) { return t && t.closest && t.closest("button, .machine-picker, .action-buttons, .hud"); }
  function pickTruck(x, y) { const p = scene.pick(x, y); return p && p.hit && p.pickedMesh && p.pickedMesh.truckRef; }

  function buildControls() {
    joyEl = document.getElementById("joystick"); knobEl = document.getElementById("joystick-knob");
    const picker = document.getElementById("machine-picker"); picker.innerHTML = "";
    TRUCKS.forEach((def) => {
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = "machine-btn"; btn.dataset.id = def.id;
      btn.innerHTML = `<span class="ico">${def.emoji}</span><span>${def.name}</span>`;
      btn.addEventListener("click", () => { const m = machines.find((x) => x.def.id === def.id); if (m) setActive(m); });
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
      if (isControl(e.target)) return;
      taps[e.pointerId] = { x: e.clientX, y: e.clientY, moved: false, truck: pickTruck(e.clientX, e.clientY) };
      if (joyId === null && e.clientX <= window.innerWidth * 0.62) startJoy(e.pointerId, e.clientX, e.clientY);
    });
    window.addEventListener("pointermove", (e) => {
      const tp = taps[e.pointerId];
      if (tp && Math.hypot(e.clientX - tp.x, e.clientY - tp.y) > 10) tp.moved = true;
      if (e.pointerId === joyId) moveJoy(e.clientX, e.clientY);
    });
    const up = (e) => {
      const tp = taps[e.pointerId];
      if (tp && !tp.moved && tp.truck && tp.truck !== active) setActive(tp.truck);
      delete taps[e.pointerId];
      if (e.pointerId === joyId) endJoy();
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }
  window.addEventListener("keydown", (e) => { keys[e.key.toLowerCase()] = true; Sound.ensure(); });
  window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

  // ---- Boot ----
  seedDirt();
  buildBlocks();
  buildEnvironment();
  buildControls();
  setActive(active, true);

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
