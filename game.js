// City Helpers — a kids' city game on Babylon.js with real Kenney (CC0)
// vehicles. Each truck does its job (fire truck → fires, garbage truck →
// garbage, …). Finish jobs to earn XP, level up, and unlock new trucks.
(function () {
  "use strict";
  const B = BABYLON;

  const SIZE = 52;            // half-extent of the drivable city
  const PLAY = 42;            // where jobs spawn
  const FACE = 0;            // Kenney models face +Z
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  function hex(n) { return new B.Color3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); }

  // Road grid lines + building obstacles (for collision).
  const RD = [-44, -22, 0, 22, 44], ROADW = 9;
  const obstacles = [];
  const lots = []; // empty block centres (off-road) reserved for fire jobs
  function blocked(x, z, sr) { for (const o of obstacles) if (Math.hypot(x - o.x, z - o.z) < o.r + sr) return true; return false; }
  function onRoad(x, z, pad) { pad = pad || 0; for (const r of RD) if (Math.abs(x - r) < ROADW / 2 + pad || Math.abs(z - r) < ROADW / 2 + pad) return true; return false; }

  const input = { mx: 0, my: 0 }; const keys = Object.create(null);
  let spraying = false, heldSpray = false, camZoom = 1;

  // ---- Engine / scene ----
  const canvas = document.getElementById("renderCanvas");
  const engine = new B.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, antialias: true }, true);
  const scene = new B.Scene(engine);
  scene.clearColor = hex(0x8fc7e6).toColor4(1);
  scene.fogMode = B.Scene.FOGMODE_EXP2; scene.fogColor = hex(0xc6e0ee); scene.fogDensity = 0.004;

  const CAM = new B.Vector3(11, 19, -16);
  const camera = new B.TargetCamera("cam", CAM.clone(), scene);
  camera.fov = 0.74; camera.minZ = 0.4; camera.maxZ = 600; scene.activeCamera = camera;
  const camLook = new B.Vector3(0, 0.5, 0);

  const hemi = new B.HemisphericLight("hemi", new B.Vector3(0.2, 1, 0.1), scene);
  hemi.intensity = 0.82; hemi.diffuse = hex(0xdfeaf4); hemi.groundColor = hex(0x6f7a66);
  const sun = new B.DirectionalLight("sun", new B.Vector3(-0.55, -1.1, -0.5), scene);
  sun.position = new B.Vector3(60, 90, 55); sun.intensity = 2.5; sun.diffuse = hex(0xfff3df);
  const shadow = new B.ShadowGenerator(2048, sun);
  shadow.useBlurExponentialShadowMap = true; shadow.blurKernel = 24; shadow.darkness = 0.6; shadow.bias = 0.002;

  const pipe = new B.DefaultRenderingPipeline("dp", true, scene, [camera]);
  pipe.fxaaEnabled = true; pipe.samples = 4; pipe.imageProcessingEnabled = true;
  pipe.imageProcessing.toneMappingEnabled = true; pipe.imageProcessing.toneMappingType = B.ImageProcessingConfiguration.TONEMAPPING_ACES;
  pipe.imageProcessing.exposure = 1.12; pipe.imageProcessing.contrast = 1.08; pipe.imageProcessing.vignetteEnabled = true; pipe.imageProcessing.vignetteWeight = 1.1;

  (function sky() {
    const tex = new B.DynamicTexture("sky", { width: 16, height: 256 }, scene, false); const ctx = tex.getContext();
    const g = ctx.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, "#3d86c9"); g.addColorStop(0.55, "#86b9e0"); g.addColorStop(1, "#d8ecf4");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 16, 256); tex.update();
    const s = B.MeshBuilder.CreateSphere("sky", { diameter: 760, segments: 10, sideOrientation: B.Mesh.BACKSIDE }, scene);
    const m = new B.StandardMaterial("skyM", scene); m.disableLighting = true; m.backFaceCulling = false; m.emissiveTexture = tex; m.diffuseColor = new B.Color3(0, 0, 0);
    s.material = m; s.infiniteDistance = true; s.isPickable = false;
  })();

  function pbr(n, rough) { const m = new B.PBRMaterial("p" + n + "_" + rough, scene); m.albedoColor = hex(n); m.metallic = 0; m.roughness = rough == null ? 0.9 : rough; m.environmentIntensity = 0.35; return m; }

  // ---- Particles ----
  function dot() { const dt = new B.DynamicTexture("dot", { width: 64, height: 64 }, scene, false); const c = dt.getContext(); const g = c.createRadialGradient(32, 32, 2, 32, 32, 30); g.addColorStop(0, "rgba(255,255,255,0.95)"); g.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = g; c.fillRect(0, 0, 64, 64); dt.update(); return dt; }
  const DOT = dot();
  const confetti = new B.ParticleSystem("conf", 300, scene); confetti.particleTexture = DOT; confetti.emitter = new B.Vector3(0, 0, 0);
  confetti.minEmitBox = new B.Vector3(-1, 0, -1); confetti.maxEmitBox = new B.Vector3(1, 0, 1);
  confetti.color1 = new B.Color4(1, 0.85, 0.2, 1); confetti.color2 = new B.Color4(0.4, 0.8, 1, 1); confetti.colorDead = new B.Color4(1, 1, 1, 0);
  confetti.minSize = 0.25; confetti.maxSize = 0.55; confetti.minLifeTime = 0.8; confetti.maxLifeTime = 1.5; confetti.emitRate = 0; confetti.gravity = new B.Vector3(0, -9, 0);
  confetti.direction1 = new B.Vector3(-3, 8, -3); confetti.direction2 = new B.Vector3(3, 12, 3); confetti.minEmitPower = 1; confetti.maxEmitPower = 2; confetti.start();
  function burst(x, y, z, n) { confetti.emitter = new B.Vector3(x, y, z); confetti.manualEmitCount = n; }

  // Water spray from the fire truck.
  const water = new B.ParticleSystem("water", 300, scene); water.particleTexture = DOT; water.emitter = new B.Vector3(0, 1, 0);
  water.color1 = new B.Color4(0.55, 0.8, 1, 0.9); water.color2 = new B.Color4(0.85, 0.95, 1, 0.85); water.colorDead = new B.Color4(0.7, 0.85, 1, 0);
  water.minSize = 0.18; water.maxSize = 0.5; water.minLifeTime = 0.3; water.maxLifeTime = 0.7; water.emitRate = 0; water.gravity = new B.Vector3(0, -6, 0);
  water.direction1 = new B.Vector3(0, 0.5, 1); water.direction2 = new B.Vector3(0, 1, 1); water.minEmitPower = 13; water.maxEmitPower = 18; water.updateSpeed = 0.02; water.start();

  // ---- Assets ----
  const CT = {};
  async function load(folder, name) { CT[name] = await B.SceneLoader.LoadAssetContainerAsync(folder + name + ".glb", "", scene); }
  function instance(name) { return CT[name].instantiateModelsToScene((n) => name + "_" + n, false).rootNodes[0]; }

  // ---- Vehicles & jobs ----
  const VEH = [
    { id: "firetruck", name: "Fire Truck", emoji: "🚒", model: "firetruck", level: 1, job: "fire", size: 4.0, speed: 11 },
    { id: "garbage", name: "Garbage Truck", emoji: "🚛", model: "garbage-truck", level: 1, job: "garbage", size: 4.2, speed: 9 },
    { id: "ambulance", name: "Ambulance", emoji: "🚑", model: "ambulance", level: 2, job: "rescue", size: 4.0, speed: 13 },
    { id: "police", name: "Police", emoji: "🚓", model: "police", level: 3, job: "crime", size: 3.8, speed: 13 },
    { id: "taxi", name: "Taxi", emoji: "🚕", model: "taxi", level: 4, job: "ride", size: 3.7, speed: 12 },
    { id: "delivery", name: "Delivery", emoji: "📦", model: "delivery", level: 5, job: "package", size: 3.9, speed: 11 },
    { id: "tow", name: "Tow Truck", emoji: "🪝", model: "truck-flat", level: 6, job: "breakdown", size: 4.0, speed: 10 },
  ];
  const JOBDEF = {
    fire: { emoji: "🔥", label: "Spray water on the fire!", color: 0xff5a22, prop: "fire" },
    garbage: { emoji: "🗑️", label: "Pick up the garbage!", color: 0x55b24a, prop: "trash" },
    rescue: { emoji: "🚑", label: "Rush to the rescue!", color: 0xff3b5c, prop: null },
    crime: { emoji: "🚨", label: "Stop the trouble!", color: 0x3b6bff, prop: null },
    ride: { emoji: "🙋", label: "Pick up the rider!", color: 0xffc107, prop: null },
    package: { emoji: "📦", label: "Deliver the package!", color: 0xb07a3a, prop: "box" },
    breakdown: { emoji: "🛠️", label: "Tow the broken car!", color: 0x8aa0b4, prop: "car" },
  };
  const vehById = (id) => VEH.find((v) => v.id === id);
  const jobToVeh = (jt) => VEH.find((v) => v.job === jt);

  // ---- Emoji billboards ----
  function emojiTex(ch) {
    const dt = new B.DynamicTexture("e" + ch, { width: 128, height: 128 }, scene, true); dt.hasAlpha = true;
    const c = dt.getContext(); c.clearRect(0, 0, 128, 128); c.font = "96px serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(ch, 64, 70); dt.update(); return dt;
  }
  const ETEX = {};
  function emojiPlane(ch, size) {
    if (!ETEX[ch]) ETEX[ch] = emojiTex(ch);
    const p = B.MeshBuilder.CreatePlane("emoji", { size: size || 2.4 }, scene);
    const m = new B.StandardMaterial("em" + ch, scene); m.diffuseTexture = ETEX[ch]; m.diffuseTexture.hasAlpha = true; m.useAlphaFromDiffuseTexture = true; m.emissiveColor = new B.Color3(1, 1, 1); m.disableLighting = true; m.backFaceCulling = false;
    p.material = m; p.billboardMode = B.Mesh.BILLBOARD_ALL_USE_POSITION ? B.Mesh.BILLBOARDMODE_ALL : 7; p.isPickable = false; return p;
  }

  // ---- City ----
  function buildCity() {
    const grass = B.MeshBuilder.CreateGround("grass", { width: 340, height: 340 }, scene);
    grass.material = pbr(0x6cae57, 1.0); grass.position.y = -0.02; grass.receiveShadows = true;
    const road = pbr(0x53585f, 0.95), span = SIZE * 2 + 30;
    for (const r of RD) {
      const h = B.MeshBuilder.CreateGround("road", { width: span, height: ROADW }, scene); h.position.set(0, 0.01, r); h.material = road; h.receiveShadows = true;
      const v = B.MeshBuilder.CreateGround("road", { width: ROADW, height: span }, scene); v.position.set(r, 0.01, 0); v.material = road; v.receiveShadows = true;
    }
    const builds = ["building-type-a", "building-type-b", "building-type-c", "building-type-d", "building-type-e", "building-type-f", "building-type-g", "building-type-h", "building-type-i"];
    const centers = [-33, -11, 11, 33]; let bi = 0;
    for (const cx of centers) for (const cz of centers) {
      if (Math.random() < 0.34) { // empty lot (park) — trees in the corners, centre clear for fire jobs
        placeModel("city", "tree-large", cx - 6, cz - 6, 4.5, Math.random() * 6);
        placeModel("city", "tree-small", cx + 6, cz + 6, 3.6, Math.random() * 6);
        lots.push({ x: cx, z: cz, used: false });
        continue;
      }
      placeModel("city", builds[bi++ % builds.length], cx, cz, 8, Math.floor(Math.random() * 4) * Math.PI / 2);
      obstacles.push({ x: cx, z: cz, r: 4.3 });
      if (Math.random() < 0.6) placeModel("city", Math.random() < 0.5 ? "tree-small" : "tree-large", cx + 6, cz + 6, 3.2, Math.random() * 6);
    }
  }
  function placeModel(folderKey, name, x, z, s, ry) {
    const root = instance(name); const holder = new B.TransformNode("env", scene); root.parent = holder;
    const { min, max } = root.getHierarchyBoundingVectors(true); const sc = s / Math.max(max.x - min.x, max.z - min.z);
    holder.scaling.setAll(sc); holder.rotation.y = (ry || 0) + FACE; holder.position.set(x, -min.y * sc, z);
    root.getChildMeshes().forEach((me) => { shadow.addShadowCaster(me); me.receiveShadows = true; me.isPickable = false; });
    return holder;
  }

  // ---- Fleet ----
  const machines = []; let active = null;
  const DEPOT = [[-18, 48], [-6, 48], [6, 48], [18, 48], [-30, 48], [30, 48], [0, 48]];
  function spawnVehicle(cfg, i) {
    const root = instance(cfg.model);
    const { min, max } = root.getHierarchyBoundingVectors(true); const s = cfg.size / Math.max(max.x - min.x, max.z - min.z);
    const holder = new B.TransformNode("veh_" + cfg.id, scene); root.parent = holder; holder.scaling.setAll(s);
    const [x, z] = DEPOT[i % DEPOT.length];
    const m = { def: cfg, x, z, heading: Math.PI, animT: Math.random() * 6, holder, yOffset: -min.y * s, wheels: [], unlocked: cfg.level <= 1 };
    root.getChildMeshes().forEach((me) => { me.truckRef = m; shadow.addShadowCaster(me); });
    m.wheels = root.getChildMeshes().filter((me) => /wheel/i.test(me.name));
    holder.position.set(x, m.yOffset, z); holder.rotation.y = m.heading + FACE;
    holder.setEnabled(m.unlocked);
    machines.push(m);
  }

  // ---- Jobs ----
  const jobs = []; const MAXJOBS = 3;
  function unlockedJobTypes() { return VEH.filter((v) => machines.find((m) => m.def.id === v.id && m.unlocked)).map((v) => v.job); }
  function farFromJobs(x, z) { for (const j of jobs) if (Math.hypot(j.x - x, j.z - z) < 12) return false; return true; }
  function spawnJob() {
    const types = unlockedJobTypes(); if (!types.length) return;
    let jt = types[(Math.random() * types.length) | 0], x, z, lot = null;
    if (jt === "fire") {
      const free = lots.filter((l) => !l.used && farFromJobs(l.x, l.z));
      if (free.length) { lot = free[(Math.random() * free.length) | 0]; x = lot.x; z = lot.z; lot.used = true; }
      else { const alt = types.filter((t) => t !== "fire"); if (!alt.length) return; jt = alt[(Math.random() * alt.length) | 0]; }
    }
    const def = JOBDEF[jt];
    if (x === undefined) { let tries = 0; do { x = (Math.random() * 2 - 1) * PLAY; z = (Math.random() * 2 - 1) * PLAY; tries++; } while ((Math.hypot(x, z) < 12 || !farFromJobs(x, z) || blocked(x, z, 3)) && tries < 40); }
    const node = new B.TransformNode("job", scene); node.position.set(x, 0, z);
    const ring = B.MeshBuilder.CreateTorus("jr", { diameter: 5, thickness: 0.35, tessellation: 26 }, scene); ring.parent = node; ring.position.y = 0.08; const rm = new B.PBRMaterial("jrm", scene); rm.albedoColor = hex(def.color); rm.emissiveColor = hex(def.color).scale(0.5); ring.material = rm; ring.isPickable = false;
    const icon = emojiPlane(def.emoji, 2.6); icon.parent = node; icon.position.y = 3.2;
    const job = { type: jt, x, z, node, ring, icon, work: 0, props: [], lot };
    node.metadata = jt;
    if (def.prop === "fire") { const fb = placeModel("city", "building-type-a", x, z, 6, Math.random() * 6); job.props.push(fb); job.fire = makeFire(x, z); job.obstacle = { x, z, r: 3.8 }; obstacles.push(job.obstacle); }
    else if (def.prop === "trash") { for (let k = 0; k < 4; k++) { const b = B.MeshBuilder.CreateBox("trash", { width: 0.8, height: 0.9, depth: 0.8 }, scene); b.position.set(x + (Math.random() * 2 - 1) * 1.4, 0.45, z + (Math.random() * 2 - 1) * 1.4); b.material = pbr(0x3f7a3a, 0.8); b.isPickable = false; shadow.addShadowCaster(b); job.props.push(b); } }
    else if (def.prop === "box") { const b = B.MeshBuilder.CreateBox("pkg", { width: 1, height: 1, depth: 1 }, scene); b.position.set(x, 0.5, z); b.material = pbr(0xb07a3a, 0.85); b.isPickable = false; shadow.addShadowCaster(b); job.props.push(b); }
    else if (def.prop === "car") { const carRoot = instance(Math.random() < 0.5 ? "sedan" : "suv"); const ch = new B.TransformNode("brk", scene); carRoot.parent = ch; const bb = carRoot.getHierarchyBoundingVectors(true); const sc = 3.6 / Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z); ch.scaling.setAll(sc); ch.position.set(x, -bb.min.y * sc, z); ch.rotation.y = Math.random() * 6; carRoot.getChildMeshes().forEach((me) => { shadow.addShadowCaster(me); me.isPickable = false; }); job.props.push(ch); }
    jobs.push(job);
  }
  function makeFire(x, z) {
    const ps = new B.ParticleSystem("fire", 120, scene); ps.particleTexture = DOT; ps.emitter = new B.Vector3(x, 1.2, z);
    ps.minEmitBox = new B.Vector3(-1, 0, -1); ps.maxEmitBox = new B.Vector3(1, 1.5, 1);
    ps.color1 = new B.Color4(1, 0.6, 0.1, 1); ps.color2 = new B.Color4(1, 0.3, 0.05, 1); ps.colorDead = new B.Color4(0.3, 0.1, 0.05, 0);
    ps.minSize = 0.8; ps.maxSize = 2.0; ps.minLifeTime = 0.3; ps.maxLifeTime = 0.7; ps.emitRate = 90; ps.gravity = new B.Vector3(0, 6, 0);
    ps.direction1 = new B.Vector3(-0.4, 2, -0.4); ps.direction2 = new B.Vector3(0.4, 4, 0.4); ps.minEmitPower = 0.5; ps.maxEmitPower = 1.5; ps.blendMode = B.ParticleSystem.BLENDMODE_ADD; ps.start(); return ps;
  }
  function completeJob(job) {
    burst(job.x, 2, job.z, 90); Sound.ding(); setTimeout(() => Sound.horn(), 200);
    if (job.fire) job.fire.dispose();
    if (job.lot) job.lot.used = false;
    if (job.obstacle) { const oi = obstacles.indexOf(job.obstacle); if (oi >= 0) obstacles.splice(oi, 1); }
    job.props.forEach((p) => p.dispose()); job.ring.dispose(); job.icon.dispose(); job.node.dispose();
    const idx = jobs.indexOf(job); if (idx >= 0) jobs.splice(idx, 1);
    addXp();
    spawnJob();
  }

  // ---- Leveling ----
  let level = 1, xp = 0, done = 0;
  function xpNeeded(l) { return l + 2; }
  function addXp() {
    xp++; done++; document.getElementById("done").textContent = "✅ " + done;
    if (xp >= xpNeeded(level)) { xp = 0; level++; document.getElementById("level").textContent = "Lvl " + level; unlockForLevel(); }
    document.getElementById("xp-fill").style.width = clamp((xp / xpNeeded(level)) * 100, 0, 100) + "%";
  }
  function unlockForLevel() {
    const nv = VEH.find((v) => v.level === level);
    const m = nv && machines.find((mm) => mm.def.id === nv.id);
    if (m && !m.unlocked) {
      m.unlocked = true; m.holder.setEnabled(true);
      const [x, z] = DEPOT[machines.indexOf(m) % DEPOT.length]; m.x = x; m.z = z;
      popup("Level " + level + "! " + nv.emoji + "\n" + nv.name + " unlocked!\nFind it and tap to drive!");
    } else popup("Level " + level + "! 🎉");
  }
  function popup(txt) { const el = document.getElementById("cheer"); el.innerHTML = txt.replace(/\n/g, "<br>"); el.classList.add("show"); cheerT = 2.6; }
  let cheerT = 0;

  // ---- Guiding arrow ----
  let arrow;
  function makeArrow() { arrow = B.MeshBuilder.CreateCylinder("arrow", { diameterTop: 0, diameterBottom: 1.3, height: 1.5, tessellation: 6 }, scene); arrow.rotation.x = Math.PI; const am = new B.PBRMaterial("am", scene); am.albedoColor = hex(0xffe24a); am.emissiveColor = hex(0x7a5d00); arrow.material = am; arrow.isPickable = false; arrow.setEnabled(false); }

  // ---- Controls / select ----
  function setActive(m) {
    if (!m.unlocked) { popup("Reach Level " + m.def.level + "\nto unlock " + m.def.name + "!"); return; }
    active = m; document.getElementById("machine-label").textContent = m.def.name;
    document.querySelectorAll(".machine-btn").forEach((b) => b.classList.toggle("active", b.dataset.id === m.def.id));
    Sound.horn();
  }
  function buildPicker() {
    const picker = document.getElementById("machine-picker"); picker.innerHTML = "";
    VEH.forEach((cfg) => {
      const m = machines.find((mm) => mm.def.id === cfg.id);
      const b = document.createElement("button"); b.type = "button"; b.className = "machine-btn" + (m && m.unlocked ? "" : " locked"); b.dataset.id = cfg.id;
      b.innerHTML = `<span class="ico">${cfg.emoji}</span><span>${cfg.name}</span>` + (m && m.unlocked ? "" : `<span class="lock">🔒 Lv ${cfg.level}</span>`);
      if (active && active.def.id === cfg.id) b.classList.add("active");
      b.addEventListener("click", () => { const mm = machines.find((x) => x.def.id === cfg.id); if (mm) setActive(mm); });
      picker.appendChild(b);
    });
  }

  const camFwd = new B.Vector3(-CAM.x, 0, -CAM.z).normalize();
  const camRight = new B.Vector3(camFwd.z, 0, -camFwd.x);
  function nearestJobFor(m) { let best = null, bd = 1e9; for (const j of jobs) { if (jobToVeh(j.type).id !== m.def.id) continue; const d = Math.hypot(j.x - m.x, j.z - m.z); if (d < bd) { bd = d; best = j; } } return best; }
  function nearestJobAny(m) { let best = null, bd = 1e9; for (const j of jobs) { const d = Math.hypot(j.x - m.x, j.z - m.z); if (d < bd) { bd = d; best = j; } } return best; }

  function update(dt) {
    const m = active, def = m.def;
    readKeyboard();
    const mag = Math.hypot(input.mx, input.my);
    water.emitRate = 0;
    if (mag > 0.08) {
      const dx = camRight.x * input.mx + camFwd.x * (-input.my), dz = camRight.z * input.mx + camFwd.z * (-input.my), len = Math.hypot(dx, dz) || 1;
      const vx = (dx / len) * mag * def.speed * dt, vz = (dz / len) * mag * def.speed * dt, R = 1.7;
      const nx = clamp(m.x + vx, -SIZE, SIZE); if (!blocked(nx, m.z, R)) m.x = nx;
      const nz = clamp(m.z + vz, -SIZE, SIZE); if (!blocked(m.x, nz, R)) m.z = nz;
      const tg = Math.atan2(dx, dz); let d = tg - m.heading; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; m.heading += d * 0.25;
    }
    // Spray water from the front while SPRAY is held — aim at a nearby fire if there is one.
    if (spraying) {
      const ex = m.x + Math.sin(m.heading) * 1.8, ez = m.z + Math.cos(m.heading) * 1.8;
      let tx = m.x + Math.sin(m.heading) * 8, tz = m.z + Math.cos(m.heading) * 8;
      for (const j of jobs) if (j.type === "fire" && Math.hypot(j.x - m.x, j.z - m.z) < 11) { tx = j.x; tz = j.z; break; }
      const ddx = tx - ex, ddz = tz - ez, dl = Math.hypot(ddx, ddz) || 1;
      water.emitter.set(ex, 1.6, ez);
      water.direction1.set(ddx / dl - 0.18, 0.45, ddz / dl - 0.18);
      water.direction2.set(ddx / dl + 0.18, 0.85, ddz / dl + 0.18);
      water.emitRate = 260;
    }
    // animate all vehicles (wheels spin only for active)
    for (const mm of machines) { if (!mm.unlocked) continue; mm.holder.position.set(mm.x, mm.yOffset, mm.z); mm.holder.rotation.y = mm.heading + FACE; const sp = (mm === m ? mag : 0) * mm.def.speed * dt * 1.1; for (const w of mm.wheels) w.rotation.x += sp; }

    // job markers bob + work when the right truck is close
    let myJob = nearestJobFor(m), nearAny = nearestJobAny(m), prog = 0;
    for (const j of jobs) { j.icon.position.y = 3.2 + Math.sin(performance.now() * 0.004 + j.x) * 0.25; j.ring.rotation.y += dt * 0.6; }
    if (myJob) {
      const dist = Math.hypot(myJob.x - m.x, myJob.z - m.z);
      const reach = myJob.type === "fire" ? 7.5 : 4.2; // fire has a solid building, so spray from farther
      if (dist < reach) {
        const canWork = myJob.type !== "fire" || spraying; // fires need water!
        if (canWork) {
          myJob.work += dt;
          if (myJob.type === "trash") myJob.props.forEach((p) => p.scaling.setAll(Math.max(0.02, 1 - clamp(myJob.work / 1.4, 0, 1))));
          if (myJob.work >= 1.4) { completeJob(myJob); myJob = null; }
        }
        if (myJob) { prog = clamp(myJob.work / 1.4, 0, 1); if (myJob.fire) myJob.fire.emitRate = 90 * (1 - prog); }
      } else myJob.work = Math.max(0, myJob.work - dt);
    }
    document.getElementById("goal-fill").style.width = (prog * 100) + "%";

    // task banner
    const banner = document.getElementById("goal-text");
    if (myJob) banner.textContent = JOBDEF[myJob.type].emoji + " " + JOBDEF[myJob.type].label;
    else if (nearAny) { const v = jobToVeh(nearAny.type); banner.textContent = JOBDEF[nearAny.type].emoji + " " + (v.id === def.id ? JOBDEF[nearAny.type].label : "Switch to the " + v.name + " " + v.emoji); }
    else banner.textContent = "Find a job in the city!";

    // arrow to my nearest job (or to nearest job overall if none match)
    const target = myJob || (nearAny && jobToVeh(nearAny.type).id === def.id ? nearAny : null);
    if (arrow) { if (target) { arrow.setEnabled(true); arrow.position.set(target.x, 4 + Math.sin(performance.now() * 0.005) * 0.25, target.z); } else arrow.setEnabled(false); }

    // camera
    const k = Math.min(1, dt * 5);
    camera.position.x += (m.x + CAM.x * camZoom - camera.position.x) * k; camera.position.y += (CAM.y * camZoom - camera.position.y) * k; camera.position.z += (m.z + CAM.z * camZoom - camera.position.z) * k;
    camLook.x += (m.x - camLook.x) * k; camLook.z += (m.z - camLook.z) * k; camLook.y = 0.6; camera.setTarget(camLook);

    Sound.engine(mag);
    if (cheerT > 0) { cheerT -= dt; if (cheerT <= 0) document.getElementById("cheer").classList.remove("show"); }
    while (jobs.length < MAXJOBS) { const before = jobs.length; spawnJob(); if (jobs.length === before) break; }
  }

  function readKeyboard() {
    let kx = 0, ky = 0;
    if (keys["arrowleft"] || keys["a"]) kx -= 1; if (keys["arrowright"] || keys["d"]) kx += 1;
    if (keys["arrowup"] || keys["w"]) ky -= 1; if (keys["arrowdown"] || keys["s"]) ky += 1;
    if (kx || ky) { const mm = Math.hypot(kx, ky); input.mx = kx / mm; input.my = ky / mm; } else if (!joyId) { input.mx = 0; input.my = 0; }
    spraying = heldSpray || !!keys[" "] || !!keys["j"];
  }
  let joyId = null, joyOX = 0, joyOY = 0; const JR = 56; let joyEl, knobEl; const taps = {};
  const pointers = {}; let pinchDist = 0;
  function startJoy(id, x, y) { joyId = id; joyOX = x; joyOY = y; joyEl.style.left = (x - 66) + "px"; joyEl.style.top = (y - 66) + "px"; joyEl.classList.add("active"); moveJoy(x, y); }
  function moveJoy(x, y) { let dx = x - joyOX, dy = y - joyOY; const d = Math.hypot(dx, dy); if (d > JR) { dx = dx / d * JR; dy = dy / d * JR; } knobEl.style.transform = `translate(${dx}px, ${dy}px)`; input.mx = dx / JR; input.my = dy / JR; }
  function endJoy() { joyId = null; joyEl.classList.remove("active"); knobEl.style.transform = "translate(0,0)"; input.mx = 0; input.my = 0; }
  function isCtl(t) { return t && t.closest && t.closest("button, .machine-picker, .action-buttons, .hud, .goal, .topstat"); }
  function pickTruck(x, y) { const p = scene.pick(x, y); let n = p && p.pickedMesh; while (n) { if (n.truckRef) return n.truckRef; n = n.parent; } return null; }
  function buildControls() {
    joyEl = document.getElementById("joystick"); knobEl = document.getElementById("joystick-knob");
    document.getElementById("btn-mute").addEventListener("click", (e) => { Sound.ensure(); e.currentTarget.textContent = Sound.toggleMute() ? "🔇" : "🔊"; });
    const sprayBtn = document.getElementById("btn-spray");
    const sOn = (e) => { Sound.ensure(); heldSpray = true; if (e.cancelable) e.preventDefault(); };
    const sOff = () => { heldSpray = false; };
    sprayBtn.addEventListener("pointerdown", sOn); sprayBtn.addEventListener("pointerup", sOff); sprayBtn.addEventListener("pointercancel", sOff); sprayBtn.addEventListener("pointerleave", sOff);

    function pinchOf() { const ids = Object.keys(pointers); if (ids.length < 2) return 0; const a = pointers[ids[0]], b = pointers[ids[1]]; return Math.hypot(a.x - b.x, a.y - b.y); }
    window.addEventListener("pointerdown", (e) => {
      Sound.ensure(); if (isCtl(e.target)) return;
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (Object.keys(pointers).length >= 2) { if (joyId !== null) endJoy(); pinchDist = pinchOf(); for (const id in taps) taps[id].moved = true; return; }
      taps[e.pointerId] = { x: e.clientX, y: e.clientY, moved: false, truck: pickTruck(e.clientX, e.clientY) };
      if (joyId === null && e.clientX <= window.innerWidth * 0.62) startJoy(e.pointerId, e.clientX, e.clientY);
    });
    window.addEventListener("pointermove", (e) => {
      if (pointers[e.pointerId]) { pointers[e.pointerId].x = e.clientX; pointers[e.pointerId].y = e.clientY; }
      if (Object.keys(pointers).length >= 2) { const d = pinchOf(); if (pinchDist && d) { camZoom = clamp(camZoom * (pinchDist / d), 0.55, 3.2); } pinchDist = d; return; }
      const tp = taps[e.pointerId]; if (tp && Math.hypot(e.clientX - tp.x, e.clientY - tp.y) > 10) tp.moved = true;
      if (e.pointerId === joyId) moveJoy(e.clientX, e.clientY);
    });
    const up = (e) => { delete pointers[e.pointerId]; pinchDist = 0; const tp = taps[e.pointerId]; if (tp && !tp.moved && tp.truck) setActive(tp.truck); delete taps[e.pointerId]; if (e.pointerId === joyId) endJoy(); };
    window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
    window.addEventListener("wheel", (e) => { camZoom = clamp(camZoom * (1 + Math.sign(e.deltaY) * 0.12), 0.55, 3.2); }, { passive: true });
  }
  window.addEventListener("keydown", (e) => { keys[e.key.toLowerCase()] = true; Sound.ensure(); });
  window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

  // ---- Boot ----
  (async function boot() {
    const tip = document.querySelector(".splash-tip");
    try {
      tip && (tip.textContent = "Loading the city…");
      await Promise.all(VEH.map((v) => load("assets/models/", v.model)));
      await Promise.all(["sedan", "suv"].map((n) => load("assets/models/", n)));
      const cityModels = ["building-type-a", "building-type-b", "building-type-c", "building-type-d", "building-type-e", "building-type-f", "building-type-g", "building-type-h", "building-type-i", "tree-large", "tree-small"];
      await Promise.all(cityModels.map((n) => load("assets/city/", n)));
      buildCity();
      VEH.forEach(spawnVehicle);
      active = machines.find((m) => m.def.id === "firetruck") || machines[0];
      camera.position.set(active.x + CAM.x, CAM.y, active.z + CAM.z); camLook.set(active.x, 0.6, active.z);
      makeArrow(); buildControls(); setActive(active);
      document.getElementById("xp-fill").style.width = (xp / xpNeeded(level) * 100) + "%";
      for (let i = 0; i < MAXJOBS; i++) spawnJob();
    } catch (e) { tip && (tip.textContent = "Failed to load: " + e); console.error(e); return; }
    const splash = document.getElementById("splash"); splash.classList.add("gone"); setTimeout(() => splash.remove(), 450);
    document.getElementById("ui").classList.remove("hidden");
    engine.runRenderLoop(() => { const dt = Math.min(0.05, engine.getDeltaTime() / 1000); update(dt); scene.render(); });
    window.addEventListener("resize", () => engine.resize());
  })();
})();
