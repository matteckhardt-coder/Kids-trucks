// Dirt Diggers — a cartoon construction game built on Phaser 3.
// Drive chunky machines around a dirt yard and push / dig / dump dirt.
(function () {
  "use strict";

  // ---- World / grid ----
  const TILE = 48;
  const COLS = 32;
  const ROWS = 22;
  const WORLD_W = COLS * TILE; // 1536
  const WORLD_H = ROWS * TILE; // 1056
  const MAX_DIRT = 6;

  const OUTLINE = 0x2a2018;
  const WINDOW = 0xbfe8f6;
  // Filled at boot: per-machine layout info (e.g. beacon position) for animation.
  const MACHINE_BUILD = {};

  // ---- Dirt field ----
  const dirt = new Float32Array(COLS * ROWS);
  const di = (c, r) => r * COLS + c;
  const inBounds = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  function seedDirt() {
    // Flat ground is height 0; only real mounds (and dug holes) are drawn.
    for (let i = 0; i < dirt.length; i++) dirt[i] = 0;
    const mounds = [
      [7, 6, 3.5, 4], [24, 7, 3, 4.2], [16, 15, 4.4, 4.8],
      [27, 17, 2.6, 3.4], [6, 17, 2.8, 3.4], [20, 4, 2.4, 3],
    ];
    for (const [mc, mr, rad, peak] of mounds) {
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          const d = Math.hypot(c - mc, r - mr);
          if (d < rad) dirt[di(c, r)] = clamp(dirt[di(c, r)] + peak * (1 - d / rad), -4, MAX_DIRT);
        }
    }
  }

  // ---- Colour helpers ----
  function lerpColor(a, b, t) {
    const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    const r = (ar + (br - ar) * t) | 0, g = (ag + (bg - ag) * t) | 0, bl = (ab + (bb - ab) * t) | 0;
    return (r << 16) | (g << 8) | bl;
  }
  const darken = (hex, t) => lerpColor(hex, 0x000000, t);

  // ---- Shared input state ----
  const input = { mx: 0, my: 0, dig: false, dump: false };
  let heldDig = false, heldDump = false;

  // =========================================================================
  // Boot scene — generate every texture procedurally (no image files).
  // =========================================================================
  class BootScene extends Phaser.Scene {
    constructor() { super("Boot"); }

    create() {
      this.makeGround();
      this.makeBlobs();
      this.makeShadow();
      this.makeProps();
      TRUCKS.forEach((def) => this.makeMachine(def));
      this.scene.start("Game");
    }

    g() { return this.make.graphics({ x: 0, y: 0, add: false }); }

    box(g, x, y, w, h, r, fill, lw = 5, outline = OUTLINE) {
      g.fillStyle(fill, 1); g.fillRoundedRect(x, y, w, h, r);
      if (lw) { g.lineStyle(lw, outline, 1); g.strokeRoundedRect(x, y, w, h, r); }
    }
    circle(g, x, y, r, fill, lw = 5, outline = OUTLINE) {
      g.fillStyle(fill, 1); g.fillCircle(x, y, r);
      if (lw) { g.lineStyle(lw, outline, 1); g.strokeCircle(x, y, r); }
    }
    seg(g, x1, y1, x2, y2, w, color) {
      g.lineStyle(w, color, 1); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokePath();
    }

    makeGround() {
      const g = this.g();
      g.fillStyle(0xccb387, 1); g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 240; i++) {
        const x = Math.random() * 128, y = Math.random() * 128, s = 1 + Math.random() * 2.5;
        g.fillStyle(Math.random() < 0.5 ? 0xc0a474 : 0xd6c096, 0.5);
        g.fillRect(x, y, s, s);
      }
      // A few faint tyre tracks for character.
      g.fillStyle(0xbfa06f, 0.35);
      for (let i = 0; i < 3; i++) { const y = 20 + i * 40; g.fillRect(0, y, 128, 3); g.fillRect(0, y + 7, 128, 3); }
      g.generateTexture("ground", 128, 128); g.destroy();
    }

    makeBlobs() {
      // Soft dust puff.
      let g = this.g();
      for (let i = 6; i >= 1; i--) { g.fillStyle(0xffffff, 0.16); g.fillCircle(16, 16, i * 2.4); }
      g.generateTexture("dust", 32, 32); g.destroy();
      // Flying dirt clod.
      g = this.g();
      this.circle(g, 7, 7, 5, 0x7a5230, 2);
      g.generateTexture("clod", 14, 14); g.destroy();
      // Sparkle.
      g = this.g();
      g.fillStyle(0xffffff, 1); g.fillCircle(8, 8, 5);
      g.fillStyle(0xffffff, 0.5); g.fillCircle(8, 8, 8);
      g.generateTexture("spark", 16, 16); g.destroy();
      // Flashing beacon light.
      g = this.g();
      g.fillStyle(0xfff3b0, 0.55); g.fillCircle(9, 9, 9);
      g.fillStyle(0xffd84a, 1); g.fillCircle(9, 9, 5);
      g.generateTexture("beacon", 18, 18); g.destroy();
    }

    makeShadow() {
      const g = this.g();
      g.fillStyle(0x000000, 0.22); g.fillEllipse(45, 14, 86, 26);
      g.generateTexture("shadow", 90, 28); g.destroy();
    }

    makeProps() {
      // Traffic cone.
      let g = this.g();
      g.fillStyle(0x3a3a3a, 1); g.fillRoundedRect(2, 24, 24, 6, 3);
      g.fillStyle(0xff7a1a, 1);
      g.beginPath(); g.moveTo(14, 2); g.lineTo(24, 26); g.lineTo(4, 26); g.closePath(); g.fillPath();
      g.lineStyle(3, OUTLINE, 1); g.strokePath();
      g.fillStyle(0xffffff, 1); g.fillRect(8, 14, 12, 4);
      g.generateTexture("cone", 28, 32); g.destroy();
      // Little tree / bush.
      g = this.g();
      g.fillStyle(0x7a5230, 1); g.fillRoundedRect(20, 34, 8, 14, 3);
      this.circle(g, 24, 22, 16, 0x5bb45b, 4);
      this.circle(g, 14, 28, 10, 0x69c269, 4);
      this.circle(g, 34, 28, 10, 0x69c269, 4);
      g.generateTexture("tree", 50, 50); g.destroy();
    }

    // ---- Chunky cartoon machine, facing right (+x) ----
    makeMachine(def) {
      const g = this.g();
      const shape = def.shape || {};
      const color = def.color, accent = def.accent, arm = darken(accent, 0.25);

      // Boom arm out the back (backhoe) — drawn behind the body.
      if (shape.armBack) {
        this.seg(g, 32, 30, 16, 16, 11, arm);
        this.seg(g, 16, 16, 11, 40, 11, arm);
        this.box(g, 4, 36, 16, 13, 3, accent, 4);
      }

      // Wheels / tracks (behind the body).
      if (shape.tracks) {
        this.box(g, 20, 47, 84, 17, 8, 0x33302b, 4);
        g.fillStyle(0x57524a, 1);
        for (let i = 0; i < 8; i++) g.fillRoundedRect(25 + i * 10, 51, 6, 9, 2);
      } else {
        const tire = 0x2c2a28, hub = 0x6f6a63;
        let wheels;
        if (shape.wheels === "twin") wheels = [[34, 57, 11], [49, 57, 11], [88, 57, 11]];
        else if (shape.wheels === "small") wheels = [[40, 56, 10], [82, 56, 10]];
        else wheels = [[41, 57, 13], [86, 57, 13]];
        for (const [wx, wy, wr] of wheels) { this.circle(g, wx, wy, wr, tire); this.circle(g, wx, wy, wr * 0.42, hub, 3); }
      }

      // Dump bed (drawn before cab so the cab sits in front).
      if (shape.bedBack) {
        this.box(g, 16, 12, 52, 32, 6, accent);
        g.lineStyle(3, darken(accent, 0.3), 1);
        for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(16 + i * 13, 14); g.lineTo(16 + i * 13, 42); g.strokePath(); }
      }

      // Chassis body.
      this.box(g, 24, 24, 72, 30, 9, color);

      // Cab + window.
      if (shape.bedBack) {
        this.box(g, 72, 16, 22, 30, 6, accent);
        this.box(g, 75, 20, 16, 13, 3, WINDOW, 3);
      } else {
        this.box(g, 30, 15, 25, 27, 6, accent);
        this.box(g, 34, 19, 17, 13, 3, WINDOW, 3);
      }

      // Front tools.
      if (shape.bladeFront) {
        this.seg(g, 92, 40, 105, 40, 9, 0x6f6a63);
        this.box(g, 104, 10, 10, 54, 4, accent);
      }
      if (shape.bucketFront) {
        this.seg(g, 90, 34, 105, 46, 9, 0x6f6a63);
        this.box(g, 101, 40, 19, 21, 5, accent);
        g.fillStyle(0x3a2f22, 1); g.fillRoundedRect(116, 41, 5, 19, 2);
      }
      if (shape.sideBucket) {
        this.box(g, 30, 55, 62, 13, 5, accent);
        g.fillStyle(0x3a2f22, 1); g.fillRoundedRect(30, 64, 62, 5, 2);
      }

      // Details: beacon light + exhaust.
      const lx = shape.bedBack ? 83 : 43, ly = shape.bedBack ? 13 : 12;
      this.circle(g, lx, ly, 4, 0xffd84a, 3);
      g.fillStyle(0x3a352e, 1); g.fillRoundedRect(shape.bedBack ? 69 : 58, 7, 5, 12, 2);

      // Remember the beacon spot (texture is 126x74, drawn from centre) for the flashing overlay.
      MACHINE_BUILD[def.id] = { beacon: [lx - 63, ly - 37] };

      g.generateTexture("machine_" + def.id, 126, 74);
      g.destroy();
    }
  }

  // =========================================================================
  // Game scene
  // =========================================================================
  class GameScene extends Phaser.Scene {
    constructor() { super("Game"); }

    create() {
      this.def = TRUCKS[0];
      this.px = WORLD_W / 2; this.py = WORLD_H - 140;
      this.bucket = 0;
      this.dirtDirty = true;
      this.acting = { dig: false, dump: false, load: false, doze: false };
      this.lastDust = 0; this.lastDigPuff = 0; this.snd = { dig: 0, dump: 0, beep: 0 }; this.wasFull = false;
      this.heading = -Math.PI / 2; this.animT = 0; this.popT = 0; this.baseScale = 0.92;

      // Ground + dirt + decorations.
      this.add.tileSprite(0, 0, WORLD_W, WORLD_H, "ground").setOrigin(0).setDepth(0);
      const border = this.add.graphics().setDepth(0.5);
      border.lineStyle(14, 0x6f5631, 1).strokeRect(0, 0, WORLD_W, WORLD_H);
      this.dirtGfx = this.add.graphics().setDepth(1);

      const props = [[80, 80, "cone"], [WORLD_W - 80, 90, "cone"], [90, WORLD_H - 90, "tree"],
        [WORLD_W - 100, WORLD_H - 100, "tree"], [WORLD_W / 2, 70, "cone"], [70, WORLD_H / 2, "tree"]];
      props.forEach(([x, y, t]) => this.add.image(x, y, t).setDepth(2));

      // Particles.
      this.dust = this.add.particles(0, 0, "dust", {
        speed: { min: 10, max: 55 }, angle: { min: 0, max: 360 },
        scale: { start: 0.7, end: 0 }, alpha: { start: 0.5, end: 0 },
        lifespan: 430, tint: 0x9c7c4a, frequency: -1, emitting: false,
      }).setDepth(3);
      this.clods = this.add.particles(0, 0, "clod", {
        speed: { min: 70, max: 170 }, angle: { min: 200, max: 340 }, gravityY: 520,
        scale: { start: 0.95, end: 0.5 }, lifespan: 600, frequency: -1, emitting: false,
      }).setDepth(7);
      this.spark = this.add.particles(0, 0, "spark", {
        speed: { min: 50, max: 130 }, scale: { start: 1, end: 0 }, alpha: { start: 1, end: 0 },
        lifespan: 520, tint: 0xffe27a, frequency: -1, emitting: false,
      }).setDepth(8);

      // Player: a container (the "rig") holding the machine sprite + a flashing
      // beacon, so it can chug and squash without disturbing the follow camera.
      this.shadow = this.add.image(this.px, this.py + 16, "shadow").setDepth(4);
      this.machine = this.add.image(0, 0, "machine_" + this.def.id);
      this.beacon = this.add.image(0, 0, "beacon");
      this.rig = this.add.container(this.px, this.py, [this.machine, this.beacon]).setDepth(5);
      this.rig.setScale(this.baseScale);
      this.rig.rotation = this.heading;

      this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
      this.cameras.main.setBackgroundColor(0x7fb4cb);
      this.cameras.main.startFollow(this.rig, true, 0.12, 0.12);
      this.cameras.main.setZoom(this.pickZoom());
      this.scale.on("resize", () => this.cameras.main.setZoom(this.pickZoom()));

      currentScene = this;
      buildControls();
      this.setMachine(this.def, true);

      // Reveal: hide splash, show UI.
      const splash = document.getElementById("splash");
      splash.classList.add("gone");
      setTimeout(() => splash.remove(), 450);
      document.getElementById("ui").classList.remove("hidden");
    }

    pickZoom() {
      // Show a comfortable slice of the yard on any screen.
      const w = this.scale.gameSize.width, h = this.scale.gameSize.height;
      return clamp(Math.min(w / 430, h / 430), 0.9, 1.9);
    }

    setMachine(def, silent) {
      this.def = def;
      this.bucket = Math.min(this.bucket, def.capacity);
      this.machine.setTexture("machine_" + def.id);
      const b = (MACHINE_BUILD[def.id] || {}).beacon || [-20, -25];
      this.beacon.setPosition(b[0], b[1]);
      document.getElementById("machine-label").textContent = def.name;
      document.querySelectorAll(".machine-btn").forEach((bn) =>
        bn.classList.toggle("active", bn.dataset.id === def.id));
      document.getElementById("btn-dig").classList.toggle("off", def.dig === false);
      document.getElementById("btn-dump").classList.toggle("off", def.dump === false);
      this.popT = 1; // grow-pop on switch
      if (!silent) Sound.horn();
    }

    levelYard() {
      for (let i = 0; i < dirt.length; i++) dirt[i] = 0;
      this.bucket = 0; this.dirtDirty = true;
    }

    tileFront(reach, angOff) {
      const a = this.heading + (angOff || 0);
      const x = this.px + Math.cos(a) * reach, y = this.py + Math.sin(a) * reach;
      return { c: Math.floor(x / TILE), r: Math.floor(y / TILE), x, y };
    }
    toolTile() { return this.def.scoop === "side" ? this.tileFront(34, Math.PI / 2) : this.tileFront(40, 0); }

    update(time, delta) {
      const dt = Math.min(0.05, delta / 1000);
      const def = this.def;
      this.acting.dig = this.acting.dump = this.acting.load = this.acting.doze = false;

      // Combine keyboard + on-screen input.
      readKeyboard();
      input.dig = heldDig || input.dig;
      input.dump = heldDump || input.dump;

      // Drive.
      const mag = Math.hypot(input.mx, input.my);
      if (mag > 0.08) {
        this.px = clamp(this.px + input.mx * def.speed * dt, 18, WORLD_W - 18);
        this.py = clamp(this.py + input.my * def.speed * dt, 18, WORLD_H - 18);
        const target = Math.atan2(input.my, input.mx);
        this.heading = Phaser.Math.Angle.RotateTo(this.heading, target, 0.28);
        if (time - this.lastDust > 40) {
          const back = this.tileFront(-26, 0);
          this.dust.emitParticleAt(back.x + (Math.random() - 0.5) * 12, back.y + (Math.random() - 0.5) * 12, 1);
          this.lastDust = time;
        }
      }
      this.rig.setPosition(this.px, this.py);
      this.shadow.setPosition(this.px, this.py + 16);

      // Bulldozer push.
      if (def.dozer && mag > 0.2) {
        const blade = this.tileFront(34, 0), ahead = this.tileFront(34 + TILE, 0);
        if (inBounds(blade.c, blade.r) && inBounds(ahead.c, ahead.r)) {
          const bi = di(blade.c, blade.r), ai = di(ahead.c, ahead.r);
          if (dirt[bi] > 0) {
            const moved = Math.min(dirt[bi], 5 * dt * mag, MAX_DIRT - dirt[ai]);
            if (moved > 0) { dirt[bi] -= moved; dirt[ai] += moved; this.dirtDirty = true; this.acting.doze = true; }
          }
        }
      }

      // Dump truck drive-over loading.
      if (def.scoop === "driveover" && mag > 0.2 && this.bucket < def.capacity) {
        const c = Math.floor(this.px / TILE), r = Math.floor(this.py / TILE);
        if (inBounds(c, r) && dirt[di(c, r)] > 0.3) {
          const i = di(c, r), want = Math.min((def.loadRate || def.digRate) * dt, def.capacity - this.bucket, dirt[i]);
          if (want > 0) { dirt[i] -= want; this.bucket += want; this.acting.load = true; this.dirtDirty = true; }
        }
      }

      // DIG.
      if (input.dig && def.dig !== false && this.bucket < def.capacity) {
        const t = this.toolTile();
        if (inBounds(t.c, t.r)) {
          const i = di(t.c, t.r), floorD = def.digMin != null ? def.digMin : -2;
          const want = Math.min(def.digRate * dt, def.capacity - this.bucket, dirt[i] - floorD);
          if (want > 0.0001) { dirt[i] -= want; this.bucket += want; this.acting.dig = true; this.dirtDirty = true; }
        }
      }

      // DUMP.
      if (input.dump && def.dump !== false && this.bucket > 0) {
        const t = this.toolTile();
        if (inBounds(t.c, t.r)) {
          if (def.spread) {
            const cells = [[t.c, t.r], [t.c + 1, t.r], [t.c - 1, t.r], [t.c, t.r + 1], [t.c, t.r - 1]]
              .filter(([c, r]) => inBounds(c, r));
            let placed = 0; const per = (def.digRate * dt) / cells.length;
            for (const [c, r] of cells) { const i = di(c, r), give = Math.min(per, MAX_DIRT - dirt[i]); if (give > 0) { dirt[i] += give; placed += give; } }
            placed = Math.min(placed, this.bucket);
            if (placed > 0) { this.bucket -= placed; this.acting.dump = true; this.dirtDirty = true; }
          } else {
            const i = di(t.c, t.r), give = Math.min(def.digRate * dt, this.bucket, MAX_DIRT - dirt[i]);
            if (give > 0.0001) { dirt[i] += give; this.bucket -= give; this.acting.dump = true; this.dirtDirty = true; }
          }
          if (this.acting.dump && Math.random() < 0.4) this.clods.emitParticleAt(t.x, t.y, 2);
        }
      }

      if (this.dirtDirty) { this.redrawDirt(); this.dirtDirty = false; }
      this.animateRig(time, dt, mag);
      this.audioStep(dt, mag);

      // HUD bucket meter + full sparkle.
      const pct = def.capacity ? (this.bucket / def.capacity) * 100 : 0;
      document.getElementById("bucket-fill").style.width = clamp(pct, 0, 100) + "%";
      const full = this.bucket >= def.capacity - 0.02;
      if (full && !this.wasFull) this.spark.emitParticleAt(this.px, this.py, 10);
      this.wasFull = full;
    }

    animateRig(time, dt, mag) {
      const driving = mag > 0.1;
      const working = this.acting.dig || this.acting.dump || this.acting.load || this.acting.doze;

      // Chug faster while driving, fastest while working, slow idle otherwise.
      const rate = working ? 17 : driving ? 9 + mag * 7 : 3.2;
      this.animT += dt * rate;
      const s = Math.sin(this.animT);

      // Grow-pop after switching machines.
      this.popT = Math.max(0, this.popT - dt * 3.5);
      const base = this.baseScale * (1 + 0.3 * this.popT * this.popT);

      // Squash & stretch (chug); a touch more when driving or working.
      const chug = working ? 0.07 : driving ? 0.05 : 0.013;
      this.rig.scaleX = base * (1 + chug * s);
      this.rig.scaleY = base * (1 - chug * s);

      // Little working shimmy on top of the heading.
      const wob = working ? 0.055 : 0;
      this.rig.rotation = this.heading + wob * Math.sin(this.animT * 2.3);

      // Flashing beacon.
      const f = 0.5 + 0.5 * Math.sin(time * 0.016);
      this.beacon.setAlpha(0.2 + 0.8 * f).setScale(0.85 + 0.3 * f);

      // Puffs of dirt while digging.
      if (this.acting.dig && time - this.lastDigPuff > 70) {
        const t = this.toolTile();
        this.dust.emitParticleAt(t.x, t.y, 1);
        if (Math.random() < 0.5) this.clods.emitParticleAt(t.x, t.y, 1);
        this.lastDigPuff = time;
      }
    }

    audioStep(dt, mag) {
      Sound.engine(mag);
      this.snd.dig -= dt; this.snd.dump -= dt; this.snd.beep -= dt;
      if ((this.acting.dig || this.acting.load) && this.snd.dig <= 0) { Sound.dig(); this.snd.dig = 0.11; }
      if (this.acting.dump && this.snd.dump <= 0) { Sound.dump(); this.snd.dump = 0.14; }
      const full = this.bucket >= this.def.capacity - 0.02;
      if (full && !this.wasFull) Sound.ding();
      if (this.def.scoop === "driveover" && mag > 0.25 && this.snd.beep <= 0) { Sound.beep(); this.snd.beep = 0.6; }
    }

    redrawDirt() {
      const g = this.dirtGfx; g.clear();
      // Holes first (so pile blobs overlap cleanly on top), then contact shadows, then piles.
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const h = dirt[di(c, r)];
        if (h < -0.05) {
          const cx = c * TILE + TILE / 2, cy = r * TILE + TILE / 2, k = Math.min(1, -h / 3);
          g.fillStyle(lerpColor(0x7a5d35, 0x33260f, k), 1); g.fillEllipse(cx, cy, TILE * 1.05, TILE * 0.92);
          g.fillStyle(0x000000, 0.18 + 0.22 * k); g.fillEllipse(cx, cy + 2, TILE * 0.66, TILE * 0.5);
        }
      }
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (dirt[di(c, r)] > 0.15) {
          const cx = c * TILE + TILE / 2;
          g.fillStyle(0x000000, 0.12); g.fillEllipse(cx, r * TILE + TILE - 2, TILE * 1.1, 10);
        }
      }
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const h = dirt[di(c, r)];
        if (h > 0.05) {
          const cx = c * TILE + TILE / 2, cy = r * TILE + TILE / 2;
          const k = Math.min(1, h / MAX_DIRT), lift = Math.min(11, h * 1.6), rad = TILE * 0.6 + k * 3;
          g.fillStyle(lerpColor(0x8a5a28, 0x4a3014, k), 1); g.fillCircle(cx, cy - lift, rad);
          g.fillStyle(lerpColor(0xc09154, 0x7a5126, k), 0.85); g.fillCircle(cx - 3, cy - lift - 4, rad * 0.52);
        }
      }
    }
  }

  // =========================================================================
  // Controls (HTML overlay + keyboard) — feed the shared `input`.
  // =========================================================================
  let currentScene = null;
  const keys = Object.create(null);

  function readKeyboard() {
    let kx = 0, ky = 0;
    if (keys["arrowleft"] || keys["a"]) kx -= 1;
    if (keys["arrowright"] || keys["d"]) kx += 1;
    if (keys["arrowup"] || keys["w"]) ky -= 1;
    if (keys["arrowdown"] || keys["s"]) ky += 1;
    if (kx || ky) { const m = Math.hypot(kx, ky); input.mx = kx / m; input.my = ky / m; }
    else if (!joyId) { input.mx = 0; input.my = 0; }
    input.dig = !!(keys["j"] || keys[" "]);
    input.dump = !!keys["k"];
  }

  // Joystick (left side of the screen).
  let joyId = null, joyOX = 0, joyOY = 0;
  const JOY_R = 56;
  let joyEl, knobEl;

  function startJoy(id, x, y) {
    joyId = id; joyOX = x; joyOY = y;
    joyEl.style.left = (x - 66) + "px"; joyEl.style.top = (y - 66) + "px";
    joyEl.classList.add("active"); moveJoy(x, y);
  }
  function moveJoy(x, y) {
    let dx = x - joyOX, dy = y - joyOY; const d = Math.hypot(dx, dy);
    if (d > JOY_R) { dx = dx / d * JOY_R; dy = dy / d * JOY_R; }
    knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
    input.mx = dx / JOY_R; input.my = dy / JOY_R;
  }
  function endJoy() {
    joyId = null; joyEl.classList.remove("active");
    knobEl.style.transform = "translate(0,0)"; input.mx = 0; input.my = 0;
  }

  function isControl(t) { return t && t.closest && t.closest("button, .machine-picker, .action-buttons, .hud"); }

  function buildControls() {
    joyEl = document.getElementById("joystick");
    knobEl = document.getElementById("joystick-knob");

    // Machine picker.
    const picker = document.getElementById("machine-picker");
    picker.innerHTML = "";
    TRUCKS.forEach((def) => {
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = "machine-btn"; btn.dataset.id = def.id;
      btn.innerHTML = `<span class="ico">${def.emoji}</span><span>${def.name}</span>`;
      btn.addEventListener("click", () => currentScene.setMachine(def));
      picker.appendChild(btn);
    });

    document.getElementById("btn-flatten").addEventListener("click", () => currentScene.levelYard());
    document.getElementById("btn-mute").addEventListener("click", (e) => {
      Sound.ensure(); e.currentTarget.textContent = Sound.toggleMute() ? "🔇" : "🔊";
    });

    // Hold buttons.
    const hold = (id, set) => {
      const el = document.getElementById(id);
      const on = (e) => { Sound.ensure(); set(true); if (e.cancelable) e.preventDefault(); };
      const off = () => set(false);
      el.addEventListener("pointerdown", on);
      el.addEventListener("pointerup", off);
      el.addEventListener("pointercancel", off);
      el.addEventListener("pointerleave", off);
    };
    hold("btn-dig", (v) => (heldDig = v));
    hold("btn-dump", (v) => (heldDump = v));

    // Joystick pointers (left ~60% of the screen, away from controls).
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
  // Boot Phaser.
  // =========================================================================
  seedDirt();
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game-root",
    backgroundColor: "#7fb4cb",
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, pixelArt: false },
    scene: [BootScene, GameScene],
  });
})();
