// Fully procedural audio: every sound and every note of music is synthesized at runtime.
// Music runs on a lookahead scheduler against AudioContext time; modes crossfade.

const LOOKAHEAD = 0.12;
const TICK_MS = 25;
const FADE = 1.5;
const FLOOR = 0.0001;

const PENT_MAJ = [0, 2, 4, 7, 9];
const PENT_MIN = [0, 3, 5, 7, 10];

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- melody notation ----------
// One char per 16th: digit = scale degree, '.' holds the previous note, '_' is a rest,
// x/y = degrees -1/-2, a/b/c = degrees 10/11/12.

const DEG = { x: -1, y: -2, a: 10, b: 11, c: 12 };

function parseBar(str) {
  const notes = [];
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '.' || ch === '_') continue;
    const deg = ch in DEG ? DEG[ch] : parseInt(ch, 10);
    if (Number.isNaN(deg)) continue;
    let d = 1;
    while (i + d < str.length && str[i + d] === '.') d++;
    notes.push({ step: i, deg, dur: d });
  }
  return notes;
}

function degToMidi(root, scale, deg) {
  const n = scale.length;
  const oct = Math.floor(deg / n);
  const idx = ((deg % n) + n) % n;
  return root + oct * 12 + scale[idx];
}

// Small per-loop changes so a loop never repeats exactly: neighbour-tone swaps and split notes.
function varyNotes(notes, rand, amount, lockLast) {
  const out = [];
  notes.forEach((src, i) => {
    const n = { ...src };
    const last = lockLast && i === notes.length - 1;
    if (!last && rand() < amount) n.deg += rand() < 0.5 ? 1 : -1;
    if (!last && n.dur >= 2 && rand() < amount * 0.7) {
      out.push({ step: n.step, deg: n.deg, dur: 1 });
      out.push({ step: n.step + 1, deg: n.deg + (rand() < 0.5 ? 1 : -1), dur: n.dur - 1 });
      return;
    }
    out.push(n);
  });
  return out;
}

function melodyEvents(bars, { root, scale, voice, vel = 0.9, loop = 0, rand, vary = 0, octave = 0, staccato = 0, drop = 0 }) {
  const out = [];
  bars.forEach((str, b) => {
    let notes = parseBar(str);
    if (vary && loop > 0) notes = varyNotes(notes, rand, vary, b === bars.length - 1);
    for (const n of notes) {
      if (drop && loop > 0 && rand() < drop) continue;
      const accent = n.step % 4 === 0 ? 1 : 0.82;
      out.push({
        step: b * 16 + n.step,
        v: voice,
        n: degToMidi(root, scale, n.deg) + octave * 12,
        d: staccato ? Math.min(n.dur, staccato) : n.dur,
        g: vel * accent,
      });
    }
  });
  return out;
}

const ev = (list, step, v, n, d = 1, g = 1) => list.push({ step, v, n, d, g });

// ---------- music voices ----------

const VOICES = {
  pluck(a, out, t, m, dur, vel) {
    const f = mtof(m);
    const len = Math.min(0.14 + dur * 1.1, 0.75);
    const lp = a.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 2;
    lp.frequency.setValueAtTime(3400, t);
    lp.frequency.exponentialRampToValueAtTime(700, t + len);
    lp.connect(out);
    a._tone(lp, t, { type: 'triangle', f0: f, dur: len, peak: 0.3 * vel, attack: 0.004 });
    a._tone(lp, t, { type: 'sine', f0: f * 2, dur: len * 0.45, peak: 0.09 * vel, attack: 0.002 });
  },
  marimba(a, out, t, m, dur, vel) {
    const f = mtof(m);
    a._tone(out, t, { type: 'sine', f0: f, dur: 0.6, peak: 0.34 * vel, attack: 0.002 });
    a._tone(out, t, { type: 'sine', f0: f * 3.98, dur: 0.08, peak: 0.1 * vel, attack: 0.001 });
    a._tone(out, t, { type: 'triangle', f0: f * 2, dur: 0.18, peak: 0.05 * vel, attack: 0.001 });
  },
  pizz(a, out, t, m, dur, vel) {
    const f = mtof(m);
    const bp = a.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f * 1.6;
    bp.Q.value = 0.9;
    bp.connect(out);
    a._tone(bp, t, { type: 'triangle', f0: f, dur: 0.16, peak: 0.55 * vel, attack: 0.003 });
    a._tone(out, t, { type: 'sine', f0: f, dur: 0.12, peak: 0.12 * vel, attack: 0.002 });
  },
  bass(a, out, t, m, dur, vel) {
    const f = mtof(m);
    const len = Math.max(dur * 0.9, 0.12) + 0.06;
    const lp = a.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 720;
    lp.connect(out);
    a._tone(lp, t, { type: 'triangle', f0: f, dur: len, peak: 0.36 * vel, attack: 0.008 });
    a._tone(lp, t, { type: 'sine', f0: f, dur: len, peak: 0.24 * vel, attack: 0.008 });
  },
  pad(a, out, t, m, dur, vel) {
    const { ctx } = a;
    const f = mtof(m);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    lp.Q.value = 0.5;
    const g = ctx.createGain();
    const end = t + dur;
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(0.045 * vel, t + Math.min(0.4, dur * 0.4));
    g.gain.setValueAtTime(0.045 * vel, end);
    g.gain.exponentialRampToValueAtTime(FLOOR, end + 0.6);
    lp.connect(g).connect(out);
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(lp);
      o.start(t);
      o.stop(end + 0.7);
    }
  },
  brass(a, out, t, m, dur, vel) {
    const { ctx } = a;
    const f = mtof(m);
    const len = Math.max(dur, 0.12) + 0.15;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(250, t);
    lp.frequency.exponentialRampToValueAtTime(1800, t + 0.03);
    lp.frequency.exponentialRampToValueAtTime(600, t + 0.25);
    lp.connect(out);
    a._tone(lp, t, { type: 'sawtooth', f0: f, dur: len, peak: 0.13 * vel, attack: 0.015 });
    a._tone(lp, t, { type: 'sawtooth', f0: f * 1.004, dur: len, peak: 0.1 * vel, attack: 0.02 });
  },
  bell(a, out, t, m, dur, vel) {
    const f = mtof(m);
    a._tone(out, t, { type: 'sine', f0: f, dur: 1.3, peak: 0.18 * vel, attack: 0.002 });
    a._tone(out, t, { type: 'sine', f0: f * 2.76, dur: 0.5, peak: 0.05 * vel, attack: 0.001 });
    a._tone(out, t, { type: 'sine', f0: f * 5.4, dur: 0.22, peak: 0.025 * vel, attack: 0.001 });
  },
  kick(a, out, t, m, dur, vel) {
    a._tone(out, t, { type: 'sine', f0: 140, f1: 42, glide: 0.12, dur: 0.3, peak: 0.7 * vel, attack: 0.002 });
  },
  hat(a, out, t, m, dur, vel) {
    a._noise(out, t, { type: 'highpass', freq: 7500, dur: 0.04, peak: 0.11 * vel });
  },
  openhat(a, out, t, m, dur, vel) {
    a._noise(out, t, { type: 'highpass', freq: 6500, dur: 0.18, peak: 0.08 * vel });
  },
  snare(a, out, t, m, dur, vel) {
    a._noise(out, t, { type: 'bandpass', freq: 1900, q: 0.7, dur: 0.14, peak: 0.3 * vel });
    a._tone(out, t, { type: 'triangle', f0: 200, f1: 150, dur: 0.08, peak: 0.16 * vel });
  },
  clap(a, out, t, m, dur, vel) {
    for (let i = 0; i < 3; i++) a._noise(out, t + i * 0.012, { type: 'bandpass', freq: 1400, q: 1.1, dur: 0.06 + i * 0.03, peak: 0.16 * vel });
  },
  tick(a, out, t, m, dur, vel) {
    a._tone(out, t, { type: 'sine', f0: 1400, f1: 1100, dur: 0.045, peak: 0.15 * vel, attack: 0.001 });
    a._noise(out, t, { type: 'bandpass', freq: 2400, q: 4, dur: 0.03, peak: 0.05 * vel });
  },
  shaker(a, out, t, m, dur, vel) {
    a._noise(out, t, { type: 'bandpass', freq: 6000, q: 1.5, dur: 0.07, attack: 0.02, peak: 0.07 * vel });
  },
  crash(a, out, t, m, dur, vel) {
    a._noise(out, t, { type: 'highpass', freq: 4500, dur: 1.4, peak: 0.13 * vel });
  },
};

// ---------- songs ----------

const EXPLORE_MELODY = [
  '5.4.3..45.7.6.5.',
  '4..34.2.3.......',
  '2.3.4.5.6.5.4.3.',
  '3..43.1.2.......',
  '5.5.7.8.7.5.6...',
  '4.6.5.4.3.4.2...',
  '2.3.5.4.3.2.1.2.',
  '3...1.2.0.......',
];
const EXPLORE_BASS = [38, 35, 43, 45, 38, 35, 43, 45];
const EXPLORE_CHORDS = [[62, 66, 69], [59, 62, 66], [67, 71, 74], [69, 73, 76]];

function exploreDrums(list, bars, rand, loop, { kickExtra = 0.25 } = {}) {
  for (let b = 0; b < bars; b++) {
    const o = b * 16;
    ev(list, o, 'kick', 0, 1, 0.8);
    ev(list, o + 8, 'kick', 0, 1, 0.7);
    if (loop > 0 && rand() < kickExtra) ev(list, o + 10, 'kick', 0, 1, 0.5);
    ev(list, o + 4, 'clap', 0, 1, 0.7);
    ev(list, o + 12, 'clap', 0, 1, 0.7);
    for (let s = 0; s < 16; s += 2) ev(list, o + s, 'hat', 0, 1, s % 4 === 2 ? 1 : 0.55);
    if (loop > 0) for (let s = 1; s < 16; s += 2) ev(list, o + s, 'shaker', 0, 1, 0.5);
  }
}

function walkingBass(list, roots, rand, loop, vel = 0.9) {
  roots.forEach((r, b) => {
    const o = b * 16;
    ev(list, o, 'bass', r, 3, vel);
    ev(list, o + 6, 'bass', r + 7, 2, vel * 0.8);
    ev(list, o + 8, 'bass', r, 3, vel * 0.9);
    ev(list, o + 12, 'bass', r + 12, 2, vel * 0.8);
    if (loop > 0 && rand() < 0.4) {
      const next = roots[(b + 1) % roots.length];
      ev(list, o + 14, 'bass', next + (rand() < 0.5 ? -1 : 2), 2, vel * 0.7);
    }
  });
}

const MODES = {
  title: {
    bpm: 84, bars: 4, swing: 0.08, seed: 11,
    build(loop, rand) {
      const out = melodyEvents(['3...5...4.3.2...', '1...2.3.4.......', '4...3...5.4.3...', '2...1...0.......'], {
        root: 74, scale: PENT_MAJ, voice: 'marimba', vel: 0.85, loop, rand, vary: 0.15,
      });
      const chords = [[50, 54, 57], [55, 59, 62], [47, 50, 54], [45, 49, 52]];
      const roots = [38, 43, 35, 33];
      chords.forEach((c, b) => {
        const o = b * 16;
        ev(out, o, 'pad', c, 16, 1);
        ev(out, o, 'bass', roots[b], 12, 0.5);
        [2, 6, 10, 14].forEach((s, i) => ev(out, o + s, 'marimba', c[i % 3] + 12, 1, 0.26));
        if (loop > 0) {
          ev(out, o + 4, 'shaker', 0, 1, 0.6);
          ev(out, o + 12, 'shaker', 0, 1, 0.6);
        }
      });
      return out;
    },
  },

  explore: {
    bpm: 104, bars: 8, swing: 0.12, seed: 23,
    build(loop, rand) {
      const out = melodyEvents(EXPLORE_MELODY, { root: 62, scale: PENT_MAJ, voice: 'pluck', vel: 0.9, loop, rand, vary: 0.12 });
      walkingBass(out, EXPLORE_BASS, rand, loop);
      exploreDrums(out, 8, rand, loop);
      if (loop % 2 === 1) {
        // sparse marimba counter-line on alternate loops
        EXPLORE_BASS.forEach((_, b) => {
          const c = EXPLORE_CHORDS[b % 4];
          [2, 6, 10, 14].forEach((s, i) => {
            if (rand() < 0.7) ev(out, b * 16 + s, 'marimba', c[(i + b) % 3] + 12, 1, 0.3);
          });
        });
      }
      return out;
    },
  },

  stealth: {
    bpm: 96, bars: 4, swing: 0.18, seed: 37,
    build(loop, rand) {
      const out = melodyEvents(['0.0...2..1..0...', '3..2..1...0.....', '0.0...2..3..4.3.', '2..1..0.x.......'], {
        root: 69, scale: PENT_MIN, voice: 'pizz', vel: 0.85, loop, rand, vary: 0.1, staccato: 1, drop: 0.18,
      });
      if (loop % 2 === 1) {
        // a lower echo answering the line
        out.push(...melodyEvents(['____0.....2.....', '____3.....1.....', '____0.....3.....', '____2.....0.....'], {
          root: 57, scale: PENT_MIN, voice: 'pizz', vel: 0.45, loop, rand, staccato: 1,
        }));
      }
      [45, 45, 50, 52].forEach((r, b) => {
        const o = b * 16;
        ev(out, o, 'bass', r, 1, 0.75);
        ev(out, o + 3, 'bass', r + 7, 1, 0.55);
        ev(out, o + 6, 'bass', r, 1, 0.65);
        ev(out, o + 8, 'bass', r + 12, 1, 0.5);
        ev(out, o + 11, 'bass', r + 7, 1, 0.55);
        ev(out, o + 4, 'tick', 0, 1, 0.6);
        ev(out, o + 12, 'tick', 0, 1, 0.6);
        if (rand() < 0.5) ev(out, o + 10, 'hat', 0, 1, 0.4);
        if (rand() < 0.3) ev(out, o + 15, 'tick', 0, 1, 0.3);
      });
      return out;
    },
  },

  danger: {
    bpm: 120, bars: 4, swing: 0.04, seed: 41,
    build(loop, rand) {
      const out = melodyEvents(['4.4.5.4.3.2.3...', '2.2.3.2.1.0.1...', '4.4.5.7.6.5.4.3.', '3.4.3.1.2.......'], {
        root: 62, scale: PENT_MAJ, voice: 'pluck', vel: 1, loop, rand, vary: 0.12, staccato: 2,
      });
      const roots = [47, 43, 50, 45];
      const pattern = [0, 0, 12, 0, 0, 7, 12, 7];
      roots.forEach((r, b) => {
        const o = b * 16;
        pattern.forEach((iv, i) => ev(out, o + i * 2, 'bass', r - 12 + iv, 1, 0.95));
        for (const s of [0, 4, 8, 12]) ev(out, o + s, 'kick', 0, 1, 0.9);
        if (rand() < 0.3) ev(out, o + 14, 'kick', 0, 1, 0.6);
        if (rand() < 0.2) ev(out, o + 7, 'kick', 0, 1, 0.5);
        ev(out, o + 4, 'snare', 0, 1, 0.9);
        ev(out, o + 12, 'snare', 0, 1, 0.9);
        ev(out, o + 15, 'snare', 0, 1, 0.3);
        for (let s = 0; s < 16; s++) ev(out, o + s, 'hat', 0, 1, s % 2 ? 0.45 : 0.85);
      });
      // fill into the next loop
      for (const s of [60, 61, 62, 63]) ev(out, s, 'snare', 0, 1, 0.4 + (s - 60) * 0.18);
      if (loop % 2 === 0) ev(out, 0, 'crash', 0, 1, 0.8);
      return out;
    },
  },

  airport: {
    bpm: 112, bars: 4, swing: 0, seed: 53,
    build(loop, rand) {
      const bars = ['0..02.3.4...3.2.', '3...2.0.1.......', '0..02.3.4.5.6.5.', '4...3.4.5.......'];
      const out = melodyEvents(bars, { root: 62, scale: PENT_MIN, voice: 'pluck', vel: 0.95, loop, rand, vary: 0.1 });
      if (loop > 0) out.push(...melodyEvents(bars, { root: 50, scale: PENT_MIN, voice: 'brass', vel: 0.45, loop: 0, rand }));
      const chords = [[50, 53, 57], [50, 53, 57], [46, 50, 53], [48, 52, 55]];
      const roots = [38, 38, 34, 36];
      const ost = [0, 0, 12, 0, 7, 0, 12, 10];
      chords.forEach((c, b) => {
        const o = b * 16;
        const stabs = b === 3 ? [[0, 2], [4, 2], [8, 2], [12, 3]] : [[0, 2], [3, 1], [6, 2], [10, 1], [12, 3]];
        for (const [s, d] of stabs) ev(out, o + s, 'brass', c, d, 0.9);
        ost.forEach((iv, i) => ev(out, o + i * 2, 'bass', roots[b] + iv, 1, 0.9));
        for (const s of [0, 4, 8, 12]) ev(out, o + s, 'kick', 0, 1, 1);
        if (rand() < 0.35) ev(out, o + 14, 'kick', 0, 1, 0.6);
        ev(out, o + 4, 'snare', 0, 1, 0.85);
        ev(out, o + 12, 'snare', 0, 1, 0.85);
        for (let s = 0; s < 16; s += 2) ev(out, o + s, s % 4 === 2 ? 'openhat' : 'hat', 0, 1, 0.6);
      });
      if (loop % 2 === 0) ev(out, 0, 'crash', 0, 1, 0.7);
      return out;
    },
  },

  victory: {
    bpm: 112, bars: 8, swing: 0.1, seed: 67, introBars: 2,
    intro() {
      const bars = ['3.5.7.8.a.......', '8.7.8.a.........'];
      const out = melodyEvents(bars, { root: 62, scale: PENT_MAJ, voice: 'pluck', vel: 1 });
      out.push(...melodyEvents(bars, { root: 62, scale: PENT_MAJ, voice: 'bell', vel: 0.5 }));
      ev(out, 8, 'pad', [62, 66, 69], 8, 1.2);
      ev(out, 22, 'pad', [62, 66, 69, 74], 10, 1.2);
      ev(out, 22, 'bell', [74, 78, 81], 8, 0.8);
      ev(out, 0, 'kick', 0, 1, 1);
      ev(out, 8, 'kick', 0, 1, 1);
      [12, 13, 14, 15].forEach((s, i) => ev(out, s, 'snare', 0, 1, 0.4 + i * 0.2));
      ev(out, 22, 'kick', 0, 1, 1);
      ev(out, 22, 'crash', 0, 1, 1);
      ev(out, 22, 'bass', 38, 10, 1);
      return out;
    },
    build(loop, rand) {
      const out = melodyEvents(EXPLORE_MELODY, { root: 62, scale: PENT_MAJ, voice: 'pluck', vel: 0.9, loop: loop + 1, rand, vary: 0.1 });
      walkingBass(out, EXPLORE_BASS, rand, loop + 1);
      exploreDrums(out, 8, rand, loop + 1, { kickExtra: 0.4 });
      EXPLORE_BASS.forEach((r, b) => ev(out, b * 16, 'bell', r + 24, 4, 0.55));
      return out;
    },
  },
};

// ---------- sound effects ----------
// Each takes (audio, out, time, pitch). Pitch multiplies every frequency.

const SFX = {
  chop(a, o, t, p) {
    a._tone(o, t, { type: 'triangle', f0: 190 * p, f1: 85 * p, glide: 0.1, dur: 0.16, peak: 0.7 });
    a._noise(o, t, { type: 'bandpass', freq: 1200 * p, q: 2, dur: 0.09, peak: 0.5 });
    a._noise(o, t, { type: 'highpass', freq: 3000, dur: 0.02, peak: 0.3 });
  },
  hit(a, o, t, p) {
    a._tone(o, t, { type: 'sine', f0: 230 * p, f1: 105 * p, glide: 0.09, dur: 0.12, peak: 0.55 });
    a._noise(o, t, { type: 'bandpass', freq: 2000 * p, q: 1, dur: 0.07, peak: 0.45 });
  },
  saw(a, o, t, p) {
    const { ctx } = a;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900 * p;
    bp.Q.value = 1.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.02);
    g.gain.exponentialRampToValueAtTime(FLOOR, t + 0.38);
    bp.connect(g).connect(o);
    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.setValueAtTime(105 * p, t);
    saw.frequency.linearRampToValueAtTime(130 * p, t + 0.15);
    saw.frequency.linearRampToValueAtTime(95 * p, t + 0.38);
    // amplitude chatter from the chain
    const trem = ctx.createGain();
    trem.gain.value = 0.6;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 32;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.4;
    lfo.connect(lfoAmt).connect(trem.gain);
    saw.connect(trem).connect(bp);
    saw.start(t);
    lfo.start(t);
    saw.stop(t + 0.42);
    lfo.stop(t + 0.42);
    a._noise(o, t, { type: 'bandpass', freq: 3000 * p, q: 1, dur: 0.3, peak: 0.12, attack: 0.02 });
  },
  dig(a, o, t, p) {
    a._tone(o, t, { type: 'sine', f0: 75 * p, f1: 38 * p, glide: 0.25, dur: 0.35, peak: 0.9 });
    const { ctx } = a;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900 * p;
    bp.Q.value = 3;
    bp.connect(o);
    a._tone(bp, t + 0.01, { type: 'square', f0: 310 * p, dur: 0.28, peak: 0.3 });
    a._tone(bp, t + 0.01, { type: 'square', f0: 467 * p, dur: 0.22, peak: 0.25 });
    a._noise(o, t, { type: 'lowpass', freq: 420, dur: 0.32, peak: 0.6 });
  },
  squeak(a, o, t, p) {
    const { ctx } = a;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1800 * p, t);
    osc.frequency.linearRampToValueAtTime(2700 * p, t + 0.05);
    osc.frequency.linearRampToValueAtTime(1600 * p, t + 0.14);
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.01);
    g.gain.exponentialRampToValueAtTime(FLOOR, t + 0.16);
    osc.connect(g).connect(o);
    osc.start(t);
    osc.stop(t + 0.18);
  },
  ratDie(a, o, t, p) {
    const { ctx } = a;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2300 * p, t);
    osc.frequency.exponentialRampToValueAtTime(650 * p, t + 0.32);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 28;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 140 * p;
    lfo.connect(lfoAmt).connect(osc.frequency);
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.01);
    g.gain.exponentialRampToValueAtTime(FLOOR, t + 0.34);
    osc.connect(g).connect(o);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + 0.36);
    lfo.stop(t + 0.36);
    a._tone(o, t + 0.22, { type: 'sine', f0: 140, f1: 60, dur: 0.14, peak: 0.4 });
  },
  bite(a, o, t, p) {
    a._noise(o, t, { type: 'bandpass', freq: 2500 * p, q: 2, dur: 0.05, peak: 0.5 });
    a._noise(o, t + 0.06, { type: 'bandpass', freq: 2200 * p, q: 2, dur: 0.05, peak: 0.4 });
    a._tone(o, t, { type: 'sine', f0: 320 * p, f1: 150 * p, dur: 0.09, peak: 0.4 });
  },
  poison(a, o, t, p) {
    for (let i = 0; i < 6; i++) {
      const f = (280 + Math.random() * 260) * p;
      a._tone(o, t + i * 0.08 + Math.random() * 0.03, { type: 'sine', f0: f, f1: f * 2.1, glide: 0.06, dur: 0.07, peak: 0.22 });
    }
  },
  coin(a, o, t, p) {
    a._tone(o, t, { type: 'square', f0: 988 * p, dur: 0.08, peak: 0.12, attack: 0.002 });
    a._tone(o, t + 0.07, { type: 'square', f0: 1319 * p, dur: 0.26, peak: 0.12, attack: 0.002 });
  },
  sell(a, o, t, p) {
    a._noise(o, t, { type: 'highpass', freq: 5000, dur: 0.05, peak: 0.35 });
    a._tone(o, t, { type: 'square', f0: 180 * p, f1: 120 * p, dur: 0.06, peak: 0.12 });
    for (const [f, d] of [[1568, 0.7], [2093, 0.6], [2637, 0.5]]) a._tone(o, t + 0.07, { type: 'sine', f0: f * p, dur: d, peak: 0.16, attack: 0.002 });
  },
  buy(a, o, t, p) {
    a._tone(o, t, { type: 'triangle', f0: 660 * p, dur: 0.1, peak: 0.3 });
    a._tone(o, t + 0.08, { type: 'triangle', f0: 880 * p, dur: 0.2, peak: 0.3 });
    a._noise(o, t, { type: 'highpass', freq: 6000, dur: 0.04, peak: 0.15 });
  },
  upgrade(a, o, t, p) {
    [587, 740, 880, 1175].forEach((f, i) => {
      a._tone(o, t + i * 0.07, { type: 'triangle', f0: f * p, dur: i === 3 ? 0.45 : 0.12, peak: 0.28 });
      a._tone(o, t + i * 0.07, { type: 'sine', f0: f * 2 * p, dur: i === 3 ? 0.35 : 0.08, peak: 0.06 });
    });
    a._noise(o, t + 0.21, { type: 'highpass', freq: 7000, dur: 0.4, peak: 0.06, attack: 0.05 });
  },
  denied(a, o, t, p) {
    const { ctx } = a;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 800;
    lp.connect(o);
    for (const s of [0, 0.14]) {
      a._tone(lp, t + s, { type: 'square', f0: 110 * p, dur: 0.11, peak: 0.25 });
      a._tone(lp, t + s, { type: 'square', f0: 116 * p, dur: 0.11, peak: 0.2 });
    }
  },
  hurt(a, o, t, p) {
    a._tone(o, t, { type: 'sine', f0: 170 * p, f1: 70 * p, glide: 0.2, dur: 0.24, peak: 0.8 });
    a._tone(o, t, { type: 'triangle', f0: 240 * p, f1: 120 * p, glide: 0.15, dur: 0.16, peak: 0.2 });
    a._noise(o, t, { type: 'lowpass', freq: 600, dur: 0.16, peak: 0.4 });
  },
  down(a, o, t, p) {
    const { ctx } = a;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440 * p, t);
    osc.frequency.exponentialRampToValueAtTime(110 * p, t + 0.8);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 18 * p;
    lfo.connect(lfoAmt).connect(osc.frequency);
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(0.3, t + 0.02);
    g.gain.setValueAtTime(0.3, t + 0.6);
    g.gain.exponentialRampToValueAtTime(FLOOR, t + 0.85);
    osc.connect(g).connect(o);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + 0.9);
    lfo.stop(t + 0.9);
    a._tone(o, t + 0.8, { type: 'sine', f0: 110, f1: 45, dur: 0.3, peak: 0.7 });
    a._noise(o, t + 0.8, { type: 'lowpass', freq: 380, dur: 0.25, peak: 0.4 });
  },
  pickup(a, o, t, p) {
    a._tone(o, t, { type: 'sine', f0: 500 * p, f1: 950 * p, glide: 0.06, dur: 0.09, peak: 0.35 });
  },
  drop(a, o, t, p) {
    a._tone(o, t, { type: 'sine', f0: 130 * p, f1: 58 * p, glide: 0.12, dur: 0.17, peak: 0.7 });
    a._noise(o, t, { type: 'lowpass', freq: 320, dur: 0.12, peak: 0.4 });
  },
  shutter(a, o, t, p) {
    a._noise(o, t, { type: 'highpass', freq: 4000, dur: 0.015, peak: 0.6 });
    a._tone(o, t, { type: 'square', f0: 900 * p, dur: 0.012, peak: 0.12 });
    a._noise(o, t + 0.07, { type: 'highpass', freq: 3500, dur: 0.02, peak: 0.5 });
    a._tone(o, t + 0.09, { type: 'sine', f0: 3000 * p, f1: 6200 * p, glide: 0.4, dur: 0.45, peak: 0.05, attack: 0.05 });
  },
  boo(a, o, t, p) {
    const { ctx } = a;
    for (let i = 0; i < 6; i++) {
      const f = (140 + Math.random() * 90) * p;
      const st = t + Math.random() * 0.15;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 500 + Math.random() * 250;
      bp.Q.value = 2.5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(FLOOR, st);
      g.gain.linearRampToValueAtTime(0.13, st + 0.25);
      g.gain.setValueAtTime(0.13, st + 1.0);
      g.gain.exponentialRampToValueAtTime(FLOOR, st + 1.45);
      bp.connect(g).connect(o);
      const osc = ctx.createOscillator();
      osc.type = i % 2 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(f, st);
      osc.frequency.linearRampToValueAtTime(f * 0.82, st + 1.4);
      osc.connect(bp);
      osc.start(st);
      osc.stop(st + 1.5);
    }
    a._noise(o, t, { type: 'bandpass', freq: 650, q: 1.2, dur: 1.5, peak: 0.12, attack: 0.3 });
  },
  cheer(a, o, t, p) {
    a._noise(o, t, { type: 'bandpass', freq: 1800 * p, f1: 2400 * p, q: 0.9, dur: 1.5, peak: 0.2, attack: 0.25 });
    for (let i = 0; i < 5; i++) {
      const f = (280 + Math.random() * 160) * p;
      const st = t + Math.random() * 0.3;
      a._tone(o, st, { type: 'triangle', f0: f, f1: f * 1.6, glide: 0.4, dur: 0.6 + Math.random() * 0.4, peak: 0.07, attack: 0.08 });
    }
    a._tone(o, t + 0.25, { type: 'sine', f0: 1800 * p, f1: 2500 * p, glide: 0.25, dur: 0.45, peak: 0.06, attack: 0.03 });
  },
  jail(a, o, t, p) {
    for (const [f, d, g] of [[220, 0.9, 0.3], [563, 0.7, 0.2], [891, 0.5, 0.15], [1237, 0.4, 0.12]]) {
      a._tone(o, t, { type: 'sine', f0: f * p, dur: d, peak: g, attack: 0.001 });
    }
    a._noise(o, t, { type: 'bandpass', freq: 2000, q: 1.5, dur: 0.08, peak: 0.5 });
    a._tone(o, t, { type: 'sine', f0: 90, f1: 50, dur: 0.2, peak: 0.5 });
  },
  splash(a, o, t, p) {
    a._noise(o, t, { type: 'lowpass', freq: 4500 * p, f1: 500 * p, q: 0.8, dur: 0.6, peak: 0.6, attack: 0.01 });
    for (let i = 0; i < 6; i++) {
      const f = (800 + Math.random() * 700) * p;
      a._tone(o, t + 0.1 + Math.random() * 0.45, { type: 'sine', f0: f, f1: f * 1.5, glide: 0.04, dur: 0.06, peak: 0.12 });
    }
  },
  collapse(a, o, t, p) {
    a._noise(o, t, { type: 'lowpass', freq: 320 * p, q: 0.7, dur: 2.0, peak: 1.0, attack: 0.04 });
    a._tone(o, t, { type: 'sine', f0: 55 * p, f1: 28 * p, glide: 1.6, dur: 1.9, peak: 0.8, attack: 0.03 });
    for (let i = 0; i < 9; i++) {
      a._noise(o, t + 0.1 + Math.random() * 1.4, { type: 'bandpass', freq: (600 + Math.random() * 900) * p, q: 1.2, dur: 0.12 + Math.random() * 0.2, peak: 0.35 });
    }
  },
  crumble(a, o, t, p) {
    a._noise(o, t, { type: 'lowpass', freq: 900 * p, dur: 0.5, peak: 0.6 });
    for (let i = 0; i < 4; i++) {
      a._noise(o, t + Math.random() * 0.35, { type: 'bandpass', freq: (900 + Math.random() * 1200) * p, q: 1.5, dur: 0.08, peak: 0.3 });
    }
  },
  jet(a, o, t, p) {
    const { ctx } = a;
    const g = ctx.createGain();
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(0.7, t + 2.0);
    g.gain.exponentialRampToValueAtTime(FLOOR, t + 3.0);
    g.connect(o);
    a._noise(g, t, { type: 'bandpass', freq: 800 * p, f1: 1600 * p, q: 0.7, dur: 3.0, peak: 0.8, attack: 0.01 });
    a._noise(g, t, { type: 'lowpass', freq: 200, dur: 3.0, peak: 0.9, attack: 0.01 });
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    lp.connect(g);
    a._tone(lp, t, { type: 'sawtooth', f0: 600 * p, f1: 1800 * p, glide: 2.4, dur: 3.0, peak: 0.05, attack: 0.5 });
  },
  milk(a, o, t, p) {
    for (const [s, f] of [[0, 2600], [0.08, 2900]]) {
      a._tone(o, t + s, { type: 'sine', f0: f * p, dur: 0.25, peak: 0.16, attack: 0.001 });
      a._tone(o, t + s, { type: 'sine', f0: f * 1.5 * p, dur: 0.15, peak: 0.07, attack: 0.001 });
    }
    a._tone(o, t + 0.16, { type: 'triangle', f0: 880 * p, f1: 1320 * p, glide: 0.08, dur: 0.22, peak: 0.25 });
  },
  quest(a, o, t, p) {
    [440, 587, 740, 880].forEach((f, i) => a._tone(o, t + i * 0.09, { type: 'triangle', f0: f * p, dur: 0.2, peak: 0.26 }));
    for (const f of [1175, 1480, 1760]) a._tone(o, t + 0.36, { type: 'sine', f0: f * p, dur: 0.8, peak: 0.1 });
  },
  nest(a, o, t, p) {
    for (let i = 0; i < 7; i++) {
      a._noise(o, t + Math.random() * 0.35, { type: 'bandpass', freq: (1500 + Math.random() * 1500) * p, q: 3, dur: 0.03 + Math.random() * 0.04, peak: 0.45 });
    }
    a._tone(o, t, { type: 'sine', f0: 120 * p, f1: 60 * p, dur: 0.2, peak: 0.5 });
  },
  gift(a, o, t, p) {
    [1568, 1760, 2093, 2349, 2637, 3136].forEach((f, i) => a._tone(o, t + i * 0.045, { type: 'sine', f0: f * p, dur: 0.3, peak: 0.1, attack: 0.002 }));
    a._tone(o, t, { type: 'triangle', f0: 587 * p, dur: 0.5, peak: 0.12, attack: 0.05 });
    a._tone(o, t, { type: 'triangle', f0: 880 * p, dur: 0.5, peak: 0.1, attack: 0.05 });
  },
  click(a, o, t, p) {
    a._noise(o, t, { type: 'highpass', freq: 2000, dur: 0.02, peak: 0.25 });
    a._tone(o, t, { type: 'sine', f0: 1200 * p, dur: 0.03, peak: 0.15 });
  },
  warning(a, o, t, p) {
    const { ctx } = a;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2000;
    lp.connect(o);
    for (let i = 0; i < 6; i++) {
      a._tone(lp, t + i * 0.25, { type: 'square', f0: (i % 2 ? 880 : 660) * p, dur: 0.24, peak: 0.12, attack: 0.01 });
    }
  },
  victory(a, o, t, p) {
    const lead = [587, 740, 880, 1175, 0, 988, 1175, 1319, 1480];
    lead.forEach((f, i) => {
      if (!f) return;
      const last = i === lead.length - 1;
      a._tone(o, t + i * 0.13, { type: 'triangle', f0: f * p, dur: last ? 1.4 : 0.18, peak: 0.26 });
      a._tone(o, t + i * 0.13, { type: 'sine', f0: f * 2 * p, dur: last ? 0.8 : 0.1, peak: 0.05 });
    });
    for (const [s, f] of [[0, 147], [0.52, 196], [1.04, 220]]) a._tone(o, t + s, { type: 'triangle', f0: f * p, dur: 0.5, peak: 0.3 });
    const end = t + lead.length * 0.13;
    for (const f of [587, 740, 880, 1175]) a._tone(o, end, { type: 'sine', f0: f * p, dur: 1.8, peak: 0.1, attack: 0.01 });
    a._tone(o, end, { type: 'triangle', f0: 147 * p, dur: 1.8, peak: 0.3 });
    a._noise(o, end, { type: 'bandpass', freq: 2000, q: 0.9, dur: 1.6, peak: 0.12, attack: 0.2 });
  },
  tree(a, o, t, p) {
    const { ctx } = a;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 420 * p;
    bp.Q.value = 8;
    bp.connect(o);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(82 * p, t);
    osc.frequency.linearRampToValueAtTime(58 * p, t + 0.6);
    const wob = ctx.createOscillator();
    wob.frequency.value = 11;
    const wobAmt = ctx.createGain();
    wobAmt.gain.value = 9 * p;
    wob.connect(wobAmt).connect(osc.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(0.4, t + 0.1);
    g.gain.exponentialRampToValueAtTime(FLOOR, t + 0.62);
    osc.connect(g).connect(bp);
    osc.start(t);
    wob.start(t);
    osc.stop(t + 0.65);
    wob.stop(t + 0.65);
    a._tone(o, t + 0.6, { type: 'sine', f0: 95 * p, f1: 40 * p, glide: 0.3, dur: 0.42, peak: 0.85 });
    a._noise(o, t + 0.6, { type: 'lowpass', freq: 420, dur: 0.3, peak: 0.5 });
    a._noise(o, t + 0.58, { type: 'highpass', freq: 3000, dur: 0.45, peak: 0.12, attack: 0.03 });
  },
  help(a, o, t, p) {
    for (const [f, g] of [[784, 0.16], [1175, 0.1], [1568, 0.07]]) a._tone(o, t, { type: 'sine', f0: f * p, dur: 1.0, peak: g, attack: 0.03 });
    a._tone(o, t + 0.18, { type: 'sine', f0: 988 * p, dur: 0.8, peak: 0.1, attack: 0.03 });
  },
};

// ---------- engine ----------

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.failed = false;
    this.mode = 'off';
    this.players = [];
    this.timer = null;
    this.lastSfx = new Map();
    this.vol = { master: 0.9, music: 0.45, sfx: 0.8 };
    this._muted = false;
  }

  unlock() {
    if (this.failed) return;
    try {
      if (!this.ctx) {
        const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
        if (!AC) {
          this.failed = true;
          return;
        }
        this.ctx = new AC();
        this._buildGraph();
        this.timer = setInterval(() => this._tick(), TICK_MS);
        if (this.mode !== 'off') this._startMode(this.mode, 1.0);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) {
      this.failed = true;
      this.ctx = null;
    }
  }

  _buildGraph() {
    const ctx = this.ctx;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 10;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.005;
    this.comp.release.value = 0.2;
    this.comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this._muted ? 0 : this.vol.master;
    this.master.connect(this.comp);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.vol.music;
    this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.vol.sfx;
    this.sfxBus.connect(this.master);
    const len = Math.floor(ctx.sampleRate * 2);
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  setMusic(mode) {
    if (!(mode in MODES) && mode !== 'off') return;
    if (mode === this.mode) return;
    this.mode = mode;
    if (!this.ctx) return;
    try {
      this._startMode(mode, FADE);
    } catch (e) {
      // ignore: audio must never break the game
    }
  }

  _startMode(mode, fade) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    for (const p of this.players) {
      if (p.stopAt !== Infinity) continue;
      p.gain.gain.cancelScheduledValues(now);
      p.gain.gain.setValueAtTime(p.gain.gain.value, now);
      p.gain.gain.linearRampToValueAtTime(0, now + fade);
      p.stopAt = now + fade + 0.1;
    }
    if (mode === 'off') return;
    const cfg = MODES[mode];
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + fade);
    gain.connect(this.musicBus);
    const p = { mode, cfg, gain, step: 0, loop: 0, nextTime: now + 0.06, intro: !!cfg.intro, events: null, length: 0, stopAt: Infinity };
    this._prepare(p);
    this.players.push(p);
  }

  _prepare(p) {
    const { cfg } = p;
    const rand = rng(p.loop * 7919 + cfg.seed);
    const list = p.intro ? cfg.intro(rand) : cfg.build(p.loop, rand);
    p.length = (p.intro ? cfg.introBars : cfg.bars) * 16;
    p.events = new Array(p.length);
    for (const e of list) {
      if (e.step < 0 || e.step >= p.length) continue;
      (p.events[e.step] ||= []).push(e);
    }
  }

  _tick() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    try {
      for (let i = this.players.length - 1; i >= 0; i--) {
        const p = this.players[i];
        if (now > p.stopAt) {
          p.gain.disconnect();
          this.players.splice(i, 1);
          continue;
        }
        const spb = 60 / p.cfg.bpm / 4;
        // a throttled background tab falls behind: skip ahead rather than burst
        if (p.nextTime < now - 0.25) p.nextTime = now + 0.02;
        while (p.nextTime < now + LOOKAHEAD) {
          const t = p.nextTime + (p.step % 2 ? p.cfg.swing * spb : 0);
          if (t < p.stopAt) {
            const list = p.events[p.step];
            if (list) for (const e of list) this._playEvent(p, e, t, spb);
          }
          p.nextTime += spb;
          p.step++;
          if (p.step >= p.length) {
            p.step = 0;
            if (p.intro) p.intro = false;
            else p.loop++;
            this._prepare(p);
          }
        }
      }
    } catch (e) {
      // keep the scheduler alive no matter what a voice does
    }
  }

  _playEvent(p, e, t, spb) {
    const fn = VOICES[e.v];
    if (!fn) return;
    const dur = e.d * spb;
    if (Array.isArray(e.n)) for (const n of e.n) fn(this, p.gain, t, n, dur, e.g);
    else fn(this, p.gain, t, e.n, dur, e.g);
  }

  // ---------- building blocks ----------

  _tone(out, t, { type = 'sine', f0, f1 = f0, glide, dur, peak = 0.5, attack = 0.005 }) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(f0, 1), t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + (glide ?? dur));
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(Math.max(peak, FLOOR * 2), t + attack);
    g.gain.exponentialRampToValueAtTime(FLOOR, t + Math.max(dur, attack + 0.01));
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    return osc;
  }

  _noise(out, t, { type = 'bandpass', freq = 1000, f1, q = 1, dur, peak = 0.5, attack = 0.003, rate = 1 }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = rate;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (f1) filter.frequency.exponentialRampToValueAtTime(f1, t + dur);
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(Math.max(peak, FLOOR * 2), t + attack);
    g.gain.exponentialRampToValueAtTime(FLOOR, t + Math.max(dur, attack + 0.01));
    src.connect(filter).connect(g).connect(out);
    const maxOffset = Math.max(0, this.noiseBuf.duration - dur - 0.1);
    src.start(t, Math.random() * maxOffset);
    src.stop(t + dur + 0.05);
    return src;
  }

  _outNode(volume, pan) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = volume;
    let tail = g;
    if (pan && ctx.createStereoPanner) {
      const pn = ctx.createStereoPanner();
      pn.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(pn);
      tail = pn;
    }
    tail.connect(this.sfxBus);
    setTimeout(() => {
      try {
        tail.disconnect();
        if (tail !== g) g.disconnect();
      } catch (e) {
        // already gone
      }
    }, 5000);
    return g;
  }

  // ---------- public ----------

  sfx(name, opts = {}) {
    if (!this.ctx || this.failed) return;
    const fn = SFX[name];
    if (!fn) return;
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const last = this.lastSfx.get(name) || 0;
    if (nowMs - last < 40) return;
    this.lastSfx.set(name, nowMs);
    const { volume = 1, pitch = 1, pan = 0 } = opts;
    try {
      const out = this._outNode(volume, pan);
      fn(this, out, this.ctx.currentTime + 0.005, pitch);
    } catch (e) {
      // ignore
    }
  }

  step(intensity = 1) {
    if (!this.ctx || this.failed) return;
    try {
      const out = this._outNode(Math.max(0, Math.min(1.5, intensity)), 0);
      const t = this.ctx.currentTime + 0.003;
      this._noise(out, t, { type: 'lowpass', freq: 400 + Math.random() * 300, dur: 0.06, peak: 0.16 });
      this._tone(out, t, { type: 'sine', f0: 95 + Math.random() * 15, f1: 60, dur: 0.05, peak: 0.1 });
    } catch (e) {
      // ignore
    }
  }

  setVolumes({ master, music, sfx } = {}) {
    if (master !== undefined) this.vol.master = Math.max(0, Math.min(1, master));
    if (music !== undefined) this.vol.music = Math.max(0, Math.min(1, music));
    if (sfx !== undefined) this.vol.sfx = Math.max(0, Math.min(1, sfx));
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this._muted ? 0 : this.vol.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vol.music, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
  }

  get muted() {
    return this._muted;
  }

  toggleMute() {
    this._muted = !this._muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this._muted ? 0 : this.vol.master, this.ctx.currentTime, 0.05);
    return this._muted;
  }
}

export const audio = new GameAudio();
