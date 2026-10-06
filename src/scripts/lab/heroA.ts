/**
 * Hero option A: superposed tokens.
 *
 * A sparse field of tiny code fragments. Most of each fragment is definite,
 * but a few tokens hold several values at once (`<` and `<=`, `+ 1` and `- 1`),
 * drawn over one another as soft ghosts whose weights drift like probability
 * amplitudes. A measurement travels across the card as a wave and collapses
 * every superposed token onto the value that passes, which flashes green and
 * settles, then the field decoheres back into superposition.
 *
 * Measurements happen on a slow cycle, and also wherever the pointer enters the
 * card, held for as long as it stays.
 */

interface Superposed {
  /** Every value the token could take. Index 0 is the one that passes. */
  alts: string[];
  /** Resting probability of each value. */
  base: number[];
  freq: number[];
  phase: number[];
  /** Column the token starts at, within its line. */
  col: number;
  line: number;
  /** Width of the slot in columns: the longest alternative. */
  cols: number;
  collapseAt: number;
  releaseAt: number;
}

interface Fixed {
  text: string;
  col: number;
  line: number;
}

interface Fragment {
  fixed: Fixed[];
  tokens: Superposed[];
  cols: number;
  lines: number;
  /** Placement in CSS pixels, top left, once laid out. */
  x: number;
  y: number;
  placed: boolean;
  /** Per fragment breathing, so no two fragments pulse together. */
  breath: number;
}

/**
 * The source. A token written `{a|b|c}` is superposed, and its first value is
 * the one that passes. Short and plausible, never a listing.
 */
const SOURCE: string[][] = [
  ["if (i {<=|<} len) {", "  return {a|b};", "}"],
  ["let next = x {+ 1|- 1|* 2};"],
  ["const ok = check({tree|head|prev});"],
  ["while ({lo <= hi|lo < hi}) {", "  mid = (lo + hi) {>> 1|/ 2};"],
  ["return {cache[k]|fetch(k)|null};"],
  ["for (let i = {0|1}; i < n; i++)"],
  ["state.{pass|fail|skip}()"],
  ["if (!{ready|done}) {retry|throw}"],
];

const FONT_SIZE = 14;
const LINE_HEIGHT = 22;

/** Low ceilings: the field is texture behind a headline, never content. */
const FIXED_ALPHA = 0.2;
const FIXED_RESOLVED_ALPHA = 0.34;
const GHOST_ALPHA = 0.8;
const SHARP_ALPHA = 0.78;
const RESIDUAL_GREEN = 0.18;

const COLLAPSE_MS = 420;
const RELEASE_MS = 1500;
const GLOW_DECAY_MS = 900;
/** Speed of the measurement front, in CSS pixels per millisecond. */
const WAVE_SPEED = 1.35;
const HOLD_MS = 2600;
const FIRST_MEASURE_MS = 3600;
const CYCLE_MS = 8400;
const INTRO_DELAY_MS = 200;
const INTRO_MS = 1300;

const MAX_DPR = 2;

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const invEaseOut = (m: number) => 1 - Math.cbrt(1 - m);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

type RGB = [number, number, number];

function parseColor(value: string, fallback: RGB): RGB {
  const hex = value.trim().replace("#", "");
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) return fallback;
  const n = parseInt(hex.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;

const mix = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

/** Small seeded generator, so a resize lays the field out the same way again. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseFragment(lines: string[]): Fragment {
  const fixed: Fixed[] = [];
  const tokens: Superposed[] = [];
  let cols = 0;

  lines.forEach((source, line) => {
    let col = 0;
    const re = /\{([^}]*)\}/g;
    let last = 0;
    let match: RegExpExecArray | null;
    const pushFixed = (text: string) => {
      if (text) fixed.push({ text, col, line });
      col += text.length;
    };
    while ((match = re.exec(source))) {
      pushFixed(source.slice(last, match.index));
      const alts = match[1]!.split("|");
      const width = Math.max(...alts.map((a) => a.length));
      const base = alts.map((_, i) => (i === 0 ? 0.9 : 0.7 + Math.random() * 0.4));
      tokens.push({
        alts,
        base,
        freq: alts.map(() => 0.00035 + Math.random() * 0.0005),
        phase: alts.map(() => Math.random() * Math.PI * 2),
        col,
        line,
        cols: width,
        collapseAt: Infinity,
        releaseAt: Infinity,
      });
      col += width;
      last = match.index + match[0].length;
    }
    pushFixed(source.slice(last));
    cols = Math.max(cols, col);
  });

  return {
    fixed,
    tokens,
    cols,
    lines: lines.length,
    x: 0,
    y: 0,
    placed: false,
    breath: Math.random() * Math.PI * 2,
  };
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export function initHeroA(host: HTMLElement): () => void {
  const ghostCanvas = host.querySelector<HTMLCanvasElement>("[data-hero-a-ghost]");
  const sharpCanvas = host.querySelector<HTMLCanvasElement>("[data-hero-a-sharp]");
  if (!ghostCanvas || !sharpCanvas) return () => {};
  const ghost = ghostCanvas.getContext("2d");
  const sharp = sharpCanvas.getContext("2d");
  // No context leaves the card as its CSS gradient, which is a finished look.
  if (!ghost || !sharp) return () => {};

  const style = getComputedStyle(host);
  const ink = parseColor(style.getPropertyValue("--ha-ink"), [216, 245, 230]);
  const fringeA = parseColor(style.getPropertyValue("--ha-fringe-a"), [143, 227, 255]);
  const fringeB = parseColor(style.getPropertyValue("--ha-fringe-b"), [201, 255, 179]);
  const pass = parseColor(style.getPropertyValue("--ha-pass"), [61, 220, 132]);
  const settled = mix(ink, pass, RESIDUAL_GREEN);
  const mono =
    style.getPropertyValue("--font-mono").trim() ||
    "ui-monospace, SFMono-Regular, Menlo, monospace";
  const font = `450 ${FONT_SIZE}px ${mono}`;

  const fragments = SOURCE.map(parseFragment);
  const seed = Math.floor(Math.random() * 1e9);

  let width = 1;
  let height = 1;
  let charW = FONT_SIZE * 0.6;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const startedAt = performance.now();

  let rafId = 0;
  let running = false;
  let visible = true;
  let hovering = false;
  let nextAutoAt = startedAt + FIRST_MEASURE_MS;
  let pendingReleaseAt = Infinity;

  /** Everything the headline and the bottom row cover, padded, relative to the card. */
  function exclusions(): Rect[] {
    const box = host.getBoundingClientRect();
    const out: Rect[] = [];
    const pad = width < 640 ? 14 : 22;
    const add = (r: DOMRect) => {
      if (r.width < 1 || r.height < 1) return;
      out.push({
        x: r.left - box.left - pad,
        y: r.top - box.top - pad,
        w: r.width + pad * 2,
        h: r.height + pad * 2,
      });
    };
    const headline = host.querySelector("[data-hero-headline]");
    if (headline) {
      // Line boxes rather than the block, so a short last line leaves its
      // right side free for the field.
      const range = document.createRange();
      range.selectNodeContents(headline);
      for (const r of range.getClientRects()) add(r);
      range.detach();
    }
    host.querySelectorAll("[data-hero-a-avoid]").forEach((el) => add(el.getBoundingClientRect()));
    return out;
  }

  function layout(): void {
    sharp!.font = font;
    charW = sharp!.measureText("0").width || FONT_SIZE * 0.6;
    const avoid = exclusions();
    const random = rng(seed);
    const edge = width < 640 ? 22 : 34;
    const gap = width < 640 ? 18 : 40;
    const placed: Rect[] = [];
    const budget = width < 640 ? 4 : width < 1024 ? 5 : 7;

    // Same shuffle every layout for this page load.
    const order = fragments.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }

    for (const f of fragments) f.placed = false;

    for (const index of order) {
      if (placed.length >= budget) break;
      const f = fragments[index]!;
      const w = f.cols * charW;
      const h = f.lines * LINE_HEIGHT;
      if (w > width - edge * 2) continue;
      for (let attempt = 0; attempt < 140; attempt++) {
        const x = edge + random() * (width - edge * 2 - w);
        const y = edge + random() * (height - edge * 2 - h);
        const rect = { x, y, w, h };
        const padded = { x: x - gap, y: y - gap * 0.6, w: w + gap * 2, h: h + gap * 1.2 };
        if (avoid.some((r) => overlaps(rect, r))) continue;
        if (placed.some((r) => overlaps(padded, r))) continue;
        // Snap to the pixel grid so resolved glyphs land crisp.
        f.x = Math.round(x);
        f.y = Math.round(y);
        f.placed = true;
        placed.push(rect);
        break;
      }
    }
  }

  function resize(): void {
    const rect = host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    for (const [canvas, ctx] of [
      [ghostCanvas!, ghost!],
      [sharpCanvas!, sharp!],
    ] as const) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    layout();
    if (!running) draw(performance.now());
  }

  /** How far a token has resolved, 0 superposed to 1 definite. */
  function resolved(t: Superposed, now: number): number {
    const up = (at: number) => easeOut(clamp01((at - t.collapseAt) / COLLAPSE_MS));
    if (now < t.releaseAt) return up(now);
    return up(t.releaseAt) * (1 - easeOut(clamp01((now - t.releaseAt) / RELEASE_MS)));
  }

  /** The brief green of a state that just passed. */
  function glow(t: Superposed, now: number): number {
    const lit = t.collapseAt + COLLAPSE_MS * 0.45;
    if (now < lit) return 0;
    return Math.exp(-(Math.min(now, t.releaseAt) - lit) / GLOW_DECAY_MS);
  }

  function tokenCentre(f: Fragment, t: Superposed): [number, number] {
    return [f.x + (t.col + t.cols / 2) * charW, f.y + (t.line + 0.5) * LINE_HEIGHT];
  }

  /** Collapse everything, as a front spreading out from one point. */
  function measure(ox: number, oy: number, now: number): void {
    for (const f of fragments) {
      if (!f.placed) continue;
      for (const t of f.tokens) {
        const m = resolved(t, now);
        if (now < t.releaseAt && t.collapseAt <= now && m > 0.98) continue;
        if (m > 0.02) {
          // Already partly resolved: pick up from where it is, no jump.
          t.collapseAt = now - invEaseOut(m) * COLLAPSE_MS;
        } else {
          const [cx, cy] = tokenCentre(f, t);
          const d = Math.hypot(cx - ox, cy - oy);
          t.collapseAt = now + d / WAVE_SPEED + Math.random() * 70;
        }
        t.releaseAt = Infinity;
      }
    }
  }

  /** Let the field decohere back into superposition, a little out of step. */
  function release(now: number): void {
    for (const f of fragments) {
      for (const t of f.tokens) {
        const at = Math.max(now, t.collapseAt + COLLAPSE_MS) + Math.random() * 600;
        t.releaseAt = at;
      }
    }
  }

  function draw(now: number): void {
    const time = reducedMotion.matches ? 41000 : now;
    const intro = reducedMotion.matches
      ? 1
      : easeOut(clamp01((now - startedAt - INTRO_DELAY_MS) / INTRO_MS));

    ghost!.clearRect(0, 0, width, height);
    sharp!.clearRect(0, 0, width, height);
    ghost!.font = font;
    sharp!.font = font;
    ghost!.textBaseline = "middle";
    sharp!.textBaseline = "middle";
    ghost!.globalCompositeOperation = "lighter";

    for (const f of fragments) {
      if (!f.placed) continue;

      let fragResolved = 0;
      let fragGlow = 0;
      for (const t of f.tokens) {
        fragResolved += resolved(t, now);
        fragGlow = Math.max(fragGlow, glow(t, now));
      }
      fragResolved /= Math.max(1, f.tokens.length);

      const breath = 0.88 + 0.12 * Math.sin(time * 0.00042 + f.breath);
      const fixedAlpha =
        (FIXED_ALPHA + (FIXED_RESOLVED_ALPHA - FIXED_ALPHA) * fragResolved) * breath * intro;
      sharp!.fillStyle = rgba(mix(ink, pass, fragGlow * 0.35), fixedAlpha);
      for (const s of f.fixed) {
        sharp!.fillText(s.text, f.x + s.col * charW, f.y + (s.line + 0.5) * LINE_HEIGHT);
      }

      for (const t of f.tokens) {
        const m = resolved(t, now);
        const g = glow(t, now);
        const x = f.x + t.col * charW;
        const y = f.y + (t.line + 0.5) * LINE_HEIGHT;

        // Amplitudes drift, so which value dominates keeps changing.
        let total = 0;
        const p = t.alts.map((_, i) => {
          const v = t.base[i]! * (1 + 0.55 * Math.sin(time * t.freq[i]! + t.phase[i]!));
          total += v;
          return v;
        });

        // A slow interference pattern crossing the field.
        const shimmer =
          0.78 +
          0.22 * Math.cos(x * 0.011 - time * 0.0011 + 0.9 * Math.sin(y * 0.013 + time * 0.0004));

        const unresolved = 1 - m;
        if (unresolved > 0.002) {
          t.alts.forEach((alt, i) => {
            const prob = p[i]! / total;
            const a = GHOST_ALPHA * Math.pow(prob, 0.7) * shimmer * unresolved * intro;
            if (a < 0.004) return;
            // Each value sits a hair off the line, by its own phase, and gathers
            // onto it as the token resolves.
            const dy =
              ((i - (t.alts.length - 1) / 2) * 3.4 +
                Math.sin(time * 0.0009 + t.phase[i]! * 3) * 1.6) *
              unresolved;
            const split = (0.6 + 0.6 * Math.sin(time * 0.0013 + t.phase[i]!)) * unresolved;
            ghost!.fillStyle = rgba(fringeA, a * 0.55);
            ghost!.fillText(alt, x - split, y + dy);
            ghost!.fillStyle = rgba(fringeB, a * 0.55);
            ghost!.fillText(alt, x + split, y + dy);
          });
        }

        if (m > 0.002) {
          const colour = mix(settled, pass, g);
          if (g > 0.04) {
            sharp!.shadowColor = rgba(pass, 0.7 * g);
            sharp!.shadowBlur = 14 * g;
          }
          sharp!.fillStyle = rgba(colour, SHARP_ALPHA * m * intro);
          sharp!.fillText(t.alts[0]!, x, y);
          sharp!.shadowBlur = 0;
          sharp!.shadowColor = "transparent";
        }
      }
    }
  }

  function frame(now: number): void {
    if (!hovering && now >= nextAutoAt) {
      // The automatic measurement sweeps in from the left edge.
      measure(-40, height * (0.3 + Math.random() * 0.4), now);
      const reach = Math.hypot(width + 40, height) / WAVE_SPEED;
      pendingReleaseAt = now + reach + HOLD_MS;
      nextAutoAt = now + CYCLE_MS;
    }
    if (!hovering && now >= pendingReleaseAt) {
      release(now);
      pendingReleaseAt = Infinity;
    }
    draw(now);
    rafId = requestAnimationFrame(frame);
  }

  function start(): void {
    if (running || !visible || document.hidden || reducedMotion.matches) return;
    running = true;
    rafId = requestAnimationFrame(frame);
  }

  function stop(): void {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  const local = (event: PointerEvent): [number, number] => {
    const box = host.getBoundingClientRect();
    return [event.clientX - box.left, event.clientY - box.top];
  };

  const onPointerEnter = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || reducedMotion.matches) return;
    const now = performance.now();
    hovering = true;
    pendingReleaseAt = Infinity;
    measure(...local(event), now);
  };

  const onPointerLeave = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || !hovering) return;
    const now = performance.now();
    hovering = false;
    release(now);
    nextAutoAt = Math.max(nextAutoAt, now + CYCLE_MS * 0.6);
  };

  // A tap on a touch screen is a one-off measurement from where it landed.
  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === "mouse" || reducedMotion.matches) return;
    const now = performance.now();
    measure(...local(event), now);
    pendingReleaseAt = now + HOLD_MS + 600;
    nextAutoAt = now + CYCLE_MS;
  };

  host.addEventListener("pointerenter", onPointerEnter);
  host.addEventListener("pointerleave", onPointerLeave);
  host.addEventListener("pointerdown", onPointerDown);

  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(host);

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

  const onReducedMotionChange = () => {
    if (reducedMotion.matches) {
      stop();
      draw(performance.now());
    } else {
      start();
    }
  };
  reducedMotion.addEventListener?.("change", onReducedMotionChange);

  // Headline fonts can shift the line boxes the layout avoids.
  document.fonts?.ready.then(() => resize()).catch(() => {});

  resize();
  start();

  return function destroy(): void {
    stop();
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    document.removeEventListener("visibilitychange", onVisibilityChange);
    host.removeEventListener("pointerenter", onPointerEnter);
    host.removeEventListener("pointerleave", onPointerLeave);
    host.removeEventListener("pointerdown", onPointerDown);
    reducedMotion.removeEventListener?.("change", onReducedMotionChange);
  };
}
