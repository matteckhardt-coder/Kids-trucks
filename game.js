// Dirt Diggers — a kids' construction game on Babylon.js with real Kenney
// (CC0) truck models. Drive the loader, dig the dirt terrain, and fill the
// dump truck. Tap a truck to drive it.
(function () {
  "use strict";
  const B = BABYLON;

  // ---- World / grid ----
  const GRID = 40, CELL = 2, HALF = (GRID * CELL) / 2, BASE = 3, MAX_DIRT = 6, REACH = CELL * 1.25;
  const FACE = 0; // Kenney Car Kit models face +Z forward (our forward)

  const dirt = new Float32Array(GRID * GRID), tint = new Float32Array(GRID * GRID), rough = new Float32Array(GRID * GRID);
  const di = (c, r) => r * GRID + c;
  const inB = (c, r) => c >= 0 && c < GRID && r >= 0 && r < GRID;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const cellX = (c) => -HALF + (c + 0.5) * CELL, cellZ = (r) => -HALF + (r + 0.5) * CELL;
  const w2c = (x) => Math.round((x + HALF) / CELL - 0.5), w2r = (z) => Math.round((z + HALF) / CELL - 0.5);
  const lerp = (a, b, t) => a + (b - a) * t;
  function hex(n) { return new B.Color3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); }

  function seedDirt() {
    for (let i = 0; i < dirt.length; i++) { dirt[i] = 0; tint[i] = 0.92 + Math.random() * 0.1; rough[i] = (Math.random() * 2 - 1) * 0.06; }
    const mounds = [[10, 9, 5, 4], [28, 12, 4.5, 3.8], [20, 23, 6, 4.4], [31, 30, 4, 3.6], [9, 30, 4, 3.4], [33, 8, 3.6, 3.2]];
    for (const [mc, mr, rad, peak] of mounds) for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
      const d = Math.hypot(c - mc, r - mr); if (d < rad) dirt[di(c, r)] = clamp(dirt[di(c, r)] + peak * (1 - d / rad), -3, MAX_DIRT);
    }
  }

  // ---- Input ----
  const input = { mx: 0, my: 0, dig: false, dump: false };
  let heldDig = false, heldDump = false; const keys = Object.create(null);

  // ---- Engine / scene ----
  const canvas = document.getElementById("renderCanvas");
  const engine = new B.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, antialias: true }, true);
  const scene = new B.Scene(engine);
  scene.clearColor = hex(0x86c2dc).toColor4(1);
  scene.fogMode = B.Scene.FOGMODE_EXP2; scene.fogColor = hex(0xbcd9e6); scene.fogDensity = 0.0038;

  const CAM_OFFSET = new B.Vector3(12, 20, -17);
  const camera = new B.TargetCamera("cam", CAM_OFFSET.clone(), scene);
  camera.fov = 0.72; camera.minZ = 0.4; camera.maxZ = 600; scene.activeCamera = camera;
  const camLook = new B.Vector3(0, BASE, 0);

  const hemi = new B.HemisphericLight("hemi", new B.Vector3(0.2, 1, 0.1), scene);
  hemi.intensity = 0.75; hemi.diffuse = hex(0xcfe0ee); hemi.groundColor = hex(0x6a5a3a);
  const sun = new B.DirectionalLight("sun", new B.Vector3(-0.55, -1.1, -0.5), scene);
  sun.position = new B.Vector3(60, 90, 55); sun.intensity = 2.6; sun.diffuse = hex(0xfff2da);
  const shadow = new B.ShadowGenerator(2048, sun);
  shadow.useBlurExponentialShadowMap = true; shadow.blurKernel = 24; shadow.darkness = 0.55; shadow.bias = 0.002;

  const pipe = new B.DefaultRenderingPipeline("dp", true, scene, [camera]);
  pipe.fxaaEnabled = true; pipe.samples = 4;
  pipe.imageProcessingEnabled = true; pipe.imageProcessing.toneMappingEnabled = true;
  pipe.imageProcessing.toneMappingType = B.ImageProcessingConfiguration.TONEMAPPING_ACES;
  pipe.imageProcessing.exposure = 1.1; pipe.imageProcessing.contrast = 1.1;
  pipe.imageProcessing.vignetteEnabled = true; pipe.imageProcessing.vignetteWeight = 1.2;

  (function sky() {
    const tex = new B.DynamicTexture("sky", { width: 16, height: 256 }, scene, false);
    const ctx = tex.getContext(); const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "#2f73bd"); g.addColorStop(0.55, "#7fb4dd"); g.addColorStop(1, "#d4e8f1");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 16, 256); tex.update();
    const s = B.MeshBuilder.CreateSphere("sky", { diameter: 800, segments: 10, sideOrientation: B.Mesh.BACKSIDE }, scene);
    const m = new B.StandardMaterial("skyM", scene); m.disableLighting = true; m.backFaceCulling = false; m.emissiveTexture = tex; m.diffuseColor = new B.Color3(0, 0, 0);
    s.material = m; s.infiniteDistance = true; s.isPickable = false;
  })();

  // ---- Dirt terrain (deformable heightmap) ----
  function dirtAlbedo() {
    const dt = new B.DynamicTexture("dA", { width: 512, height: 512 }, scene, true); const ctx = dt.getContext();
    ctx.fillStyle = "#7c5230"; ctx.fillRect(0, 0, 512, 512);
    const blob = (n, cols, a, rmin, rmax) => { ctx.globalAlpha = a; for (let i = 0; i < n; i++) { ctx.fillStyle = cols[(Math.random() * cols.length) | 0]; const x = Math.random() * 512, y = Math.random() * 512, r = rmin + Math.random() * (rmax - rmin); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); } };
    blob(1400, ["#6e4524", "#875a31", "#5c3a1d"], 0.55, 1, 5); blob(500, ["#4a2f17", "#3c2613"], 0.5, 2, 8); blob(400, ["#9c7747", "#ab8351"], 0.55, 1, 4); blob(140, ["#9a9384", "#857c6b"], 0.8, 3, 8);
    ctx.globalAlpha = 1; dt.update(); dt.wrapU = dt.wrapV = B.Texture.WRAP_ADDRESSMODE; return dt;
  }
  function dirtNormal() {
    const S = 256, G = 26; const nt = new B.DynamicTexture("dN", { width: S, height: S }, scene, true); const ctx = nt.getContext(); const img = ctx.createImageData(S, S);
    const grid = new Float32Array((G + 1) * (G + 1)); for (let i = 0; i < grid.length; i++) grid[i] = Math.random();
    const sm = (t) => t * t * (3 - 2 * t); const h = (x, y) => { const fx = (x / S) * G, fy = (y / S) * G, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, g = (i, j) => grid[(j % (G + 1)) * (G + 1) + (i % (G + 1))]; return lerp(lerp(g(x0, y0), g(x0 + 1, y0), sm(tx)), lerp(g(x0, y0 + 1), g(x0 + 1, y0 + 1), sm(tx)), sm(ty)); };
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { let nx = (h((x - 1 + S) % S, y) - h((x + 1) % S, y)) * 2.4, ny = (h(x, (y - 1 + S) % S) - h(x, (y + 1) % S)) * 2.4, nz = 1, inv = 1 / Math.hypot(nx, ny, nz); nx *= inv; ny *= inv; nz *= inv; const idx = (y * S + x) * 4; img.data[idx] = (nx * 0.5 + 0.5) * 255; img.data[idx + 1] = (ny * 0.5 + 0.5) * 255; img.data[idx + 2] = (nz * 0.5 + 0.5) * 255; img.data[idx + 3] = 255; }
    ctx.putImageData(img, 0, 0); nt.update(); nt.wrapU = nt.wrapV = B.Texture.WRAP_ADDRESSMODE; return nt;
  }
  const W = GRID, tPos = new Float32Array(W * W * 3), tNrm = new Float32Array(W * W * 3), tCol = new Float32Array(W * W * 4), tIdx = [];
  const ty = (c, r) => BASE + dirt[di(c, r)] + rough[di(c, r)];
  function vcol(c, r) { const i = di(c, r), hh = dirt[i], t = tint[i], f = hh >= 0 ? lerp(1.0, 1.16, Math.min(1, hh / MAX_DIRT)) : lerp(1.0, 0.58, Math.min(1, -hh / 3)); return [f * t, f * t * 0.95, f * t * 0.86]; }
  let terrain;
  function buildTerrain() {
    for (let r = 0; r < W; r++) for (let c = 0; c < W; c++) { const v = (r * W + c) * 3, k = (r * W + c) * 4; tPos[v] = cellX(c); tPos[v + 1] = ty(c, r); tPos[v + 2] = cellZ(r); const col = vcol(c, r); tCol[k] = col[0]; tCol[k + 1] = col[1]; tCol[k + 2] = col[2]; tCol[k + 3] = 1; }
    for (let r = 0; r < W - 1; r++) for (let c = 0; c < W - 1; c++) { const i = r * W + c; tIdx.push(i, i + W, i + 1, i + 1, i + W, i + W + 1); }
    B.VertexData.ComputeNormals(tPos, tIdx, tNrm);
    const uvs = new Float32Array(W * W * 2); for (let r = 0; r < W; r++) for (let c = 0; c < W; c++) { const k = (r * W + c) * 2; uvs[k] = (c / (W - 1)) * 14; uvs[k + 1] = (r / (W - 1)) * 14; }
    const vd = new B.VertexData(); vd.positions = tPos; vd.indices = tIdx; vd.normals = tNrm; vd.uvs = uvs; vd.colors = tCol;
    terrain = new B.Mesh("terrain", scene); vd.applyToMesh(terrain, true);
    const m = new B.PBRMaterial("terrainMat", scene); m.albedoTexture = dirtAlbedo(); m.bumpTexture = dirtNormal(); m.bumpTexture.level = 0.9; m.metallic = 0; m.roughness = 0.96; m.environmentIntensity = 0.3; m.twoSidedLighting = true; m.backFaceCulling = false;
    terrain.material = m; terrain.receiveShadows = true;
  }
  let terrainDirty = false;
  function touch(c, r) { if (!inB(c, r)) return; const v = (r * W + c) * 3, k = (r * W + c) * 4; tPos[v + 1] = ty(c, r); const col = vcol(c, r); tCol[k] = col[0]; tCol[k + 1] = col[1]; tCol[k + 2] = col[2]; terrainDirty = true; }
  function refresh() { B.VertexData.ComputeNormals(tPos, tIdx, tNrm); terrain.updateVerticesData(B.VertexBuffer.PositionKind, tPos); terrain.updateVerticesData(B.VertexBuffer.NormalKind, tNrm); terrain.updateVerticesData(B.VertexBuffer.ColorKind, tCol); }

  function pbr(n, rough) { const m = new B.PBRMaterial("p" + n, scene); m.albedoColor = hex(n); m.metallic = 0; m.roughness = rough == null ? 0.9 : rough; m.environmentIntensity = 0.35; return m; }

  // ---- Dust ----
  function dot() { const dt = new B.DynamicTexture("dot", { width: 64, height: 64 }, scene, false); const ctx = dt.getContext(); const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30); g.addColorStop(0, "rgba(255,255,255,0.9)"); g.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64); dt.update(); return dt; }
  const dust = new B.ParticleSystem("dust", 600, scene);
  dust.particleTexture = dot(); dust.emitter = new B.Vector3(0, BASE, 0);
  dust.minEmitBox = new B.Vector3(-0.4, 0, -0.4); dust.maxEmitBox = new B.Vector3(0.4, 0.3, 0.4);
  dust.color1 = hex(0xb59a6a).toColor4(0.7); dust.color2 = hex(0x8a6d3b).toColor4(0.6); dust.colorDead = new B.Color4(0.6, 0.5, 0.3, 0);
  dust.minSize = 0.3; dust.maxSize = 1.1; dust.minLifeTime = 0.25; dust.maxLifeTime = 0.6; dust.emitRate = 0; dust.gravity = new B.Vector3(0, 2, 0);
  dust.direction1 = new B.Vector3(-1, 1, -1); dust.direction2 = new B.Vector3(1, 2, 1); dust.minEmitPower = 0.4; dust.maxEmitPower = 1.4; dust.updateSpeed = 0.02; dust.start();
  function puff(x, y, z, n) { dust.emitter.set(x, y, z); dust.manualEmitCount = n; }

  // Confetti for the cheer.
  const confetti = new B.ParticleSystem("confetti", 300, scene);
  confetti.particleTexture = dot(); confetti.emitter = new B.Vector3(0, BASE, 0);
  confetti.minEmitBox = new B.Vector3(-1, 0, -1); confetti.maxEmitBox = new B.Vector3(1, 0, 1);
  confetti.color1 = new B.Color4(1, 0.85, 0.2, 1); confetti.color2 = new B.Color4(1, 0.4, 0.4, 1); confetti.colorDead = new B.Color4(1, 1, 1, 0);
  confetti.minSize = 0.25; confetti.maxSize = 0.5; confetti.minLifeTime = 0.8; confetti.maxLifeTime = 1.4; confetti.emitRate = 0; confetti.gravity = new B.Vector3(0, -9, 0);
  confetti.direction1 = new B.Vector3(-3, 7, -3); confetti.direction2 = new B.Vector3(3, 11, 3); confetti.minEmitPower = 1; confetti.maxEmitPower = 2; confetti.start();

  // ---- Asset loading ----
  const CT = {};
  async function load(folder, name) { CT[name] = await B.SceneLoader.LoadAssetContainerAsync(folder + name + ".glb", "", scene); }
  function instance(name) { const e = CT[name].instantiateModelsToScene((n) => name + "_" + n, false); return e.rootNodes[0]; }

  // ---- Fleet config ----
  const FLEET = [
    { id: "loader", name: "Loader", emoji: "🚜", model: "tractor-shovel", size: 3.6, speed: 7.5, dig: true, dump: true, scoop: "front", digRate: 5, capacity: 6, digMin: -2, tool: /shovel/i, toolKind: "scoop" },
    { id: "dumptruck", name: "Dump Truck", emoji: "🚚", model: "truck", size: 3.8, speed: 9, dig: false, dump: true, scoop: "driveover", loadRate: 6, capacity: 14, hauler: true, loadAt: [0, 0.9, -0.6] },
    { id: "garbage", name: "Garbage Truck", emoji: "🚛", model: "garbage-truck", size: 4.0, speed: 8, dig: false, dump: true, scoop: "driveover", loadRate: 5, capacity: 12, hauler: true, loadAt: [0, 1.1, -0.3] },
    { id: "tractor", name: "Tractor", emoji: "🚜", model: "tractor", size: 3.4, speed: 8, dig: false, dump: false },
    { id: "firetruck", name: "Fire Truck", emoji: "🚒", model: "firetruck", size: 4.0, speed: 9, dig: false, dump: false },
    { id: "delivery", name: "Delivery", emoji: "📦", model: "delivery", size: 3.8, speed: 9, dig: false, dump: false },
  ];
  const SPAWN = { loader: [-4, 5], dumptruck: [3, 0], garbage: [10, 6], tractor: [-12, -3], firetruck: [14, 11], delivery: [-13, 12] };

  const machines = [];
  function spawnVehicle(cfg) {
    const root = instance(cfg.model);
    const { min, max } = root.getHierarchyBoundingVectors(true);
    const s = cfg.size / Math.max(max.x - min.x, max.z - min.z);
    const holder = new B.TransformNode("veh_" + cfg.id, scene); root.parent = holder; holder.scaling.setAll(s);
    const [sx, sz] = SPAWN[cfg.id] || [0, 0];
    const m = {
      def: cfg, x: sx, z: sz, heading: Math.atan2(-sx, -sz), bucket: 0, rideY: BASE, animT: Math.random() * 6,
      lastDust: 0, lastDigPuff: 0, wasFull: false, snd: { dig: 0, dump: 0, beep: 0 },
      acting: { dig: false, dump: false, load: false }, holder, yOffset: -min.y * s,
      wheels: [], tool: null, loadMesh: null,
    };
    const meshes = root.getChildMeshes();
    meshes.forEach((mesh) => { mesh.truckRef = m; shadow.addShadowCaster(mesh); });
    m.wheels = meshes.filter((mesh) => /wheel/i.test(mesh.name));
    if (cfg.tool) m.tool = meshes.find((mesh) => cfg.tool.test(mesh.name));
    if (m.tool) m.toolRest = m.tool.rotation.x;
    if (cfg.hauler) {
      const lm = B.MeshBuilder.CreateBox("load_" + cfg.id, { width: 1.4, height: 0.7, depth: 1.6 }, scene);
      lm.material = pbr(0x5e3f20, 1.0); lm.isPickable = false; lm.setEnabled(false); shadow.addShadowCaster(lm);
      m.loadMesh = lm;
    }
    machines.push(m);
  }

  let active;
  function setActive(t, silent) {
    active = t;
    document.getElementById("machine-label").textContent = t.def.name;
    document.querySelectorAll(".machine-btn").forEach((b) => b.classList.toggle("active", b.dataset.id === t.def.id));
    document.getElementById("btn-dig").classList.toggle("off", !t.def.dig);
    document.getElementById("btn-dump").classList.toggle("off", !t.def.dump);
    if (!silent) Sound.horn();
  }
  function levelYard() { for (let i = 0; i < dirt.length; i++) dirt[i] = 0; for (let r = 0; r < W; r++) for (let c = 0; c < W; c++) touch(c, r); }

  // ---- Environment ----
  function placeModel(name, x, z, s, ry) {
    const root = instance(name); const holder = new B.TransformNode("env", scene); root.parent = holder;
    const { min, max } = root.getHierarchyBoundingVectors(true); const sc = s / Math.max(max.x - min.x, max.z - min.z);
    holder.scaling.setAll(sc); holder.rotation.y = (ry || 0) + FACE; holder.position.set(x, BASE - min.y * sc, z);
    root.getChildMeshes().forEach((mesh) => { shadow.addShadowCaster(mesh); mesh.isPickable = false; });
  }
  function buildEnvironment() {
    const gm = pbr(0x6cb24a, 1.0); const OUT = 160, IN = HALF - CELL;
    const patch = (cx, cz, w, d) => { const g = B.MeshBuilder.CreateGround("grass", { width: w, height: d }, scene); g.position.set(cx, BASE - 0.06, cz); g.material = gm; g.receiveShadows = true; };
    patch(0, (IN + OUT) / 2, 2 * OUT, OUT - IN); patch(0, -(IN + OUT) / 2, 2 * OUT, OUT - IN); patch((IN + OUT) / 2, 0, OUT - IN, 2 * IN); patch(-(IN + OUT) / 2, 0, OUT - IN, 2 * IN);
    const R = HALF + 10;
    const builds = ["building-type-a", "building-type-b", "building-type-c", "building-type-e"];
    placeModel(builds[0], R, -6, 9, -Math.PI / 2); placeModel(builds[1], R, 8, 10, -Math.PI / 2);
    placeModel(builds[2], -R, -4, 9, Math.PI / 2); placeModel(builds[3], -6, R, 10, Math.PI);
    placeModel(builds[1], 10, R, 9, Math.PI);
    for (const [x, z, sc] of [[-R + 2, -R + 2, 5], [R - 3, -R + 4, 6], [-R + 4, R - 3, 5], [R - 2, R - 2, 6], [0, -R + 2, 5]]) placeModel(Math.random() < 0.5 ? "tree-large" : "tree-small", x, z, sc, Math.random() * 6);
    for (const [x, z] of [[-HALF + 2, -HALF + 2], [HALF - 2, -HALF + 2], [-HALF + 2, HALF - 2], [HALF - 2, HALF - 2]]) placeModel("cone", x, z, 1.4, 0);
  }

  // ---- Geometry helpers ----
  const camFwd = new B.Vector3(-CAM_OFFSET.x, 0, -CAM_OFFSET.z).normalize();
  const camRight = new B.Vector3(camFwd.z, 0, -camFwd.x);
  function frontCell(t, reach, side) { const a = t.heading + (side ? Math.PI / 2 : 0); return { c: w2c(t.x + Math.sin(a) * reach), r: w2r(t.z + Math.cos(a) * reach) }; }
  function toolCell(t) { return frontCell(t, REACH, false); }

  // ---- Buried treasures ----
  const treasures = [];
  const TKIND = [0x37d0e6, 0xff5d6c, 0xffd23f, 0x57d98a, 0xc06cff, 0xff9a3a];
  function placeTreasures(n) {
    for (let i = 0; i < n; i++) {
      const c = 5 + ((Math.random() * (GRID - 10)) | 0), r = 5 + ((Math.random() * (GRID - 10)) | 0), col = TKIND[i % TKIND.length];
      const m = B.MeshBuilder.CreatePolyhedron("treasure" + i, { type: 1, size: 0.7 }, scene);
      const mt = new B.PBRMaterial("tre" + i, scene); mt.albedoColor = hex(col); mt.emissiveColor = hex(col).scale(0.35); mt.metallic = 0.25; mt.roughness = 0.15;
      m.material = mt; m.position.set(cellX(c), BASE - 3, cellZ(r)); m.setEnabled(false); m.isPickable = false; shadow.addShadowCaster(m);
      const mk = B.MeshBuilder.CreateDisc("tmk" + i, { radius: 0.95, tessellation: 22 }, scene);
      mk.rotation.x = Math.PI / 2; mk.position.set(cellX(c), BASE + 0.06, cellZ(r));
      const mm = new B.PBRMaterial("tmk" + i, scene); mm.albedoColor = hex(0xffe24a); mm.emissiveColor = hex(0xffcf3a); mm.alpha = 0.55; mk.material = mm; mk.isPickable = false;
      treasures.push({ c, r, mesh: m, marker: mk, found: false, y: BASE - 3 });
    }
  }
  function countFound() { let k = 0; for (const t of treasures) if (t.found) k++; return k; }
  function updateTreasures(dt) {
    for (const t of treasures) {
      let dug = false;
      if (!t.found) for (let dr = -2; dr <= 2 && !dug; dr++) for (let dc = -2; dc <= 2 && !dug; dc++) { if (inB(t.c + dc, t.r + dr) && dirt[di(t.c + dc, t.r + dr)] <= -0.4) dug = true; }
      if (dug) {
        t.found = true; if (t.marker) { t.marker.dispose(); t.marker = null; }
        puff(cellX(t.c), ty(t.c, t.r) + 0.5, cellZ(t.r), 16);
        confetti.emitter = new B.Vector3(cellX(t.c), ty(t.c, t.r) + 1, cellZ(t.r)); confetti.manualEmitCount = 50; Sound.ding();
      }
      if (t.found) { const tgt = ty(t.c, t.r) + 0.95; t.y += (tgt - t.y) * Math.min(1, dt * 4); t.mesh.position.y = t.y + Math.sin(performance.now() * 0.004) * 0.1; t.mesh.rotation.y += dt * 1.6; }
      else if (t.marker) { const p = 1 + Math.sin(performance.now() * 0.005) * 0.12; t.marker.scaling.set(p, p, p); }
    }
  }

  // ---- Build zone (flag) + grown buildings ----
  let zone = null, builtCount = 0;
  function newZone() {
    const a = Math.random() * 6.28, rd = 7 + Math.random() * (HALF - 12), x = Math.cos(a) * rd, z = Math.sin(a) * rd;
    const pole = B.MeshBuilder.CreateCylinder("pole", { diameter: 0.18, height: 2.4 }, scene); pole.position.set(x, BASE + 1.2, z); pole.material = pbr(0x7a4a25, 0.7); pole.isPickable = false; shadow.addShadowCaster(pole);
    const flag = B.MeshBuilder.CreateBox("flag", { width: 1.2, height: 0.75, depth: 0.08 }, scene); flag.position.set(x + 0.6, BASE + 2.0, z); const fm = new B.PBRMaterial("fm", scene); fm.albedoColor = hex(0xff3b3b); fm.emissiveColor = hex(0x4a0000); flag.material = fm; flag.isPickable = false;
    const ring = B.MeshBuilder.CreateTorus("ring", { diameter: 6, thickness: 0.35, tessellation: 30 }, scene); ring.position.set(x, BASE + 0.07, z); const rm = new B.PBRMaterial("rm", scene); rm.albedoColor = hex(0xffd23f); rm.emissiveColor = hex(0x6a4d00); ring.material = rm; ring.isPickable = false;
    zone = { x, z, nodes: [pole, flag, ring] };
  }
  const GROWN = ["building-type-a", "building-type-b", "building-type-c", "building-type-e"];
  function growBuilding(x, z) {
    const root = instance(GROWN[builtCount % GROWN.length]); const holder = new B.TransformNode("grown", scene); root.parent = holder;
    const { min, max } = root.getHierarchyBoundingVectors(true); const sc = 8 / Math.max(max.x - min.x, max.z - min.z);
    holder.position.set(x, BASE - min.y * sc, z); holder.rotation.y = Math.random() * 6 + FACE;
    root.getChildMeshes().forEach((me) => { shadow.addShadowCaster(me); me.isPickable = false; });
    holder.scaling.setAll(0.01); let s = 0;
    const obs = scene.onBeforeRenderObservable.add(() => { s += 0.05; const v = Math.min(1, s), e = 1 - Math.pow(1 - v, 3); holder.scaling.setAll(sc * e); if (v >= 1) scene.onBeforeRenderObservable.remove(obs); });
  }
  function deliver(hauler) {
    hauler.bucket = 0;
    puff(zone.x, BASE + 1, zone.z, 30); confetti.emitter = new B.Vector3(zone.x, BASE + 2, zone.z); confetti.manualEmitCount = 120;
    growBuilding(zone.x, zone.z); zone.nodes.forEach((n) => n.dispose()); zone = null; builtCount++;
    completeJob();
  }

  // ---- Jobs ----
  const JOBS = ["treasure", "fill", "deliver"];
  let jobIdx = 0, stars = 0, jobActive = true, treBase = 0, cheerT = 0, arrow = null;
  function dumptruck() { return machines.find((m) => m.def.id === "dumptruck"); }
  function gtext(s) { document.getElementById("goal-text").textContent = s; }
  function makeArrow() { arrow = B.MeshBuilder.CreateCylinder("arrow", { diameterTop: 0, diameterBottom: 1.2, height: 1.4, tessellation: 6 }, scene); arrow.rotation.x = Math.PI; const am = new B.PBRMaterial("am", scene); am.albedoColor = hex(0xffe24a); am.emissiveColor = hex(0x7a5d00); arrow.material = am; arrow.isPickable = false; arrow.setEnabled(false); }
  function startJob() {
    jobActive = true; const j = JOBS[jobIdx % JOBS.length];
    if (j === "treasure") { gtext("Dig where it sparkles to find treasure! 💎"); treBase = countFound(); }
    else if (j === "fill") { gtext("Fill the dump truck with dirt! 🚚"); }
    else if (j === "deliver") { gtext("Drive the full dump truck to the 🚩 flag!"); if (!zone) newZone(); }
  }
  function completeJob() {
    if (!jobActive) return; jobActive = false; stars++;
    document.getElementById("stars").textContent = "⭐ " + stars;
    cheerT = 2.0; const el = document.getElementById("cheer"); el.textContent = ["Great job! 🎉", "Awesome! ⭐", "You did it! 💪", "Nice work! 🚜"][stars % 4]; el.classList.add("show");
    Sound.ding(); setTimeout(() => Sound.horn(), 250);
    setTimeout(() => { jobIdx++; startJob(); }, 2100);
  }
  function checkJobs(dt) {
    if (cheerT > 0) { cheerT -= dt; if (cheerT <= 0) document.getElementById("cheer").classList.remove("show"); }
    let prog = 0; const j = JOBS[jobIdx % JOBS.length];
    if (jobActive) {
      if (j === "treasure") { prog = clamp(countFound() - treBase, 0, 1); if (prog >= 1) completeJob(); }
      else if (j === "fill") { const d = dumptruck(); prog = d.bucket / d.def.capacity; if (prog >= 0.999) completeJob(); }
      else if (j === "deliver") { const d = dumptruck(); const inZone = zone && Math.hypot(d.x - zone.x, d.z - zone.z) < 3.4 && d.bucket > d.def.capacity * 0.5; prog = inZone ? 1 : d.bucket / d.def.capacity; if (inZone) deliver(d); }
      document.getElementById("goal-fill").style.width = clamp(prog * 100, 0, 100) + "%";
    }
    // Guiding arrow.
    let tx = null, tz = null;
    if (j === "treasure") { let bd = 1e9; for (const tr of treasures) { if (tr.found) continue; const d = Math.hypot(tr.mesh.position.x - active.x, tr.mesh.position.z - active.z); if (d < bd) { bd = d; tx = tr.mesh.position.x; tz = tr.mesh.position.z; } } }
    else if (j === "fill") { const d = dumptruck(); tx = d.x; tz = d.z; }
    else if (j === "deliver" && zone) { tx = zone.x; tz = zone.z; }
    if (arrow) { if (tx == null || !jobActive) arrow.setEnabled(false); else { arrow.setEnabled(true); arrow.position.set(tx, BASE + 3.4 + Math.sin(performance.now() * 0.005) * 0.25, tz); } }
  }

  // ---- Update ----
  function update(dt) {
    const t = active, def = t.def;
    for (const m of machines) { m.acting.dig = m.acting.dump = m.acting.load = false; }
    readKeyboard();
    const mag = Math.hypot(input.mx, input.my);
    if (mag > 0.08) {
      const dx = camRight.x * input.mx + camFwd.x * (-input.my), dz = camRight.z * input.mx + camFwd.z * (-input.my);
      const len = Math.hypot(dx, dz) || 1;
      t.x = clamp(t.x + (dx / len) * mag * def.speed * dt, -HALF + 1, HALF - 1);
      t.z = clamp(t.z + (dz / len) * mag * def.speed * dt, -HALF + 1, HALF - 1);
      const tg = Math.atan2(dx, dz); let d = tg - t.heading; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; t.heading += d * 0.22;
    }
    // Drive-over loading (haulers pick up loose dirt piles).
    if (def.scoop === "driveover" && mag > 0.2 && t.bucket < def.capacity) {
      const c = w2c(t.x), r = w2r(t.z); if (inB(c, r) && dirt[di(c, r)] > 0.3) { const i = di(c, r), want = Math.min((def.loadRate || 5) * dt, def.capacity - t.bucket, dirt[i]); if (want > 0) { dirt[i] -= want; t.bucket += want; touch(c, r); t.acting.load = true; } }
    }
    // DIG.
    if (input.dig && def.dig && t.bucket < def.capacity) {
      const tc = toolCell(t); if (inB(tc.c, tc.r)) { const i = di(tc.c, tc.r), fl = def.digMin != null ? def.digMin : -2, want = Math.min(def.digRate * dt, def.capacity - t.bucket, dirt[i] - fl); if (want > 0.0001) { dirt[i] -= want; t.bucket += want; touch(tc.c, tc.r); t.acting.dig = true; } }
    }
    // DUMP — into a nearby hauler, else onto the ground.
    if (input.dump && def.dump && t.bucket > 0) {
      const tc = toolCell(t), tx = cellX(tc.c), tz = cellZ(tc.r);
      const hauler = machines.find((m) => m !== t && m.def.hauler && m.bucket < m.def.capacity - 0.01 && (Math.hypot(m.x - tx, m.z - tz) < 4.2 || Math.hypot(m.x - t.x, m.z - t.z) < 5.5));
      if (hauler) { const g = Math.min(def.digRate * dt, t.bucket, hauler.def.capacity - hauler.bucket); if (g > 0.0001) { t.bucket -= g; hauler.bucket += g; t.acting.dump = true; if (Math.random() < 0.3) puff(hauler.x, hauler.rideY + 1.4, hauler.z, 2); } }
      else if (inB(tc.c, tc.r)) { const i = di(tc.c, tc.r), g = Math.min(def.digRate * dt, t.bucket, MAX_DIRT - dirt[i]); if (g > 0.0001) { dirt[i] += g; t.bucket -= g; touch(tc.c, tc.r); t.acting.dump = true; } }
    }
    if (terrainDirty) { refresh(); terrainDirty = false; }
    for (const m of machines) animate(m, dt, m === t ? mag : 0);

    // Camera.
    const k = Math.min(1, dt * 5);
    camera.position.x += (active.x + CAM_OFFSET.x - camera.position.x) * k; camera.position.y += (CAM_OFFSET.y - camera.position.y) * k; camera.position.z += (active.z + CAM_OFFSET.z - camera.position.z) * k;
    camLook.x += (active.x - camLook.x) * k; camLook.z += (active.z - camLook.z) * k; camLook.y = BASE; camera.setTarget(camLook);

    // Dust + dig puffs.
    if (mag > 0.15 && performance.now() - t.lastDust > 50) { puff(t.x - Math.sin(t.heading) * 1.6, t.rideY + 0.2, t.z - Math.cos(t.heading) * 1.6, 2); t.lastDust = performance.now(); }
    if (t.acting.dig && performance.now() - t.lastDigPuff > 80) { const c = toolCell(t); puff(cellX(c.c), t.rideY + 0.4, cellZ(c.r), 6); t.lastDigPuff = performance.now(); }

    // Sound.
    Sound.engine(mag); t.snd.dig -= dt; t.snd.dump -= dt; t.snd.beep -= dt;
    if ((t.acting.dig || t.acting.load) && t.snd.dig <= 0) { Sound.dig(); t.snd.dig = 0.11; }
    if (t.acting.dump && t.snd.dump <= 0) { Sound.dump(); t.snd.dump = 0.14; }
    if (def.scoop === "driveover" && mag > 0.25 && t.snd.beep <= 0) { Sound.beep(); t.snd.beep = 0.6; }

    // Treasures + job loop.
    updateTreasures(dt);
    checkJobs(dt);
    document.getElementById("bucket-fill").style.width = clamp((t.bucket / (def.capacity || 1)) * 100, 0, 100) + "%";
  }

  function animate(m, dt, mag) {
    const def = m.def, cc = w2c(m.x), rr = w2r(m.z), terr = inB(cc, rr) ? Math.max(0, dirt[di(cc, rr)]) : 0;
    m.rideY += (BASE + terr - m.rideY) * Math.min(1, dt * 8);
    const working = m.acting.dig || m.acting.dump || m.acting.load;
    m.animT += dt * (working ? 16 : mag > 0.1 ? 9 + mag * 7 : 3);
    const bob = Math.sin(m.animT) * (working ? 0.05 : mag > 0.1 ? 0.04 : 0.012);
    m.holder.position.set(m.x, m.rideY + m.yOffset + Math.max(0, bob), m.z);
    m.holder.rotation.y = m.heading + FACE;
    const spin = mag * def.speed * dt * 1.1;
    for (const w of m.wheels) w.rotation.x += spin;
    if (m.tool) { const target = m.toolRest + ((m.acting.dig) ? -0.5 - 0.12 * Math.sin(m.animT * 10) : m.acting.dump ? 0.4 : 0); m.tool.rotation.x += (target - m.tool.rotation.x) * Math.min(1, dt * 10); }
    if (m.loadMesh) {
      const fill = m.bucket / def.capacity; m.loadMesh.setEnabled(fill > 0.03);
      const la = def.loadAt || [0, 0.9, -0.4];
      m.loadMesh.position.set(m.x + Math.sin(m.heading) * la[2], m.rideY + la[1], m.z + Math.cos(m.heading) * la[2]);
      m.loadMesh.rotation.y = m.heading; m.loadMesh.scaling.set(1, clamp(fill, 0.05, 1), 1);
    }
  }

  // ---- Controls ----
  function readKeyboard() {
    let kx = 0, ky = 0;
    if (keys["arrowleft"] || keys["a"]) kx -= 1; if (keys["arrowright"] || keys["d"]) kx += 1;
    if (keys["arrowup"] || keys["w"]) ky -= 1; if (keys["arrowdown"] || keys["s"]) ky += 1;
    if (kx || ky) { const m = Math.hypot(kx, ky); input.mx = kx / m; input.my = ky / m; } else if (!joyId) { input.mx = 0; input.my = 0; }
    input.dig = !!(keys["j"] || keys[" "]) || heldDig; input.dump = !!keys["k"] || heldDump;
  }
  let joyId = null, joyOX = 0, joyOY = 0; const JR = 56; let joyEl, knobEl; const taps = {};
  function startJoy(id, x, y) { joyId = id; joyOX = x; joyOY = y; joyEl.style.left = (x - 66) + "px"; joyEl.style.top = (y - 66) + "px"; joyEl.classList.add("active"); moveJoy(x, y); }
  function moveJoy(x, y) { let dx = x - joyOX, dy = y - joyOY; const d = Math.hypot(dx, dy); if (d > JR) { dx = dx / d * JR; dy = dy / d * JR; } knobEl.style.transform = `translate(${dx}px, ${dy}px)`; input.mx = dx / JR; input.my = dy / JR; }
  function endJoy() { joyId = null; joyEl.classList.remove("active"); knobEl.style.transform = "translate(0,0)"; input.mx = 0; input.my = 0; }
  function isCtl(t) { return t && t.closest && t.closest("button, .machine-picker, .action-buttons, .hud, .goal"); }
  function pickTruck(x, y) { const p = scene.pick(x, y); let n = p && p.pickedMesh; while (n) { if (n.truckRef) return n.truckRef; n = n.parent; } return null; }
  function buildControls() {
    joyEl = document.getElementById("joystick"); knobEl = document.getElementById("joystick-knob");
    const picker = document.getElementById("machine-picker"); picker.innerHTML = "";
    FLEET.forEach((cfg) => { const b = document.createElement("button"); b.type = "button"; b.className = "machine-btn"; b.dataset.id = cfg.id; b.innerHTML = `<span class="ico">${cfg.emoji}</span><span>${cfg.name}</span>`; b.addEventListener("click", () => { const m = machines.find((x) => x.def.id === cfg.id); if (m) setActive(m); }); picker.appendChild(b); });
    document.getElementById("btn-flatten").addEventListener("click", levelYard);
    document.getElementById("btn-mute").addEventListener("click", (e) => { Sound.ensure(); e.currentTarget.textContent = Sound.toggleMute() ? "🔇" : "🔊"; });
    const hold = (id, set) => { const el = document.getElementById(id); const on = (e) => { Sound.ensure(); set(true); if (e.cancelable) e.preventDefault(); }; const off = () => set(false); el.addEventListener("pointerdown", on); el.addEventListener("pointerup", off); el.addEventListener("pointercancel", off); el.addEventListener("pointerleave", off); };
    hold("btn-dig", (v) => (heldDig = v)); hold("btn-dump", (v) => (heldDump = v));
    window.addEventListener("pointerdown", (e) => { Sound.ensure(); if (isCtl(e.target)) return; taps[e.pointerId] = { x: e.clientX, y: e.clientY, moved: false, truck: pickTruck(e.clientX, e.clientY) }; if (joyId === null && e.clientX <= window.innerWidth * 0.62) startJoy(e.pointerId, e.clientX, e.clientY); });
    window.addEventListener("pointermove", (e) => { const tp = taps[e.pointerId]; if (tp && Math.hypot(e.clientX - tp.x, e.clientY - tp.y) > 10) tp.moved = true; if (e.pointerId === joyId) moveJoy(e.clientX, e.clientY); });
    const up = (e) => { const tp = taps[e.pointerId]; if (tp && !tp.moved && tp.truck && tp.truck !== active) setActive(tp.truck); delete taps[e.pointerId]; if (e.pointerId === joyId) endJoy(); };
    window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
  }
  window.addEventListener("keydown", (e) => { keys[e.key.toLowerCase()] = true; Sound.ensure(); });
  window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

  // ---- Boot ----
  (async function boot() {
    seedDirt(); buildTerrain();
    const tip = document.querySelector(".splash-tip");
    try {
      if (tip) tip.textContent = "Loading trucks…";
      await Promise.all(FLEET.map((c) => load("assets/models/", c.model)));
      await Promise.all(["building-type-a", "building-type-b", "building-type-c", "building-type-e", "tree-large", "tree-small"].map((n) => load("assets/city/", n)));
      await load("assets/models/", "cone");
      buildEnvironment();
      FLEET.forEach(spawnVehicle);
      active = machines.find((m) => m.def.id === "loader") || machines[0];
      camera.position.set(active.x + CAM_OFFSET.x, CAM_OFFSET.y, active.z + CAM_OFFSET.z); camLook.set(active.x, BASE, active.z);
      buildControls(); setActive(active, true);
      placeTreasures(6); makeArrow(); newZone(); startJob();
    } catch (e) {
      if (tip) tip.textContent = "Failed to load: " + e;
      console.error(e); return;
    }
    const splash = document.getElementById("splash"); splash.classList.add("gone"); setTimeout(() => splash.remove(), 450);
    document.getElementById("ui").classList.remove("hidden");
    engine.runRenderLoop(() => { const dt = Math.min(0.05, engine.getDeltaTime() / 1000); update(dt); scene.render(); });
    window.addEventListener("resize", () => engine.resize());
  })();
})();
