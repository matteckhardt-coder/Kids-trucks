// Dirt Diggers — a little construction game for kids.
// Drive a machine around the dirt yard and push / dig / dump dirt.
(function () {
  "use strict";

  // ---- World layout (fixed logical size, scaled to fit the screen) ----
  const TILE = 32;
  const COLS = 30;
  const ROWS = 22;
  const WORLD_W = COLS * TILE; // 960
  const WORLD_H = ROWS * TILE; // 704

  const MAX_DIRT = 6;   // tallest pile
  const MIN_DIRT = -3;  // deepest hole

  // ---- Canvas / rendering scale ----
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  let viewScale = 1;
  let viewOffX = 0;
  let viewOffY = 0;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const cw = window.innerWidth;
    const ch = window.innerHeight;
    canvas.width = Math.floor(cw * dpr);
    canvas.height = Math.floor(ch * dpr);
    // Fit the whole world on screen (letterboxed), centered.
    viewScale = Math.min(cw / WORLD_W, ch / WORLD_H);
    viewOffX = (cw - WORLD_W * viewScale) / 2;
    viewOffY = (ch - WORLD_H * viewScale) / 2;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);

  // ---- Dirt field ----
  const dirt = new Float32Array(COLS * ROWS);
  const di = (c, r) => r * COLS + c;
  const inBounds = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS;

  function seedDirt() {
    // A gentle base layer with a few mounds to play with.
    for (let i = 0; i < dirt.length; i++) dirt[i] = 0.6;
    const mounds = [
      [7, 6, 3.5, 3.4], [22, 7, 3, 3.8], [15, 15, 4, 4.2], [25, 17, 2.5, 3],
    ];
    for (const [mc, mr, rad, peak] of mounds) {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const d = Math.hypot(c - mc, r - mr);
          if (d < rad) {
            dirt[di(c, r)] = clamp(dirt[di(c, r)] + peak * (1 - d / rad), MIN_DIRT, MAX_DIRT);
          }
        }
      }
    }
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // ---- The machine the player is driving ----
  const player = {
    x: WORLD_W / 2,
    y: WORLD_H - 80,
    heading: -Math.PI / 2,
    bucket: 0,
    def: null,
  };

  function setMachine(def) {
    player.def = def;
    player.bucket = Math.min(player.bucket, def.capacity);
    document.getElementById("machine-label").textContent = def.name;
    for (const btn of document.querySelectorAll(".machine-btn")) {
      btn.classList.toggle("active", btn.dataset.id === def.id);
    }
    // Dim the DIG / DUMP buttons this machine can't use.
    document.getElementById("btn-dig").classList.toggle("off", def.dig === false);
    document.getElementById("btn-dump").classList.toggle("off", def.dump === false);
    Sound.horn();
  }

  // ---- Input state ----
  const input = { mx: 0, my: 0, dig: false, dump: false }; // mx,my in [-1,1]

  // Keyboard (desktop convenience)
  const keys = Object.create(null);
  window.addEventListener("keydown", (e) => { keys[e.key.toLowerCase()] = true; });
  window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

  function readKeyboard() {
    let kx = 0, ky = 0;
    if (keys["arrowleft"] || keys["a"]) kx -= 1;
    if (keys["arrowright"] || keys["d"]) kx += 1;
    if (keys["arrowup"] || keys["w"]) ky -= 1;
    if (keys["arrowdown"] || keys["s"]) ky += 1;
    if (kx || ky) {
      const m = Math.hypot(kx, ky) || 1;
      input.mx = kx / m;
      input.my = ky / m;
    } else if (!joystickActive) {
      input.mx = 0; input.my = 0;
    }
    if (keys["j"] || keys[" "]) input.dig = true;
    if (keys["k"]) input.dump = true;
  }

  // ---- Virtual joystick (touch on the left side of the screen) ----
  const joyEl = document.getElementById("joystick");
  const knobEl = document.getElementById("joystick-knob");
  let joystickActive = false;
  let joyId = null;
  let joyOX = 0, joyOY = 0;
  const JOY_R = 56;

  function startJoy(id, x, y) {
    joystickActive = true;
    joyId = id;
    joyOX = x; joyOY = y;
    joyEl.style.left = (x - 65) + "px";
    joyEl.style.top = (y - 65) + "px";
    joyEl.classList.add("active");
    moveJoy(x, y);
  }
  function moveJoy(x, y) {
    let dx = x - joyOX, dy = y - joyOY;
    const d = Math.hypot(dx, dy);
    if (d > JOY_R) { dx = dx / d * JOY_R; dy = dy / d * JOY_R; }
    knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
    input.mx = dx / JOY_R;
    input.my = dy / JOY_R;
  }
  function endJoy() {
    joystickActive = false;
    joyId = null;
    joyEl.classList.remove("active");
    knobEl.style.transform = "translate(0,0)";
    input.mx = 0; input.my = 0;
  }

  // Touch handling: left half = joystick, buttons handle their own touches.
  canvas.addEventListener("touchstart", (e) => {
    for (const t of e.changedTouches) {
      if (!joystickActive) startJoy(t.identifier, t.clientX, t.clientY);
    }
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener("touchmove", (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) moveJoy(t.clientX, t.clientY);
    }
    e.preventDefault();
  }, { passive: false });
  function handleTouchEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) endJoy();
    }
  }
  canvas.addEventListener("touchend", handleTouchEnd);
  canvas.addEventListener("touchcancel", handleTouchEnd);

  // Mouse fallback (desktop): drag to drive.
  canvas.addEventListener("mousedown", (e) => startJoy("mouse", e.clientX, e.clientY));
  window.addEventListener("mousemove", (e) => { if (joyId === "mouse") moveJoy(e.clientX, e.clientY); });
  window.addEventListener("mouseup", () => { if (joyId === "mouse") endJoy(); });

  document.getElementById("btn-flatten").addEventListener("click", () => {
    for (let i = 0; i < dirt.length; i++) dirt[i] = 0.6;
    player.bucket = 0;
  });

  document.getElementById("btn-mute").addEventListener("click", (e) => {
    Sound.ensure();
    const muted = Sound.toggleMute();
    e.currentTarget.textContent = muted ? "🔇" : "🔊";
  });

  // Audio can only start after a user gesture — unlock it on the first one.
  function unlockAudio() { Sound.ensure(); }
  window.addEventListener("touchstart", unlockAudio, { once: true });
  window.addEventListener("mousedown", unlockAudio, { once: true });
  window.addEventListener("keydown", unlockAudio, { once: true });

  // ---- Simulation ----
  function tileAtOffset(dist, angleOffset) {
    const a = player.heading + (angleOffset || 0);
    const x = player.x + Math.cos(a) * dist;
    const y = player.y + Math.sin(a) * dist;
    return { c: Math.floor(x / TILE), r: Math.floor(y / TILE) };
  }

  // Where this machine's bucket works (front, side, or under itself).
  function toolTile(def) {
    if (def.scoop === "side") return tileAtOffset(20, Math.PI / 2);
    return tileAtOffset(22, 0);
  }

  // Per-frame action flags, read by the sound step.
  let acting = { dig: false, dump: false, load: false };

  function update(dt) {
    const def = player.def;
    acting.dig = acting.dump = acting.load = false;

    // Drive: joystick vector maps straight to velocity; the machine faces where it goes.
    const mag = Math.hypot(input.mx, input.my);
    if (mag > 0.08) {
      const vx = input.mx * def.speed;
      const vy = input.my * def.speed;
      player.x = clamp(player.x + vx * dt, 16, WORLD_W - 16);
      player.y = clamp(player.y + vy * dt, 16, WORLD_H - 16);
      player.heading = Math.atan2(vy, vx);
    }

    // Bulldozer: the blade pushes dirt forward as it drives.
    if (def.dozer && mag > 0.2) {
      const blade = tileAtOffset(20, 0);
      const ahead = tileAtOffset(20 + TILE, 0);
      if (inBounds(blade.c, blade.r) && inBounds(ahead.c, ahead.r)) {
        const bi = di(blade.c, blade.r);
        if (dirt[bi] > 0) {
          const ai = di(ahead.c, ahead.r);
          const room = MAX_DIRT - dirt[ai];
          const moved = Math.min(dirt[bi], 5 * dt * mag, room);
          if (moved > 0) { dirt[bi] -= moved; dirt[ai] += moved; }
        }
      }
    }

    // Dump truck: scoops dirt from piles it drives over, straight into the bed.
    if (def.scoop === "driveover" && mag > 0.2 && player.bucket < def.capacity) {
      const c = Math.floor(player.x / TILE), r = Math.floor(player.y / TILE);
      if (inBounds(c, r) && dirt[di(c, r)] > 0.3) {
        const i = di(c, r);
        const rate = def.loadRate || def.digRate;
        const want = Math.min(rate * dt, def.capacity - player.bucket, dirt[i]);
        if (want > 0) { dirt[i] -= want; player.bucket += want; acting.load = true; }
      }
    }

    // DIG: scoop dirt from the tool tile into the bucket.
    if (input.dig && def.dig !== false && player.bucket < def.capacity) {
      const t = toolTile(def);
      if (inBounds(t.c, t.r)) {
        const i = di(t.c, t.r);
        const floorD = def.digMin != null ? def.digMin : -2;
        const avail = dirt[i] - floorD;
        const want = Math.min(def.digRate * dt, def.capacity - player.bucket, avail);
        if (want > 0.0001) { dirt[i] -= want; player.bucket += want; acting.dig = true; }
      }
    }

    // DUMP: drop dirt from the bucket back onto the ground.
    if (input.dump && def.dump !== false && player.bucket > 0) {
      const t = toolTile(def);
      if (inBounds(t.c, t.r)) {
        if (def.spread) {
          // Grading: spread the load across the tool tile and its neighbours.
          const cells = [[t.c, t.r], [t.c + 1, t.r], [t.c - 1, t.r], [t.c, t.r + 1], [t.c, t.r - 1]]
            .filter(([c, r]) => inBounds(c, r));
          const per = (def.digRate * dt) / cells.length;
          let placed = 0;
          for (const [c, r] of cells) {
            const i = di(c, r);
            const give = Math.min(per, MAX_DIRT - dirt[i]);
            if (give > 0) { dirt[i] += give; placed += give; }
          }
          placed = Math.min(placed, player.bucket);
          if (placed > 0) { player.bucket -= placed; acting.dump = true; }
        } else {
          const i = di(t.c, t.r);
          const give = Math.min(def.digRate * dt, player.bucket, MAX_DIRT - dirt[i]);
          if (give > 0.0001) { dirt[i] += give; player.bucket -= give; acting.dump = true; }
        }
      }
    }

    audioStep(dt, mag);
    updateHud();
  }

  // ---- Sound scheduling (throttled so grains don't machine-gun) ----
  let sndDig = 0, sndDump = 0, sndBeep = 0, wasFull = false;
  function audioStep(dt, mag) {
    Sound.engine(mag);
    sndDig -= dt; sndDump -= dt; sndBeep -= dt;
    if ((acting.dig || acting.load) && sndDig <= 0) { Sound.dig(); sndDig = 0.11; }
    if (acting.dump && sndDump <= 0) { Sound.dump(); sndDump = 0.14; }
    const full = player.bucket >= player.def.capacity - 0.02;
    if (full && !wasFull) Sound.ding();
    wasFull = full;
    // Dump truck backup beep while hauling.
    if (player.def.scoop === "driveover" && mag > 0.25 && sndBeep <= 0) { Sound.beep(); sndBeep = 0.6; }
  }

  function updateHud() {
    const pct = player.def.capacity ? (player.bucket / player.def.capacity) * 100 : 0;
    document.getElementById("bucket-fill").style.width = clamp(pct, 0, 100) + "%";
  }

  // ---- Rendering ----
  function dirtColor(t) {
    if (t < 0) {
      const k = Math.min(1, -t / 3);
      return mix([169, 146, 107], [74, 56, 31], k); // ground -> dark hole
    }
    const k = Math.min(1, t / MAX_DIRT);
    return mix([205, 180, 135], [110, 74, 33], k);   // ground -> rich pile
  }
  function mix(a, b, k) {
    return `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)})`;
  }

  function draw() {
    const cw = window.innerWidth, ch = window.innerHeight;
    ctx.clearRect(0, 0, cw, ch);

    // Sky / background outside the yard.
    ctx.fillStyle = "#9bd0e0";
    ctx.fillRect(0, 0, cw, ch);

    ctx.save();
    ctx.translate(viewOffX, viewOffY);
    ctx.scale(viewScale, viewScale);

    // Yard border.
    ctx.fillStyle = "#7a6233";
    ctx.fillRect(-8, -8, WORLD_W + 16, WORLD_H + 16);

    // Dirt tiles.
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = dirt[di(c, r)];
        ctx.fillStyle = dirtColor(t);
        ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
        // Fake a raised top on tall piles for a 3D feel.
        if (t > 1) {
          const lift = Math.min(8, t * 1.3);
          ctx.fillStyle = "rgba(255,240,200,0.18)";
          ctx.fillRect(c * TILE + 3, r * TILE + 3 - lift, TILE - 6, 4);
        }
      }
    }

    drawMachine();
    ctx.restore();
  }

  function drawMachine() {
    const def = player.def;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.heading);

    // Shadow.
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    roundRect(-22, -14 + 5, 44, 28, 6); ctx.fill();

    // Wheels / tracks.
    ctx.fillStyle = "#2c2c2c";
    roundRect(-20, -16, 40, 7, 3); ctx.fill();
    roundRect(-20, 9, 40, 7, 3); ctx.fill();

    // Body.
    ctx.fillStyle = def.color;
    roundRect(-20, -13, 40, 26, 6); ctx.fill();

    // Cab.
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    roundRect(-6, -9, 14, 18, 4); ctx.fill();

    // Front tool (blade or bucket) — points in the driving direction.
    ctx.fillStyle = def.accent;
    if (def.dozer) {
      roundRect(20, -16, 6, 32, 2); ctx.fill();         // dozer blade
    } else {
      roundRect(20, -11, 9, 22, 3); ctx.fill();          // loader bucket
      // Show the load sitting in the bucket.
      if (player.bucket > 0.05) {
        const f = player.bucket / def.capacity;
        ctx.fillStyle = "#5a3d1c";
        roundRect(21, -9 + (1 - f) * 9, 7, f * 18, 2); ctx.fill();
      }
    }

    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---- Build the machine picker ----
  function buildPicker() {
    const wrap = document.getElementById("machine-picker");
    TRUCKS.forEach((def) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "machine-btn";
      btn.dataset.id = def.id;
      btn.innerHTML = `<span class="ico">${def.emoji}</span><span>${def.name}</span>`;
      btn.addEventListener("click", () => setMachine(def));
      wrap.appendChild(btn);
    });
  }

  // ---- Main loop ----
  let last = 0;
  function loop(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0);
    last = ts;
    input.dig = false;
    input.dump = false;
    readKeyboard();
    // Re-apply held on-screen buttons (readKeyboard only sets true, never false).
    if (heldDig) input.dig = true;
    if (heldDump) input.dump = true;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // Track held button state separately so keyboard + touch combine cleanly.
  let heldDig = false, heldDump = false;
  (function wireHeld() {
    const dig = document.getElementById("btn-dig");
    const dump = document.getElementById("btn-dump");
    const set = (which, val) => (e) => {
      if (e && e.cancelable) e.preventDefault();
      if (which === "dig") heldDig = val; else heldDump = val;
    };
    ["touchstart", "mousedown"].forEach((ev) => {
      dig.addEventListener(ev, set("dig", true), { passive: false });
      dump.addEventListener(ev, set("dump", true), { passive: false });
    });
    ["touchend", "touchcancel", "mouseup", "mouseleave"].forEach((ev) => {
      dig.addEventListener(ev, set("dig", false));
      dump.addEventListener(ev, set("dump", false));
    });
  })();

  // ---- Boot ----
  resize();
  seedDirt();
  buildPicker();
  setMachine(TRUCKS[0]);
  requestAnimationFrame(loop);
})();
