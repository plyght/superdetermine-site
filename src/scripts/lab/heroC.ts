/**
 * Option C: a file in superposition.
 *
 * One source file is drawn as its silhouette, the way an editor minimap draws
 * it: a rounded bar per token, indented, with a few tokens picked out in an
 * accent. Several captured states of that file are drawn at once. Each state
 * carries a weight that breathes over time and travels down the file as a
 * wave, so where the states agree a token reads solid and where they disagree
 * it shimmers between its alternatives, with faint tints on what each capture
 * added or cut.
 *
 * A measurement is a scan line that sweeps down the file. Where it passes, the
 * file collapses to one definite state, the latest one that passed, with a
 * quiet green mark in the gutter, and then decoheres back into superposition
 * behind it. The pointer is a second detector: the lines under it collapse
 * while it rests there. After each sweep a new capture joins the set and the
 * oldest leaves, so the file keeps moving the way a worktree does.
 */

type Kind = 0 | 1 | 2 | 3 | 4;
const KW: Kind = 0;
const ID: Kind = 1;
const STR: Kind = 2;
const COM: Kind = 3;
const PUN: Kind = 4;

interface Tok {
  /** Start column, counted from the left edge of the file, indent included. */
  x: number;
  len: number;
  kind: Kind;
  /** Change against the previous capture: 1 grew or arrived, -1 shrank. */
  d: -1 | 0 | 1;
}

type Line = Tok[] | null;

interface Version {
  id: number;
  lines: Line[];
  passes: boolean;
  /** Clock time this capture joined the set, and when it started to leave. */
  born: number;
  dying: number;
  /** Breathing rate and phase of this capture's weight. */
  omega: number;
  phase: number;
  /** How fast the weight wave travels down the file, in radians per line. */
  kappa: number;
}

interface Palette {
  ink: [number, number, number];
  pass: [number, number, number];
  add: [number, number, number];
  del: [number, number, number];
  str: [number, number, number];
}

const SLOTS = 72;
const MAX_COLS = 38;
const CAPTURES = 6;

/** Brightness of each token kind, as an alpha on the ink colour. */
const KIND_ALPHA: Record<Kind, number> = { 0: 0.88, 1: 0.5, 2: 0.62, 3: 0.2, 4: 0.34 };

const SWEEP_S = 2.7;
const IDLE_S = 2.1;
const FIRST_SWEEP_S = 1.9;
const HOLD_S = 0.55;
const DECAY_S = 1.5;
const INTRO_S = 1.2;
const CROSSFADE_S = 1.4;

const MAX_DPR = 2;
const TRIGGER_SELECTOR = ".buy-btn";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};

/* ------------------------------------------------------------------ file -- */

function makeLine(rng: () => number, indent: number, kinds: Kind[], lens: number[]): Tok[] {
  const toks: Tok[] = [];
  let x = indent * 2;
  for (let i = 0; i < kinds.length; i++) {
    const len = lens[i]!;
    if (x + len > MAX_COLS) break;
    toks.push({ x, len, kind: kinds[i]!, d: 0 });
    x += len + (rng() < 0.18 ? 0 : 1);
  }
  return toks;
}

const between = (rng: () => number, lo: number, hi: number): number =>
  lo + Math.floor(rng() * (hi - lo + 1));

function statement(rng: () => number, indent: number): Tok[] {
  const r = rng();
  if (r < 0.08) return makeLine(rng, indent, [COM], [between(rng, 12, 26)]);
  const kinds: Kind[] = [];
  const lens: number[] = [];
  if (r < 0.5) {
    kinds.push(KW);
    lens.push(between(rng, 3, 6));
  }
  const n = between(rng, 1, 4);
  for (let i = 0; i < n; i++) {
    const s = rng();
    if (s < 0.16) {
      kinds.push(STR);
      lens.push(between(rng, 5, 13));
    } else if (s < 0.3) {
      kinds.push(PUN);
      lens.push(between(rng, 1, 2));
    } else {
      kinds.push(ID);
      lens.push(between(rng, 3, 11));
    }
  }
  if (rng() < 0.4) {
    kinds.push(PUN);
    lens.push(1);
  }
  return makeLine(rng, indent, kinds, lens);
}

function generateFile(rng: () => number): Line[] {
  const lines: Line[] = [];
  let indent = 0;
  let inBlock = 0;
  while (lines.length < SLOTS) {
    if (indent === 0) {
      if (rng() < 0.3) lines.push(makeLine(rng, 0, [KW, ID, STR], [6, between(rng, 6, 10), 9]));
      else
        lines.push(
          makeLine(
            rng,
            0,
            [KW, ID, PUN, ID, PUN],
            [between(rng, 5, 8), between(rng, 6, 13), 1, between(rng, 4, 12), 2],
          ),
        );
      indent = 1;
      inBlock = 0;
      continue;
    }
    const r = rng();
    inBlock++;
    if (r < 0.1 && indent > 1) {
      indent--;
      lines.push(makeLine(rng, indent, [PUN], [1]));
    } else if (r < 0.15) {
      lines.push(null);
    } else if (r < 0.27 && indent < 4) {
      lines.push(
        makeLine(rng, indent, [KW, ID, PUN], [between(rng, 2, 5), between(rng, 5, 16), 1]),
      );
      indent++;
    } else if (r < 0.36 && inBlock > 7) {
      while (indent > 0) {
        indent--;
        lines.push(makeLine(rng, indent, [PUN], [1]));
      }
      lines.push(null);
    } else {
      lines.push(statement(rng, indent));
    }
  }
  return lines.slice(0, SLOTS);
}

function reflow(line: Tok[]): void {
  for (let i = 1; i < line.length; i++) {
    const prev = line[i - 1]!;
    const tok = line[i]!;
    tok.x = prev.x + prev.len + 1;
  }
  while (line.length && line[line.length - 1]!.x + line[line.length - 1]!.len > MAX_COLS) {
    line.pop();
  }
}

function indentOf(lines: Line[], slot: number): number {
  for (let s = slot; s >= 0; s--) {
    const line = lines[s];
    if (line && line.length) return Math.round(line[0]!.x / 2);
  }
  return 1;
}

/** A new capture: the previous one with a handful of edits made to it. */
function mutate(rng: () => number, prev: Line[]): Line[] {
  const lines: Line[] = prev.map((line) =>
    line ? line.map((t) => ({ ...t, d: 0 as const })) : null,
  );
  const edits = between(rng, 11, 16);
  // Edits cluster, the way real work does: they land around a couple of spots.
  const foci = [Math.floor(rng() * 36), Math.floor(rng() * 36)];
  for (let e = 0; e < edits; e++) {
    const focus = foci[e % 2]!;
    const slot = Math.min(SLOTS - 1, Math.max(0, focus + Math.round((rng() - 0.5) * 18)));
    const line = lines[slot];
    const op = rng();
    if (!line) {
      if (op < 0.6) {
        const fresh = statement(rng, indentOf(lines, slot));
        fresh.forEach((t) => (t.d = 1));
        lines[slot] = fresh;
      }
      continue;
    }
    if (line.length === 0) continue;
    const i = Math.floor(rng() * line.length);
    const tok = line[i]!;
    if (op < 0.45) {
      const next = Math.max(1, tok.len + between(rng, -4, 5));
      if (next !== tok.len) {
        tok.d = next > tok.len ? 1 : -1;
        tok.len = next;
        reflow(line);
      }
    } else if (op < 0.68) {
      line.splice(i + 1, 0, { x: 0, len: between(rng, 2, 8), kind: rng() < 0.2 ? STR : ID, d: 1 });
      reflow(line);
    } else if (op < 0.84 && line.length > 2) {
      line.splice(i, 1);
      const neighbour = line[Math.min(i, line.length - 1)];
      if (neighbour) neighbour.d = -1;
      reflow(line);
    } else if (op < 0.92 && line[0]!.kind !== KW) {
      lines[slot] = null;
    } else {
      line.splice(0, line.length, ...statement(rng, Math.round(line[0]!.x / 2)));
      line.forEach((t) => (t.d = 1));
    }
  }
  return lines;
}

/* --------------------------------------------------------------- colours -- */

function resolvePalette(host: HTMLElement): Palette {
  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;visibility:hidden";
  host.append(probe);
  const pixel = document.createElement("canvas");
  pixel.width = pixel.height = 1;
  const pctx = pixel.getContext("2d", { willReadFrequently: true });

  const read = (name: string, fallback: [number, number, number]): [number, number, number] => {
    probe.style.color = `var(${name})`;
    const computed = getComputedStyle(probe).color;
    if (!pctx || !computed) return fallback;
    // Computed colours can come back in any CSS colour space, so the canvas
    // does the conversion: paint one pixel and read it back as sRGB.
    pctx.clearRect(0, 0, 1, 1);
    pctx.fillStyle = "rgb(1, 2, 3)";
    pctx.fillStyle = computed;
    pctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = pctx.getImageData(0, 0, 1, 1).data;
    if (!a) return fallback;
    return [r!, g!, b!];
  };

  const palette: Palette = {
    ink: read("--hc-ink", [255, 255, 255]),
    pass: read("--hc-pass", [61, 220, 132]),
    add: read("--hc-add", [61, 220, 132]),
    del: read("--hc-del", [255, 95, 82]),
    str: read("--hc-str", [245, 181, 68]),
  };
  probe.remove();
  return palette;
}

const rgba = (c: [number, number, number], a: number): string =>
  `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${Math.max(0, Math.min(1, a)).toFixed(4)})`;

const mixRgb = (
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

/* ------------------------------------------------------------------ init -- */

export function initHeroC(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  stage: HTMLElement,
): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const rng = mulberry32((Math.random() * 2 ** 32) >>> 0);
  let palette = resolvePalette(host);

  let nextId = 0;
  const newVersion = (lines: Line[], passes: boolean, born: number): Version => ({
    id: nextId++,
    lines,
    passes,
    born,
    dying: Infinity,
    omega: 0.55 + rng() * 0.8,
    phase: rng() * Math.PI * 2,
    kappa: 0.18 + rng() * 0.32,
  });

  // The captures start out already in place, so the first frame is a full
  // superposition rather than one state waiting for the others.
  const versions: Version[] = [];
  {
    let lines = generateFile(rng);
    for (let k = 0; k < CAPTURES; k++) {
      if (k > 0) lines = mutate(rng, lines);
      versions.push(newVersion(lines, k === 0 || rng() < 0.5, -10));
    }
    if (!versions.some((v, k) => k > 0 && v.passes)) versions[CAPTURES - 2]!.passes = true;
  }

  const latestPassing = (): Version =>
    [...versions].reverse().find((v) => v.passes && v.dying === Infinity) ?? versions[0]!;

  /* Layout, in CSS pixels relative to the canvas. */
  let cssW = 1;
  let cssH = 1;
  let dpr = 1;
  let ox = 0;
  let oy = 0;
  let cw = 8;
  let lh = 12;
  let barH = 5;
  let rows = 0;
  let stageW = 0;

  function layout(): void {
    const hostRect = host.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    cssW = Math.max(1, hostRect.width);
    cssH = Math.max(1, hostRect.height);
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));

    stageW = stageRect.width;
    const cols = stageW < 480 ? 40 : 46;
    cw = stageW / cols;
    lh = Math.min(Math.max(cw * 1.32, 9), 15.5);
    barH = Math.max(3, Math.round(lh * 0.42 * 2) / 2);
    ox = stageRect.left - hostRect.left;
    oy = stageRect.top - hostRect.top;
    rows = Math.min(SLOTS, Math.floor(stageRect.height / lh));
  }

  /* Measurement state. */
  const measuredAt = new Float64Array(SLOTS).fill(-Infinity);
  const measuredBy: Array<Version | null> = new Array(SLOTS).fill(null);
  let sweepStart = -1;
  let sweepVersion: Version | null = null;
  let nextSweep = FIRST_SWEEP_S;
  let advanceAt = Infinity;

  let pointerY = 0;
  let pointerOn = 0;
  let pointerTarget = 0;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let clock = 0;
  let lastFrame = performance.now();
  let rafId = 0;
  let running = false;
  let visible = true;

  function startSweep(): void {
    if (sweepStart >= 0) return;
    sweepStart = clock;
    sweepVersion = latestPassing();
    advanceAt = Infinity;
    host.dataset.hcPhase = "measuring";
  }

  /** A new capture joins and the oldest one leaves, both by crossfade. */
  function advance(): void {
    const alive = versions.filter((v) => v.dying === Infinity);
    const newest = alive[alive.length - 1]!;
    const fresh = newVersion(mutate(rng, newest.lines), rng() < 0.55, clock);
    versions.push(fresh);
    alive[0]!.dying = clock;
    if (!versions.some((v) => v.passes && v.dying === Infinity)) fresh.passes = true;
  }

  function update(dt: number): void {
    clock += dt;

    pointerOn += (pointerTarget - pointerOn) * (1 - Math.exp(-dt / 0.18));

    for (let i = versions.length - 1; i >= 0; i--) {
      if (clock - versions[i]!.dying > CROSSFADE_S) versions.splice(i, 1);
    }

    if (sweepStart < 0 && clock >= nextSweep) startSweep();

    if (sweepStart >= 0) {
      const travel = (rows + 6) * lh;
      const y = ((clock - sweepStart) / SWEEP_S) * travel - 3 * lh;
      for (let s = 0; s < rows; s++) {
        const slotY = (s + 0.5) * lh;
        if (y >= slotY && measuredAt[s]! < sweepStart) {
          measuredAt[s] = clock - (y - slotY) / (travel / SWEEP_S);
          measuredBy[s] = sweepVersion;
        }
      }
      if (clock - sweepStart >= SWEEP_S) {
        sweepStart = -1;
        host.dataset.hcPhase = "superposed";
        advanceAt = clock + HOLD_S + DECAY_S * 0.6;
        nextSweep = clock + IDLE_S + HOLD_S + DECAY_S;
      }
    }

    if (clock >= advanceAt) {
      advanceAt = Infinity;
      advance();
    }
  }

  /** Collapse of one line, 0 in superposition and 1 fully measured. */
  function collapseOf(s: number): number {
    const age = clock - measuredAt[s]!;
    const scan = age < 0 ? 0 : smooth(0, 0.16, age) * (1 - smooth(HOLD_S, HOLD_S + DECAY_S, age));
    const dy = ((s + 0.5) * lh - pointerY) / (lh * 2.4);
    const point = pointerOn * Math.exp(-dy * dy);
    return Math.max(scan, point);
  }

  function lifeOf(v: Version): number {
    const inn = smooth(0, CROSSFADE_S, clock - v.born);
    const out = v.dying === Infinity ? 1 : 1 - smooth(0, CROSSFADE_S, clock - v.dying);
    return inn * out;
  }

  function bar(x: number, y: number, w: number, h: number): void {
    if (w <= 0) return;
    const r = Math.min(h / 2, w / 2);
    ctx!.beginPath();
    if (typeof ctx!.roundRect === "function") ctx!.roundRect(x, y, w, h, r);
    else ctx!.rect(x, y, w, h);
    ctx!.fill();
  }

  function tokColour(t: Tok, tint: number): [number, number, number] {
    const base = t.kind === STR ? palette.str : palette.ink;
    if (!t.d || tint <= 0) return base;
    return mixRgb(base, t.d > 0 ? palette.add : palette.del, tint);
  }

  const weights = new Float64Array(16);

  function draw(still: boolean): void {
    const c = ctx!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cssW, cssH);
    if (rows <= 0) return;

    const intro = still ? 1 : smooth(0, INTRO_S, clock);
    const ghostFloor = still ? 0.3 : 0.05;
    const gutterX = ox;
    const fileX = ox + cw * 2.4;
    const gap = Math.max(1, cw * 0.28);
    const t = clock;

    // Where the measurement has reached, if one is under way.
    let scanY = -1;
    if (!still && sweepStart >= 0) {
      const travel = (rows + 6) * lh;
      scanY = oy + ((clock - sweepStart) / SWEEP_S) * travel - 3 * lh;
    }

    for (let s = 0; s < rows; s++) {
      const y = oy + s * lh + (lh - barH) / 2;
      const fade = (1 - smooth(rows - 6, rows, s + 0.5)) * intro;
      if (fade <= 0.001) continue;

      const col = collapseOf(s);
      const superF = Math.max(1 - col, ghostFloor) * fade;

      // Gutter: a faint tick for every line, which turns into the pass mark.
      c.fillStyle = rgba(palette.ink, 0.07 * fade);
      bar(gutterX, y + barH * 0.25, Math.max(2, cw * 0.32), barH * 0.5);

      /* Superposition. */
      if (superF > 0.003) {
        let total = 0;
        for (let k = 0; k < versions.length; k++) {
          const v = versions[k]!;
          const wave = 0.5 + 0.5 * Math.sin(t * v.omega + s * v.kappa + v.phase);
          const w = (0.12 + wave * wave) * lifeOf(v);
          weights[k] = w;
          total += w;
        }
        c.globalCompositeOperation = "lighter";
        for (let k = 0; k < versions.length; k++) {
          const v = versions[k]!;
          const line = v.lines[s];
          if (!line || !line.length) continue;
          const w = weights[k]! / (total || 1);
          // Each state wanders a little on its own beat, and is echoed either
          // side of itself so overlapping states build interference fringes.
          const wander = Math.sin(t * (1.3 + v.omega) + s * 0.7 + v.id * 2.3) * cw * 0.7;
          const spread =
            (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 0.8 + s * 0.42 + v.id))) * cw * 1.1 +
            (1 - intro) * cw * 3;
          for (const tok of line) {
            const a = KIND_ALPHA[tok.kind] * w * superF * 0.9;
            if (a < 0.004) continue;
            const x = fileX + tok.x * cw + gap / 2 + wander;
            const wPx = tok.len * cw - gap;
            c.fillStyle = rgba(tokColour(tok, 0.55), a);
            bar(x, y, wPx, barH);
            c.fillStyle = rgba(tokColour(tok, 0.55), a * 0.3);
            bar(x - spread, y, wPx, barH);
            bar(x + spread, y, wPx, barH);
          }
        }
        c.globalCompositeOperation = "source-over";
      }

      /* The measured state. */
      if (col > 0.003) {
        const v = measuredBy[s] && pointerOn < 0.5 ? measuredBy[s]! : latestPassing();
        const line = v.lines[s];
        const a = col * fade;
        c.fillStyle = rgba(palette.pass, 0.95 * a);
        bar(gutterX, y - 1, Math.max(2, cw * 0.32), barH + 2);
        if (line && line.length) {
          const first = line[0]!;
          const last = line[line.length - 1]!;
          const x0 = fileX + first.x * cw;
          const x1 = fileX + (last.x + last.len) * cw;
          // The pass glow: a soft green wash behind the definite line.
          c.fillStyle = rgba(palette.pass, 0.065 * a);
          bar(x0 - cw * 0.5, y - barH * 0.45, x1 - x0 + cw, barH * 1.9);
          for (const tok of line) {
            const ink = mixRgb(tok.kind === STR ? palette.str : palette.ink, palette.pass, 0.16);
            c.fillStyle = rgba(ink, Math.min(1, KIND_ALPHA[tok.kind] * 1.08) * a);
            bar(fileX + tok.x * cw + gap / 2, Math.round(y * dpr) / dpr, tok.len * cw - gap, barH);
          }
        }
      }
    }

    // The scan line itself: a hairline that fades out at both ends.
    if (scanY >= 0) {
      const x0 = ox - cw * 1.5;
      const x1 = ox + stageW + cw * 1.5;
      const grad = c.createLinearGradient(x0, 0, x1, 0);
      grad.addColorStop(0, rgba(palette.pass, 0));
      grad.addColorStop(0.15, rgba(palette.pass, 0.55));
      grad.addColorStop(0.85, rgba(palette.pass, 0.55));
      grad.addColorStop(1, rgba(palette.pass, 0));
      c.fillStyle = grad;
      const yLine = Math.round(scanY * dpr) / dpr;
      c.globalAlpha = 0.18;
      c.fillRect(x0, yLine - 2, x1 - x0, 5);
      c.globalAlpha = 1;
      c.fillRect(x0, yLine, x1 - x0, 1);
    }
  }

  function renderStill(): void {
    // The finished state: the file measured, the passing capture definite, and
    // the other captures left as faint ghosts beneath it.
    for (let s = 0; s < SLOTS; s++) {
      measuredAt[s] = 0;
      measuredBy[s] = latestPassing();
    }
    clock = HOLD_S * 0.5;
    draw(true);
  }

  function frame(now: number): void {
    const dt = Math.min(Math.max((now - lastFrame) / 1000, 0), 0.1);
    lastFrame = now;
    update(dt);
    draw(false);
    rafId = requestAnimationFrame(frame);
  }

  function start(): void {
    if (running || !visible || document.hidden) return;
    if (reducedMotion.matches) {
      renderStill();
      return;
    }
    running = true;
    lastFrame = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function stop(): void {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function redraw(): void {
    if (reducedMotion.matches) renderStill();
    else draw(false);
  }

  const resizeObserver = new ResizeObserver(() => {
    layout();
    redraw();
  });
  resizeObserver.observe(host);
  resizeObserver.observe(stage);

  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      visible = entries[0]?.isIntersecting ?? true;
      if (visible) start();
      else stop();
    },
    { threshold: 0 },
  );
  intersectionObserver.observe(host);

  const onVisibilityChange = () => (document.hidden ? stop() : start());
  document.addEventListener("visibilitychange", onVisibilityChange);

  const themeObserver = new MutationObserver(() => {
    palette = resolvePalette(host);
    redraw();
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  /* The pointer is a detector: lines under it stay collapsed while it rests. */
  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    const rect = host.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const inside = x > ox - cw * 4 && x < ox + stageW + cw * 4 && y > oy - lh && y < oy + rows * lh;
    pointerTarget = inside ? 1 : 0;
    if (inside) pointerY = y - oy;
  };
  const onPointerLeave = () => (pointerTarget = 0);
  // A tap, or reaching for the download, runs a full measurement.
  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") startSweep();
  };
  const onTriggerOver = (event: PointerEvent) => {
    if (event.target instanceof Element && event.target.closest(TRIGGER_SELECTOR)) startSweep();
  };
  const onFocusIn = (event: FocusEvent) => {
    if (event.target instanceof Element && event.target.closest(TRIGGER_SELECTOR)) startSweep();
  };

  host.addEventListener("pointermove", onPointerMove);
  host.addEventListener("pointerleave", onPointerLeave);
  host.addEventListener("pointerdown", onPointerDown);
  host.addEventListener("pointerover", onTriggerOver);
  host.addEventListener("focusin", onFocusIn);

  const onReducedMotionChange = () => {
    stop();
    start();
    if (!reducedMotion.matches) {
      measuredAt.fill(-Infinity);
      clock = INTRO_S;
    }
  };
  reducedMotion.addEventListener?.("change", onReducedMotionChange);

  host.dataset.hcPhase = "superposed";
  layout();
  redraw();
  start();

  return function destroy(): void {
    stop();
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    themeObserver.disconnect();
    document.removeEventListener("visibilitychange", onVisibilityChange);
    host.removeEventListener("pointermove", onPointerMove);
    host.removeEventListener("pointerleave", onPointerLeave);
    host.removeEventListener("pointerdown", onPointerDown);
    host.removeEventListener("pointerover", onTriggerOver);
    host.removeEventListener("focusin", onFocusIn);
    reducedMotion.removeEventListener?.("change", onReducedMotionChange);
    delete host.dataset.hcPhase;
  };
}
