// Dirt Diggers 3D — a construction game built on Babylon.js.
// A fleet of trucks shares a deformable dirt field. Tap a truck to drive it;
// loaders and backhoes can fill the dump truck. Rendered with PBR materials,
// a smooth heightmap terrain, soft shadows and filmic post-processing.
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
  const SPEED_SCALE = 0.05;

  const dirt = new Float32Array(GRID * GRID);
  const tint = new Float32Array(GRID * GRID);
  const rough = new Float32Array(GRID * GRID);
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
      dirt[i] = 0; tint[i] = 0.92 + Math.random() * 0.1; rough[i] = (Math.random() * 2 - 1) * 0.06;
    }
    const mounds = [
      [10, 9, 5, 4.2], [28, 11, 4, 3.6], [20, 22, 6, 4.6], [32, 30, 4, 3.8],
      [8, 30, 4, 3.4], [31, 7, 3.5, 3.2], [14, 33, 4, 3.6], [23, 6, 3.5, 3.2], [33, 20, 3.5, 3.4],
    ];
    for (const [mc, mr, rad, peak] of mounds)
      for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
        const d = Math.hypot(c - mc, r - mr);
        if (d < rad) dirt[di(c, r)] = clamp(dirt[di(c, r)] + peak * (1 - d / rad), -3, MAX_DIRT);
      }
  }

  function hex(n) { return new B.Color3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); }

  const input = { mx: 0, my: 0, dig: false, dump: false };
  let heldDig = false, heldDump = false;
  const keys = Object.create(null);

  // ---- Engine / scene ----
  const canvas = document.getElementById("renderCanvas");
  const engine = new B.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, antialias: true }, true);
  const scene = new B.Scene(engine);
  scene.clearColor = hex(0x86c2dc).toColor4(1);
  scene.fogMode = B.Scene.FOGMODE_EXP2; scene.fogColor = hex(0xbcd9e6); scene.fogDensity = 0.004;

  const CAM_OFFSET = new B.Vector3(13, 22, -19);
  const camera = new B.TargetCamera("cam", CAM_OFFSET.clone(), scene);
  camera.fov = 0.72; camera.minZ = 0.5; camera.maxZ = 600;
  scene.activeCamera = camera;
  const camLook = new B.Vector3(0, BASE, 0);

  const hemi = new B.HemisphericLight("hemi", new B.Vector3(0.2, 1, 0.1), scene);
  hemi.intensity = 0.55; hemi.diffuse = hex(0xbfd4e6); hemi.groundColor = hex(0x6a5a3a);
  const sun = new B.DirectionalLight("sun", new B.Vector3(-0.55, -1.1, -0.5), scene);
  sun.position = new B.Vector3(60, 90, 55); sun.intensity = 3.2; sun.diffuse = hex(0xfff2da);
  const fill = new B.DirectionalLight("fill", new B.Vector3(0.6, -0.5, 0.6), scene);
  fill.intensity = 0.5; fill.diffuse = hex(0xbcd0e6);
  const shadow = new B.ShadowGenerator(2048, sun);
  shadow.useBlurExponentialShadowMap = true; shadow.blurKernel = 24; shadow.darkness = 0.5;
  shadow.bias = 0.0015;

  // Filmic post-processing.
  const pipe = new B.DefaultRenderingPipeline("dp", true, scene, [camera]);
  pipe.fxaaEnabled = true; pipe.samples = 4;
  pipe.imageProcessingEnabled = true;
  pipe.imageProcessing.toneMappingEnabled = true;
  pipe.imageProcessing.toneMappingType = B.ImageProcessingConfiguration.TONEMAPPING_ACES;
  pipe.imageProcessing.exposure = 1.15;
  pipe.imageProcessing.contrast = 1.12;
  pipe.imageProcessing.vignetteEnabled = true; pipe.imageProcessing.vignetteWeight = 1.4;

  // Gradient sky.
  (function buildSky() {
    const tex = new B.DynamicTexture("sky", { width: 16, height: 256 }, scene, false);
    const ctx = tex.getContext();
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "#2f73bd"); g.addColorStop(0.55, "#7fb4dd"); g.addColorStop(1, "#d4e8f1");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 16, 256); tex.update();
    const sky = B.MeshBuilder.CreateSphere("sky", { diameter: 800, segments: 10, sideOrientation: B.Mesh.BACKSIDE }, scene);
    const m = new B.StandardMaterial("skyM", scene);
    m.disableLighting = true; m.backFaceCulling = false; m.emissiveTexture = tex; m.diffuseColor = new B.Color3(0, 0, 0);
    sky.material = m; sky.infiniteDistance = true; sky.isPickable = false;
  })();

  // ---- Dirt textures ----
  function makeDirtAlbedo() {
    const dt = new B.DynamicTexture("dAlb", { width: 512, height: 512 }, scene, true);
    const ctx = dt.getContext();
    ctx.fillStyle = "#7c5230"; ctx.fillRect(0, 0, 512, 512);
    const blob = (n, cols, rmin, rmax, a) => {
      ctx.globalAlpha = a;
      for (let i = 0; i < n; i++) { ctx.fillStyle = cols[(Math.random() * cols.length) | 0]; const x = Math.random() * 512, y = Math.random() * 512, r = rmin + Math.random() * (rmax - rmin); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
    };
    blob(1400, ["#6e4524", "#875a31", "#5c3a1d"], 1, 5, 0.55);
    blob(500, ["#4a2f17", "#3c2613"], 2, 8, 0.5);
    blob(400, ["#9c7747", "#ab8351"], 1, 4, 0.55);
    blob(140, ["#9a9384", "#857c6b", "#6f6657"], 3, 8, 0.8); // pebbles
    ctx.globalAlpha = 1; dt.update();
    dt.wrapU = dt.wrapV = B.Texture.WRAP_ADDRESSMODE;
    return dt;
  }
  function makeDirtNormal() {
    const S = 256, G = 26;
    const nt = new B.DynamicTexture("dNrm", { width: S, height: S }, scene, true);
    const ctx = nt.getContext();
    const img = ctx.createImageData(S, S);
    const grid = new Float32Array((G + 1) * (G + 1));
    for (let i = 0; i < grid.length; i++) grid[i] = Math.random();
    const sm = (t) => t * t * (3 - 2 * t);
    const h = (x, y) => {
      const fx = (x / S) * G, fy = (y / S) * G, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const g = (i, j) => grid[(j % (G + 1)) * (G + 1) + (i % (G + 1))];
      return lerp(lerp(g(x0, y0), g(x0 + 1, y0), sm(tx)), lerp(g(x0, y0 + 1), g(x0 + 1, y0 + 1), sm(tx)), sm(ty));
    };
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let nx = (h((x - 1 + S) % S, y) - h((x + 1) % S, y)) * 2.6;
      let ny = (h(x, (y - 1 + S) % S) - h(x, (y + 1) % S)) * 2.6;
      let nz = 1; const inv = 1 / Math.hypot(nx, ny, nz); nx *= inv; ny *= inv; nz *= inv;
      const idx = (y * S + x) * 4;
      img.data[idx] = (nx * 0.5 + 0.5) * 255; img.data[idx + 1] = (ny * 0.5 + 0.5) * 255; img.data[idx + 2] = (nz * 0.5 + 0.5) * 255; img.data[idx + 3] = 255;
    }
    ctx.putImageData(img, 0, 0); nt.update();
    nt.wrapU = nt.wrapV = B.Texture.WRAP_ADDRESSMODE;
    return nt;
  }

  // ---- Smooth deformable terrain ----
  const W = GRID;
  const terrainPos = new Float32Array(W * W * 3);
  const terrainNrm = new Float32Array(W * W * 3);
  const terrainCol = new Float32Array(W * W * 4);
  const terrainIdx = [];
  function terrainY(c, r) { return BASE + dirt[di(c, r)] + rough[di(c, r)]; }
  function vcol(c, r) {
    const i = di(c, r), h = dirt[i], t = tint[i];
    const f = h >= 0 ? lerp(1.0, 1.16, Math.min(1, h / MAX_DIRT)) : lerp(1.0, 0.58, Math.min(1, -h / 3));
    return [f * t, f * t * 0.95, f * t * 0.86];
  }
  let terrain;
  function buildTerrain() {
    for (let r = 0; r < W; r++) for (let c = 0; c < W; c++) {
      const v = (r * W + c) * 3, k = (r * W + c) * 4;
      terrainPos[v] = cellX(c); terrainPos[v + 1] = terrainY(c, r); terrainPos[v + 2] = cellZ(r);
      const col = vcol(c, r); terrainCol[k] = col[0]; terrainCol[k + 1] = col[1]; terrainCol[k + 2] = col[2]; terrainCol[k + 3] = 1;
    }
    for (let r = 0; r < W - 1; r++) for (let c = 0; c < W - 1; c++) {
      const i = r * W + c;
      terrainIdx.push(i, i + W, i + 1, i + 1, i + W, i + W + 1);
    }
    B.VertexData.ComputeNormals(terrainPos, terrainIdx, terrainNrm);
    const uvs = new Float32Array(W * W * 2);
    for (let r = 0; r < W; r++) for (let c = 0; c < W; c++) { const k = (r * W + c) * 2; uvs[k] = (c / (W - 1)) * 14; uvs[k + 1] = (r / (W - 1)) * 14; }
    const vd = new B.VertexData();
    vd.positions = terrainPos; vd.indices = terrainIdx; vd.normals = terrainNrm; vd.uvs = uvs; vd.colors = terrainCol;
    terrain = new B.Mesh("terrain", scene); vd.applyToMesh(terrain, true);

    const m = new B.PBRMaterial("terrainMat", scene);
    m.albedoTexture = makeDirtAlbedo(); m.bumpTexture = makeDirtNormal(); m.bumpTexture.level = 0.9;
    m.metallic = 0; m.roughness = 0.96; m.environmentIntensity = 0.35; m.twoSidedLighting = true;
    m.backFaceCulling = false;
    terrain.material = m; terrain.receiveShadows = true;
  }
  let terrainDirty = false;
  function touchCell(c, r) {
    if (!inBounds(c, r)) return;
    const v = (r * W + c) * 3, k = (r * W + c) * 4;
    terrainPos[v + 1] = terrainY(c, r);
    const col = vcol(c, r); terrainCol[k] = col[0]; terrainCol[k + 1] = col[1]; terrainCol[k + 2] = col[2];
    terrainDirty = true;
  }
  function refreshTerrain() {
    B.VertexData.ComputeNormals(terrainPos, terrainIdx, terrainNrm);
    terrain.updateVerticesData(B.VertexBuffer.PositionKind, terrainPos);
    terrain.updateVerticesData(B.VertexBuffer.NormalKind, terrainNrm);
    terrain.updateVerticesData(B.VertexBuffer.ColorKind, terrainCol);
  }

  // ---- Materials (PBR) ----
  const matCache = {};
  function mat(n, rough) {
    rough = rough == null ? 0.85 : rough;
    const key = n + "_" + rough;
    if (matCache[key]) return matCache[key];
    const m = new B.PBRMaterial("m" + key, scene);
    m.albedoColor = hex(n); m.metallic = 0.0; m.roughness = rough; m.environmentIntensity = 0.4;
    return (matCache[key] = m);
  }
  const glassMat = new B.PBRMaterial("glass", scene);
  glassMat.albedoColor = hex(0x101418); glassMat.metallic = 0.1; glassMat.roughness = 0.12;
  glassMat.alpha = 0.65; glassMat.environmentIntensity = 0.7;

  // ---- Environment ----
  function buildEnvironment() {
    const gm = mat(0x6cb24a, 1.0);
    const OUT = 160, INNER = HALF - CELL;
    const patch = (cx, cz, w, d) => { const g = B.MeshBuilder.CreateGround("grass", { width: w, height: d }, scene); g.position.set(cx, BASE - 0.06, cz); g.material = gm; g.receiveShadows = true; };
    patch(0, (INNER + OUT) / 2, 2 * OUT, OUT - INNER);
    patch(0, -(INNER + OUT) / 2, 2 * OUT, OUT - INNER);
    patch((INNER + OUT) / 2, 0, OUT - INNER, 2 * INNER);
    patch(-(INNER + OUT) / 2, 0, OUT - INNER, 2 * INNER);

    const trunk = mat(0x7a5230, 0.9), leaf = mat(0x3f8f33, 0.95), leaf2 = mat(0x57ad44, 0.95), rock = mat(0x8d8d8d, 0.85);
    const tree = (x, z, s) => {
      s = s || 1;
      const t = B.MeshBuilder.CreateCylinder("trunk", { diameter: 0.7 * s, height: 1.8 * s, tessellation: 8 }, scene);
      t.position.set(x, BASE + 0.9 * s, z); t.material = trunk; shadow.addShadowCaster(t);
      for (const [oy, d, m] of [[2.2, 3.4, leaf], [3.3, 2.4, leaf2]]) {
        const l = B.MeshBuilder.CreateSphere("leaf", { diameter: d * s, segments: 6 }, scene);
        l.position.set(x, BASE + oy * s, z); l.material = m; l.receiveShadows = true; shadow.addShadowCaster(l);
      }
    };
    const building = (x, z, w, d, h, colA, roofCol) => {
      const b = B.MeshBuilder.CreateBox("bld", { width: w, height: h, depth: d }, scene);
      b.position.set(x, BASE + h / 2, z); b.material = mat(colA, 0.8); b.receiveShadows = true; shadow.addShadowCaster(b);
      const roof = B.MeshBuilder.CreateBox("roof", { width: w + 0.5, height: 0.5, depth: d + 0.5 }, scene);
      roof.position.set(x, BASE + h + 0.25, z); roof.material = mat(roofCol, 0.7); shadow.addShadowCaster(roof);
      const door = B.MeshBuilder.CreateBox("door", { width: Math.min(2, w * 0.4), height: h * 0.5, depth: 0.12 }, scene);
      door.position.set(x, BASE + h * 0.25, z + d / 2 + 0.07); door.material = mat(0x3a2f22, 0.7);
    };
    const R = HALF + 12;
    tree(-R, -R * 0.4, 1.3); tree(-R + 5, R * 0.3, 1.1); tree(R * 0.2, -R, 1.2);
    tree(R, R * 0.5, 1.4); tree(-R * 0.5, R, 1.1); tree(R * 0.7, R * 0.8, 1); tree(-R, R, 1.2);
    building(R, -R * 0.15, 8, 6, 5, 0xb24a2a, 0x6a3320);
    building(-R, -R * 0.9, 5, 5, 3.5, 0xd9c34a, 0x8a7a2a);
    building(R * 0.25, R, 6, 5, 4, 0x4d7fb0, 0x33597f);
    for (const [rx, rz] of [[-R * 0.2, -R * 0.7], [R * 0.85, -R * 0.6], [-R * 0.85, R * 0.2]]) {
      const rk = B.MeshBuilder.CreateSphere("rock", { diameter: 1.7, segments: 4 }, scene);
      rk.position.set(rx, BASE + 0.4, rz); rk.scaling.y = 0.6; rk.material = rock; shadow.addShadowCaster(rk);
    }
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const cone = B.MeshBuilder.CreateCylinder("cone", { diameterTop: 0, diameterBottom: 1.2, height: 1.8 }, scene);
      cone.position.set(sx * (HALF - 1.5), BASE + 0.9, sz * (HALF - 1.5)); cone.material = mat(0xff7a1a, 0.7); shadow.addShadowCaster(cone);
    }
  }

  // ---- Trucks ----
  function tbox(t, name, w, h, d, x, y, z, material, parent) {
    const b = B.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    b.position.set(x, y, z); b.material = material; b.parent = parent; b.truckRef = t;
    shadow.addShadowCaster(b); return b;
  }
  function tcyl(t, name, diam, h, x, y, z, axis, material, parent) {
    const c = B.MeshBuilder.CreateCylinder(name, { diameter: diam, height: h, tessellation: 14 }, scene);
    c.position.set(x, y, z); c.material = material; c.parent = parent; c.truckRef = t;
    if (axis === "x") c.rotation.z = Math.PI / 2; else if (axis === "z") c.rotation.x = Math.PI / 2;
    shadow.addShadowCaster(c); return c;
  }
  function addWheel(ctx, wx, wz, wr) {
    const { t, root, tire, metal } = ctx;
    const wp = new B.TransformNode("wp", scene); wp.position.set(wx, wr, wz); wp.parent = root;
    const cyl = B.MeshBuilder.CreateCylinder("wheel", { diameter: wr * 2, height: 0.5, tessellation: 16 }, scene);
    cyl.rotation.z = Math.PI / 2; cyl.material = tire; cyl.parent = wp; cyl.truckRef = t;
    const hub = B.MeshBuilder.CreateCylinder("hub", { diameter: wr, height: 0.52, tessellation: 10 }, scene);
    hub.rotation.z = Math.PI / 2; hub.material = metal; hub.parent = wp; hub.truckRef = t;
    shadow.addShadowCaster(cyl); t.wheels.push(wp);
  }
  function addCab(ctx, x, y, z, w, h, d, beacon) {
    const { t, accent, root } = ctx;
    tbox(t, "cab", w, h, d, x, y, z, accent, root);
    tbox(t, "glassF", w * 0.82, h * 0.5, 0.08, x, y + 0.06, z + d / 2 + 0.01, glassMat, root);
    tbox(t, "glassL", 0.08, h * 0.5, d * 0.72, x + w / 2 + 0.01, y + 0.06, z, glassMat, root);
    tbox(t, "glassR", 0.08, h * 0.5, d * 0.72, x - w / 2 - 0.01, y + 0.06, z, glassMat, root);
    if (beacon) t.beacon = tbox(t, "beacon", 0.24, 0.2, 0.24, x - w / 2 + 0.18, y + h / 2 + 0.16, z, mat(0xffb024, 0.3), root);
  }
  function addTrack(ctx, sx, len) {
    const { t, root, dark, metal } = ctx;
    const node = new B.TransformNode("track", scene); node.parent = root; node.position.set(sx * 1.02, 0.45, 0);
    tbox(t, "belt", 0.62, 0.8, len, 0, 0, 0, dark, node);
    tcyl(t, "re1", 0.82, 0.66, 0, -0.04, len / 2 - 0.15, "x", metal, node);
    tcyl(t, "re2", 0.82, 0.66, 0, -0.04, -(len / 2 - 0.15), "x", metal, node);
    for (let i = -1; i <= 1; i++) tcyl(t, "rw", 0.5, 0.68, 0, -0.16, i * len * 0.27, "x", metal, node);
  }
  function pivotNode(root, x, y, z) { const p = new B.TransformNode("toolp", scene); p.position.set(x, y, z); p.parent = root; return p; }

  function buildWheelLoader(ctx) {
    const { t, root, body, dark, metal } = ctx;
    tbox(t, "rear", 2.0, 1.05, 1.7, 0, 1.05, -0.75, body, root);
    tbox(t, "front", 1.9, 0.85, 1.5, 0, 0.95, 0.8, body, root);
    addCab(ctx, 0, 1.95, -0.45, 1.5, 1.0, 1.2, true);
    tbox(t, "grille", 1.75, 0.7, 0.12, 0, 1.05, -1.62, dark, root);
    tcyl(t, "stack", 0.16, 0.8, 0.78, 2.05, -0.8, null, metal, root);
    const p = pivotNode(root, 0, 1.0, 1.55); t.toolPivot = p; t.toolKind = "bucket";
    tbox(t, "armL", 0.22, 0.22, 1.5, 0.72, 0.05, -0.25, metal, p);
    tbox(t, "armR", 0.22, 0.22, 1.5, -0.72, 0.05, -0.25, metal, p);
    tbox(t, "bucket", 2.15, 0.6, 1.0, 0, -0.35, 0.6, metal, p);
    tbox(t, "bucketLip", 2.15, 0.14, 0.34, 0, -0.62, 1.05, dark, p);
    tcyl(t, "hydL", 0.15, 1.2, 0.45, 0.34, -0.2, "z", metal, p);
    tcyl(t, "hydR", 0.15, 1.2, -0.45, 0.34, -0.2, "z", metal, p);
    for (const [wx, wz] of [[1.12, -0.95], [1.12, 1.0], [-1.12, -0.95], [-1.12, 1.0]]) addWheel(ctx, wx, wz, 0.66);
  }
  function buildSkid(ctx) {
    const { t, root, body, dark, metal } = ctx;
    tbox(t, "chassis", 1.7, 1.1, 2.2, 0, 1.0, 0, body, root);
    addCab(ctx, 0, 1.85, -0.1, 1.3, 0.9, 1.15, true);
    const p = pivotNode(root, 0, 1.05, 1.15); t.toolPivot = p; t.toolKind = "bucket";
    tbox(t, "armL", 0.2, 0.2, 1.7, 0.92, 0.0, -0.5, metal, p);
    tbox(t, "armR", 0.2, 0.2, 1.7, -0.92, 0.0, -0.5, metal, p);
    tbox(t, "bucket", 1.7, 0.5, 0.85, 0, -0.3, 0.5, metal, p);
    tbox(t, "lip", 1.7, 0.13, 0.3, 0, -0.52, 0.88, dark, p);
    for (const [wx, wz] of [[0.95, -0.72], [0.95, 0.72], [-0.95, -0.72], [-0.95, 0.72]]) addWheel(ctx, wx, wz, 0.55);
  }
  function buildSideLoader(ctx) {
    const { t, root, body, dark, metal } = ctx;
    tbox(t, "chassis", 2.0, 0.9, 3.5, 0, 0.95, 0, body, root);
    addCab(ctx, 0, 1.8, 1.05, 1.5, 0.95, 1.2, true);
    tbox(t, "deck", 1.9, 0.22, 1.9, 0, 1.45, -0.85, dark, root);
    const p = pivotNode(root, 1.2, 0.85, 0); t.toolPivot = p; t.toolKind = "side";
    tbox(t, "arm", 0.22, 0.22, 2.5, 0.0, 0.25, 0, metal, p);
    tbox(t, "sidebkt", 0.8, 0.55, 2.5, 0.5, -0.2, 0, metal, p);
    tbox(t, "lip", 0.3, 0.14, 2.5, 0.86, -0.42, 0, dark, p);
    for (const [wx, wz] of [[1.12, -1.25], [1.12, 1.25], [-1.12, -1.25], [-1.12, 1.25]]) addWheel(ctx, wx, wz, 0.64);
  }
  function buildDumpTruck(ctx) {
    const { t, root, accent, dark, metal } = ctx;
    tbox(t, "chassis", 2.0, 0.5, 3.7, 0, 0.78, 0, dark, root);
    tbox(t, "cab", 1.95, 1.35, 1.2, 0, 1.55, 1.25, accent, root);
    tbox(t, "glassF", 1.6, 0.6, 0.1, 0, 1.78, 1.86, glassMat, root);
    tbox(t, "grille", 1.75, 0.6, 0.12, 0, 1.0, 1.86, metal, root);
    tbox(t, "hlL", 0.3, 0.2, 0.1, 0.72, 1.0, 1.87, mat(0xfff2b0, 0.2), root);
    tbox(t, "hlR", 0.3, 0.2, 0.1, -0.72, 1.0, 1.87, mat(0xfff2b0, 0.2), root);
    tcyl(t, "stackL", 0.16, 1.3, 0.82, 1.75, 0.5, null, metal, root);
    tcyl(t, "stackR", 0.16, 1.3, -0.82, 1.75, 0.5, null, metal, root);
    t.beacon = tbox(t, "beacon", 0.24, 0.2, 0.24, -0.72, 2.3, 1.25, mat(0xffb024, 0.3), root);
    const p = pivotNode(root, 0, 1.05, -1.75); t.toolPivot = p; t.toolKind = "bed";
    tbox(t, "bed", 2.15, 1.0, 2.5, 0, 0.42, 1.2, accent, p);
    tbox(t, "bedIn", 1.95, 0.85, 2.3, 0, 0.52, 1.2, dark, p);
    t.bedDirt = tbox(t, "beddirt", 1.8, 0.6, 2.1, 0, -0.05, 1.2, mat(0x5e3f20, 1.0), p);
    t.bedDirt.setEnabled(false);
    addWheel(ctx, 1.08, 1.15, 0.6); addWheel(ctx, -1.08, 1.15, 0.6);
    for (const wz of [-0.5, -1.3]) { addWheel(ctx, 1.18, wz, 0.6); addWheel(ctx, 0.62, wz, 0.6); addWheel(ctx, -1.18, wz, 0.6); addWheel(ctx, -0.62, wz, 0.6); }
  }
  function buildDozer(ctx) {
    const { t, root, body, dark, metal } = ctx;
    addTrack(ctx, 1, 2.9); addTrack(ctx, -1, 2.9);
    tbox(t, "hull", 1.8, 0.75, 2.5, 0, 1.2, -0.1, body, root);
    addCab(ctx, 0, 2.0, -0.55, 1.3, 0.9, 1.1, true);
    tcyl(t, "stack", 0.16, 0.9, 0.6, 2.1, 0.45, null, metal, root);
    const p = pivotNode(root, 0, 0.95, 1.35); t.toolPivot = p; t.toolKind = "blade";
    tbox(t, "blade", 2.8, 1.45, 0.32, 0, 0, 0.5, metal, p);
    tbox(t, "bladeEdge", 2.8, 0.26, 0.36, 0, -0.62, 0.5, dark, p);
    tbox(t, "pushL", 0.22, 0.22, 1.3, 0.85, -0.1, -0.2, metal, p);
    tbox(t, "pushR", 0.22, 0.22, 1.3, -0.85, -0.1, -0.2, metal, p);
    tbox(t, "ripL", 0.18, 0.8, 0.18, 0.55, 0.55, -2.0, metal, root);
    tbox(t, "ripR", 0.18, 0.8, 0.18, -0.55, 0.55, -2.0, metal, root);
  }
  function buildExcavator(ctx) {
    const { t, root, body, dark, metal } = ctx;
    addTrack(ctx, 1, 3.1); addTrack(ctx, -1, 3.1);
    tbox(t, "house", 2.0, 1.05, 2.3, 0, 1.55, -0.25, body, root);
    tbox(t, "counter", 1.95, 0.95, 0.75, 0, 1.45, -1.45, dark, root);
    addCab(ctx, 0.55, 2.1, 0.45, 0.95, 0.95, 1.0, true);
    const p = pivotNode(root, 0, 1.45, 0.7); t.toolPivot = p; t.toolKind = "arm";
    tbox(t, "boom", 0.34, 0.34, 2.3, 0, 0.72, 0.75, metal, p);
    tbox(t, "dipper", 0.3, 1.5, 0.3, 0, 0.05, 1.78, metal, p);
    tbox(t, "bucket", 0.95, 0.7, 0.7, 0, -0.72, 1.95, metal, p);
    tbox(t, "bucketLip", 0.95, 0.16, 0.3, 0, -1.02, 2.12, dark, p);
    tcyl(t, "hyd", 0.16, 1.7, 0.0, 0.6, 0.95, "z", metal, p);
  }

  function buildTruckMeshes(t) {
    const def = t.def;
    const root = new B.TransformNode("truck_" + def.id, scene);
    const ctx = {
      t, root,
      body: mat(def.color, 0.4), accent: mat(def.accent, 0.4), dark: mat(0x23201b, 0.7),
      metal: mat(0x8e949b, 0.32), tire: mat(0x141312, 0.95),
    };
    t.wheels = []; t.toolPivot = null; t.toolKind = null; t.bedDirt = null; t.beacon = null;
    if (def.id === "backhoe") buildExcavator(ctx);
    else if (def.id === "bulldozer") buildDozer(ctx);
    else if (def.id === "dumptruck") buildDumpTruck(ctx);
    else if (def.id === "skidsteer") buildSkid(ctx);
    else if (def.id === "sideloader") buildSideLoader(ctx);
    else buildWheelLoader(ctx);
    root.position.set(t.x, BASE, t.z); root.rotation.y = t.heading; t.root = root;
  }

  // ---- Fleet ----
  const SPAWN = { bulldozer: [-15, -7], frontloader: [-4, 4], backhoe: [9, 5], dumptruck: [2, -1], skidsteer: [16, 10], sideloader: [-13, 12] };
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
    buildTruckMeshes(t); machines.push(t);
  });
  let active = machines.find((m) => m.def.id === "frontloader") || machines[0];

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
    for (let r = 0; r < W; r++) for (let c = 0; c < W; c++) touchCell(c, r);
  }

  // ---- Dust ----
  function dotTexture() {
    const dt = new B.DynamicTexture("dot", { width: 64, height: 64 }, scene, false);
    const ctx = dt.getContext(); const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, "rgba(255,255,255,0.9)"); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64); dt.update(); return dt;
  }
  const dust = new B.ParticleSystem("dust", 600, scene);
  dust.particleTexture = dotTexture();
  dust.emitter = new B.Vector3(0, BASE, 0);
  dust.minEmitBox = new B.Vector3(-0.4, 0, -0.4); dust.maxEmitBox = new B.Vector3(0.4, 0.3, 0.4);
  dust.color1 = hex(0xb59a6a).toColor4(0.7); dust.color2 = hex(0x8a6d3b).toColor4(0.6);
  dust.colorDead = new B.Color4(0.6, 0.5, 0.3, 0);
  dust.minSize = 0.3; dust.maxSize = 1.1; dust.minLifeTime = 0.25; dust.maxLifeTime = 0.6;
  dust.emitRate = 0; dust.gravity = new B.Vector3(0, 2, 0);
  dust.direction1 = new B.Vector3(-1, 1, -1); dust.direction2 = new B.Vector3(1, 2, 1);
  dust.minEmitPower = 0.4; dust.maxEmitPower = 1.4; dust.updateSpeed = 0.02; dust.start();
  function puff(x, y, z, n) { dust.emitter.set(x, y, z); dust.manualEmitCount = n; }

  // ---- Helpers ----
  const camFwd = new B.Vector3(-CAM_OFFSET.x, 0, -CAM_OFFSET.z).normalize();
  const camRight = new B.Vector3(camFwd.z, 0, -camFwd.x);
  function frontCell(t, reach, side) { const a = t.heading + (side ? Math.PI / 2 : 0); return { c: worldToC(t.x + Math.sin(a) * reach), r: worldToR(t.z + Math.cos(a) * reach) }; }
  function toolCell(t) { return t.def.scoop === "side" ? frontCell(t, REACH, true) : frontCell(t, REACH, false); }

  function update(dt) {
    const t = active, def = t.def;
    for (const m of machines) { m.acting.dig = m.acting.dump = m.acting.load = m.acting.doze = false; }
    readKeyboard();

    const mag = Math.hypot(input.mx, input.my);
    if (mag > 0.08) {
      const dx = camRight.x * input.mx + camFwd.x * (-input.my), dz = camRight.z * input.mx + camFwd.z * (-input.my);
      const len = Math.hypot(dx, dz) || 1, v = def.speed * SPEED_SCALE;
      t.x = clamp(t.x + (dx / len) * mag * v * dt, -HALF + 1, HALF - 1);
      t.z = clamp(t.z + (dz / len) * mag * v * dt, -HALF + 1, HALF - 1);
      const target = Math.atan2(dx, dz); let d = target - t.heading; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; t.heading += d * 0.25;
    }

    if (def.dozer && mag > 0.2) {
      const b = frontCell(t, REACH, false), a = frontCell(t, REACH + CELL, false);
      if (inBounds(b.c, b.r) && inBounds(a.c, a.r)) {
        const bi = di(b.c, b.r), ai = di(a.c, a.r);
        if (dirt[bi] > 0) { const moved = Math.min(dirt[bi], 5 * dt * mag, MAX_DIRT - dirt[ai]); if (moved > 0) { dirt[bi] -= moved; dirt[ai] += moved; touchCell(b.c, b.r); touchCell(a.c, a.r); t.acting.doze = true; } }
      }
    }
    if (def.scoop === "driveover" && mag > 0.2 && t.bucket < def.capacity) {
      const c = worldToC(t.x), r = worldToR(t.z);
      if (inBounds(c, r) && dirt[di(c, r)] > 0.3) { const i = di(c, r), want = Math.min((def.loadRate || def.digRate) * dt, def.capacity - t.bucket, dirt[i]); if (want > 0) { dirt[i] -= want; t.bucket += want; touchCell(c, r); t.acting.load = true; } }
    }
    if (input.dig && def.dig !== false && t.bucket < def.capacity) {
      const tc = toolCell(t);
      if (inBounds(tc.c, tc.r)) { const i = di(tc.c, tc.r), floorD = def.digMin != null ? def.digMin : -2, want = Math.min(def.digRate * dt, def.capacity - t.bucket, dirt[i] - floorD); if (want > 0.0001) { dirt[i] -= want; t.bucket += want; touchCell(tc.c, tc.r); t.acting.dig = true; } }
    }
    if (input.dump && def.dump !== false && t.bucket > 0) {
      const tc = toolCell(t), tx = cellX(tc.c), tz = cellZ(tc.r);
      const truck = machines.find((m) => m !== t && m.def.scoop === "driveover" && m.bucket < m.def.capacity - 0.01 && (Math.hypot(m.x - tx, m.z - tz) < 3.8 || Math.hypot(m.x - t.x, m.z - t.z) < 5.0));
      if (truck) { const give = Math.min(def.digRate * dt, t.bucket, truck.def.capacity - truck.bucket); if (give > 0.0001) { t.bucket -= give; truck.bucket += give; t.acting.dump = true; if (Math.random() < 0.3) puff(truck.x, truck.rideY + 1.7, truck.z, 2); } }
      else if (inBounds(tc.c, tc.r)) {
        if (def.spread) {
          const cells = [[tc.c, tc.r], [tc.c + 1, tc.r], [tc.c - 1, tc.r], [tc.c, tc.r + 1], [tc.c, tc.r - 1]].filter(([c, r]) => inBounds(c, r));
          let placed = 0; const per = (def.digRate * dt) / cells.length;
          for (const [c, r] of cells) { const i = di(c, r), g = Math.min(per, MAX_DIRT - dirt[i]); if (g > 0) { dirt[i] += g; placed += g; touchCell(c, r); } }
          placed = Math.min(placed, t.bucket); if (placed > 0) { t.bucket -= placed; t.acting.dump = true; }
        } else { const i = di(tc.c, tc.r), g = Math.min(def.digRate * dt, t.bucket, MAX_DIRT - dirt[i]); if (g > 0.0001) { dirt[i] += g; t.bucket -= g; touchCell(tc.c, tc.r); t.acting.dump = true; } }
      }
    }

    if (terrainDirty) { refreshTerrain(); terrainDirty = false; }
    for (const m of machines) animateTruck(m, dt, m === t ? mag : 0);

    const k = Math.min(1, dt * 5);
    camera.position.x += (active.x + CAM_OFFSET.x - camera.position.x) * k;
    camera.position.y += (CAM_OFFSET.y - camera.position.y) * k;
    camera.position.z += (active.z + CAM_OFFSET.z - camera.position.z) * k;
    camLook.x += (active.x - camLook.x) * k; camLook.z += (active.z - camLook.z) * k; camLook.y = BASE;
    camera.setTarget(camLook);

    if (mag > 0.15 && performance.now() - t.lastDust > 45) { puff(t.x - Math.sin(t.heading) * 1.5, t.rideY + 0.2, t.z - Math.cos(t.heading) * 1.5, 2); t.lastDust = performance.now(); }
    if (t.acting.dig && performance.now() - t.lastDigPuff > 80) { const c = toolCell(t); puff(cellX(c.c), t.rideY + 0.4, cellZ(c.r), 6); t.lastDigPuff = performance.now(); }

    Sound.engine(mag);
    t.snd.dig -= dt; t.snd.dump -= dt; t.snd.beep -= dt;
    if ((t.acting.dig || t.acting.load) && t.snd.dig <= 0) { Sound.dig(); t.snd.dig = 0.11; }
    if (t.acting.dump && t.snd.dump <= 0) { Sound.dump(); t.snd.dump = 0.14; }
    const full = t.bucket >= def.capacity - 0.02; if (full && !t.wasFull) Sound.ding(); t.wasFull = full;
    if (def.scoop === "driveover" && mag > 0.25 && t.snd.beep <= 0) { Sound.beep(); t.snd.beep = 0.6; }
    document.getElementById("bucket-fill").style.width = clamp((t.bucket / def.capacity) * 100, 0, 100) + "%";
  }

  function animateTruck(m, dt, mag) {
    const def = m.def;
    const cc = worldToC(m.x), rr = worldToR(m.z), terr = inBounds(cc, rr) ? Math.max(0, dirt[di(cc, rr)]) : 0;
    m.rideY += (BASE + terr - m.rideY) * Math.min(1, dt * 8);
    m.root.position.set(m.x, m.rideY, m.z); m.root.rotation.y = m.heading;
    const working = m.acting.dig || m.acting.dump || m.acting.load || m.acting.doze;
    m.animT += dt * (working ? 17 : mag > 0.1 ? 9 + mag * 7 : 3);
    const bob = Math.sin(m.animT) * (working ? 0.08 : mag > 0.1 ? 0.05 : 0.018);
    m.root.position.y = m.rideY + Math.max(0, bob);
    for (const w of m.wheels) w.rotation.x += (mag * def.speed * SPEED_SCALE * dt) / 0.6;
    if (m.beacon) m.beacon.scaling.y = 0.6 + (0.5 + 0.5 * Math.sin(performance.now() * 0.016 + m.phase));
    if (m.toolPivot) {
      let target = 0; const kind = m.toolKind;
      if (kind === "bucket" || kind === "side") { if (m.acting.dig || m.acting.load) target = -0.55 - 0.18 * Math.sin(m.animT * 12); else if (m.acting.dump) target = 0.8; }
      else if (kind === "bed") target = m.acting.dump ? -1.0 : 0;
      else if (kind === "blade") target = m.acting.doze ? -0.1 + 0.05 * Math.sin(m.animT * 16) : 0;
      else if (kind === "arm") target = (m.acting.dig || m.acting.load) ? 0.5 + 0.12 * Math.sin(m.animT * 8) : 0;
      m.toolPivot.rotation.x += (target - m.toolPivot.rotation.x) * Math.min(1, dt * 10);
    }
    if (m.bedDirt) { const fill = m.bucket / def.capacity; m.bedDirt.setEnabled(fill > 0.02); m.bedDirt.scaling.y = Math.max(0.04, fill); m.bedDirt.position.y = -0.075 + 0.3 * fill; }
  }

  // ---- Controls ----
  function readKeyboard() {
    let kx = 0, ky = 0;
    if (keys["arrowleft"] || keys["a"]) kx -= 1;
    if (keys["arrowright"] || keys["d"]) kx += 1;
    if (keys["arrowup"] || keys["w"]) ky -= 1;
    if (keys["arrowdown"] || keys["s"]) ky += 1;
    if (kx || ky) { const m = Math.hypot(kx, ky); input.mx = kx / m; input.my = ky / m; } else if (!joyId) { input.mx = 0; input.my = 0; }
    input.dig = !!(keys["j"] || keys[" "]) || heldDig;
    input.dump = !!keys["k"] || heldDump;
  }
  let joyId = null, joyOX = 0, joyOY = 0; const JOY_R = 56; let joyEl, knobEl; const taps = {};
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
    const hold = (id, set) => { const el = document.getElementById(id); const on = (e) => { Sound.ensure(); set(true); if (e.cancelable) e.preventDefault(); }; const off = () => set(false); el.addEventListener("pointerdown", on); el.addEventListener("pointerup", off); el.addEventListener("pointercancel", off); el.addEventListener("pointerleave", off); };
    hold("btn-dig", (v) => (heldDig = v)); hold("btn-dump", (v) => (heldDump = v));
    window.addEventListener("pointerdown", (e) => {
      Sound.ensure(); if (isControl(e.target)) return;
      taps[e.pointerId] = { x: e.clientX, y: e.clientY, moved: false, truck: pickTruck(e.clientX, e.clientY) };
      if (joyId === null && e.clientX <= window.innerWidth * 0.62) startJoy(e.pointerId, e.clientX, e.clientY);
    });
    window.addEventListener("pointermove", (e) => { const tp = taps[e.pointerId]; if (tp && Math.hypot(e.clientX - tp.x, e.clientY - tp.y) > 10) tp.moved = true; if (e.pointerId === joyId) moveJoy(e.clientX, e.clientY); });
    const up = (e) => { const tp = taps[e.pointerId]; if (tp && !tp.moved && tp.truck && tp.truck !== active) setActive(tp.truck); delete taps[e.pointerId]; if (e.pointerId === joyId) endJoy(); };
    window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
  }
  window.addEventListener("keydown", (e) => { keys[e.key.toLowerCase()] = true; Sound.ensure(); });
  window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

  // ---- Boot ----
  seedDirt();
  buildTerrain();
  buildEnvironment();
  buildControls();
  setActive(active, true);

  let booted = false;
  engine.runRenderLoop(() => {
    const dt = Math.min(0.05, engine.getDeltaTime() / 1000);
    update(dt); scene.render();
    if (!booted) { booted = true; const splash = document.getElementById("splash"); splash.classList.add("gone"); setTimeout(() => splash.remove(), 450); document.getElementById("ui").classList.remove("hidden"); }
  });
  window.addEventListener("resize", () => engine.resize());
})();
