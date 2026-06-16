// Procedural sound for Dirt Diggers — everything is synthesized with the Web
// Audio API, so there are no sound files to download. Audio can only start
// after the player touches the screen (mobile autoplay rules), so call
// Sound.ensure() from the first user gesture.
const Sound = (function () {
  "use strict";

  let ctx = null;
  let ready = false;
  let engineGain = null;
  let engineOsc = null;
  let engineSub = null;
  let noiseBuf = null;
  let masterMuted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();

    // Continuous engine: a low sawtooth + sub sine through a lowpass filter.
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 500;

    engineGain = ctx.createGain();
    engineGain.gain.value = 0;

    engineOsc = ctx.createOscillator();
    engineOsc.type = "sawtooth";
    engineOsc.frequency.value = 60;

    engineSub = ctx.createOscillator();
    engineSub.type = "sine";
    engineSub.frequency.value = 40;

    engineOsc.connect(filter);
    engineSub.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(ctx.destination);
    engineOsc.start();
    engineSub.start();

    ready = true;
  }

  function getNoise() {
    if (noiseBuf) return noiseBuf;
    const len = Math.floor(ctx.sampleRate * 0.4);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  // Set engine loudness/pitch from how fast the machine is moving (0..1).
  function engine(level) {
    if (!ready) return;
    const now = ctx.currentTime;
    const g = masterMuted ? 0 : level * 0.12;
    engineGain.gain.setTargetAtTime(g, now, 0.08);
    engineOsc.frequency.setTargetAtTime(55 + level * 55, now, 0.08);
    engineSub.frequency.setTargetAtTime(38 + level * 24, now, 0.08);
  }

  function tone(opts) {
    if (!ready || masterMuted) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = opts.type || "sine";
    o.frequency.value = opts.freq || 220;
    if (opts.slideTo) o.frequency.linearRampToValueAtTime(opts.slideTo, now + opts.dur);
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(opts.vol || 0.3, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + (opts.dur || 0.15));
    o.connect(g);
    g.connect(ctx.destination);
    o.start(now);
    o.stop(now + (opts.dur || 0.15) + 0.02);
  }

  function noise(opts) {
    if (!ready || masterMuted) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = getNoise();
    const f = ctx.createBiquadFilter();
    f.type = opts.type || "bandpass";
    f.frequency.value = opts.freq || 800;
    f.Q.value = opts.q || 1;
    const g = ctx.createGain();
    g.gain.value = opts.vol || 0.3;
    g.gain.exponentialRampToValueAtTime(0.0001, now + (opts.dur || 0.2));
    src.connect(f);
    f.connect(g);
    g.connect(ctx.destination);
    src.start(now);
    src.stop(now + (opts.dur || 0.2));
  }

  // Gritty scoop sound while digging.
  function dig() { noise({ freq: 650, q: 1.4, dur: 0.14, vol: 0.22, type: "bandpass" }); }

  // Heavy dirt plop while dumping.
  function dump() {
    tone({ type: "sine", freq: 130, slideTo: 60, dur: 0.18, vol: 0.3 });
    noise({ freq: 300, dur: 0.18, vol: 0.18, type: "lowpass" });
  }

  // Cheerful "bucket full" ding.
  function ding() {
    tone({ type: "triangle", freq: 880, dur: 0.12, vol: 0.25 });
    setTimeout(() => tone({ type: "triangle", freq: 1320, dur: 0.16, vol: 0.25 }), 90);
  }

  // Backup beep (dump truck).
  function beep() { tone({ type: "square", freq: 960, dur: 0.12, vol: 0.16 }); }

  // Friendly horn when switching machines.
  function horn() {
    tone({ type: "square", freq: 220, dur: 0.18, vol: 0.18 });
    setTimeout(() => tone({ type: "square", freq: 300, dur: 0.22, vol: 0.18 }), 70);
  }

  function toggleMute() { masterMuted = !masterMuted; if (masterMuted) engine(0); return masterMuted; }
  function isMuted() { return masterMuted; }

  return { ensure, engine, dig, dump, ding, beep, horn, toggleMute, isMuted };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = { Sound };
}
