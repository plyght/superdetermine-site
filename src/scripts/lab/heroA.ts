/**
 * Hero option A: superposed tokens.
 *
 * Short lines of code sit across the card on three depth planes. In each line
 * one token is undecided: every value it could take is shown at once, stacked
 * in its slot (`<=` over `<`, `+ 1` over `- 1`), each as bright as it is
 * likely, the likelihoods drifting slowly so the values cross-fade.
 *
 * On a calm timed loop the card is measured. Line by line, each undecided
 * token's values gather into one: the value that passes, which turns crisp and
 * green with a brief soft glow, and the line's status dot goes green with it.
 * After a while the values loosen back out and the code is undecided again.
 *
 * The code is drawn crisp on a 2D canvas. A WebGL pass underneath paints the
 * card and gives the code its glow, from a small offscreen copy of the field.
 */

type RGB = [number, number, number];

interface Token {
  /** Every value the token could take. Index 0 is the one that passes. */
  alts: string[];
  /** Stack slot of each value, so the passing one is not always on top. */
  slot: number[];
  base: number[];
  freq: number[];
  phase: number[];
  col: number;
  cols: number;
  /** 0 undecided, 1 measured. Integrated per frame toward the target. */
  m: number;
  arriveAt: number;
  releaseAt: number;
  glowAt: number;
}

interface Layer {
  name: "far" | "mid" | "near";
  size: number;
  /** Fragment budget at desktop, tablet and phone widths. */
  count: [number, number, number];
  fixedAlpha: number;
  altAlpha: number;
  passAlpha: number;
  glowAlpha: number;
  gap: number;
  /** Hard layers never overlap the headline; soft ones fade near it. */
  hard: boolean;
}

interface Fragment {
  layer: Layer;
  before: string;
  after: string;
  token: Token;
  cols: number;
  /** Top left of the line's middle row, in CSS pixels. */
  x: number;
  y: number;
  mask: number;
}

/**
 * One line each, one undecided token each. A token written `{a|b|c}` is
 * superposed, and its first value is the one that passes.
 */
const SOURCE: string[] = [
  "if (i {<=|<} len)",
  "let next = x {+ 1|- 1};",
  "return {cache[k]|null};",
  "while ({lo <= hi|lo < hi})",
  "const ok = check({tree|head});",
  "for (let i = {0|1}; i < n; i++)",
  "state.{pass|fail}()",
  "if (n {>=|>} 0)",
  "assert({a === b|a == b});",
  "sum {+=|-=} w[i];",
  "return {mid|lo|hi};",
  "if (len {>|>=} cap) grow();",
  "{await|yield} save(tree);",
  "{const|let|var} seen = new Set();",
  "k = {k + 1|k << 1};",
  "head = {prev|next};",
  "mid = (lo + hi) {>> 1|/ 2};",
  "i{++|--}",
];

const LAYERS: Layer[] = [
  {
    name: "near",
    size: 15,
    count: [7, 5, 3],
    fixedAlpha: 0.42,
    altAlpha: 0.8,
    passAlpha: 0.95,
    glowAlpha: 1,
    gap: 44,
    hard: true,
  },
  {
    name: "mid",
    size: 12,
    count: [9, 6, 3],
    fixedAlpha: 0.22,
    altAlpha: 0.48,
    passAlpha: 0.62,
    glowAlpha: 0.6,
    gap: 28,
    hard: true,
  },
  {
    name: "far",
    size: 10,
    count: [14, 9, 5],
    fixedAlpha: 0.5,
    altAlpha: 0.6,
    passAlpha: 0.7,
    glowAlpha: 0.35,
    gap: 14,
    hard: false,
  },
];

/** Vertical step between stacked values, in multiples of the font size. */
const STACK = 1.15;

/** The loop: undecided, then measured line by line, held, then undecided. */
const FIRST_MEASURE_MS = 3200;
const CYCLE_MS = 9000;
const CASCADE_MS = 1400;
const HOLD_MS = 3000;
const TAU_UP = 240;
const TAU_DOWN = 900;
const GLOW_MS = 1400;
const INTRO_DELAY_MS = 150;
const INTRO_MS = 1400;

const MAX_DPR = 2;
const LIGHT_DPR = 1.5;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function parseColor(value: string, fallback: RGB): RGB {
  const hex = value.trim().replace("#", "");
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) return fallback;
  const n = parseInt(hex.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const css = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;

const mix = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

const glsl = (c: RGB) =>
  `vec3(${(c[0] / 255).toFixed(4)}, ${(c[1] / 255).toFixed(4)}, ${(c[2] / 255).toFixed(4)})`;

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

function parseFragment(source: string, layer: Layer, random: () => number): Fragment {
  const match = /\{([^}]*)\}/.exec(source)!;
  const before = source.slice(0, match.index);
  const after = source.slice(match.index + match[0].length);
  const alts = match[1]!.split("|");
  const cols = Math.max(...alts.map((a) => a.length));
  const slot = alts.map((_, i) => i);
  for (let i = slot.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [slot[i], slot[j]] = [slot[j]!, slot[i]!];
  }
  return {
    layer,
    before,
    after,
    cols: before.length + cols + after.length,
    x: 0,
    y: 0,
    mask: 1,
    token: {
      alts,
      slot,
      base: alts.map(() => 0.7 + random() * 0.6),
      freq: alts.map(() => 0.00025 + random() * 0.00035),
      phase: alts.map(() => random() * Math.PI * 2),
      col: before.length,
      cols,
      m: 0,
      arriveAt: Infinity,
      releaseAt: -Infinity,
      glowAt: -Infinity,
    },
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

function distToRect(px: number, py: number, r: Rect): number {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w));
  const dy = Math.max(r.y - py, 0, py - (r.y + r.h));
  return Math.hypot(dx, dy);
}

/* ------------------------------------------------------------------------ */
/* The light layer: the card itself and the glow of the code on it.           */
/*                                                                            */
/* The field is drawn small and offscreen, one channel per kind of light: red */
/* for the far plane, green for the near and mid code, blue for the green of  */
/* a pass. Shrinking it is the blur; the shader only tints and screens it.    */
/* ------------------------------------------------------------------------ */

const VERTEX_SHADER = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

interface Palette {
  bg: [RGB, RGB, RGB];
  mint: RGB;
  pass: RGB;
  ink: RGB;
}

function fragmentShader(c: Palette): string {
  return `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 uRes;
uniform vec2 uSize;
uniform sampler2D uMed;
uniform sampler2D uBig;
uniform vec2 uMedPx;
uniform vec2 uBigPx;
uniform float uIntro;
uniform vec4 uClear;

const vec3 STOP0 = ${glsl(c.bg[0])};
const vec3 STOP1 = ${glsl(c.bg[1])};
const vec3 STOP2 = ${glsl(c.bg[2])};
const vec2 ORIGIN = vec2(0.74, 0.30);
const vec2 SPAN = vec2(1.30, 1.50);
const float MID_STOP = 0.46;

const vec3 MINT = ${glsl(c.mint)};
const vec3 PASS = ${glsl(c.pass)};
const vec3 WHITE = ${glsl(c.ink)};
const float GRAIN = 0.012;

float hash21(vec2 p_) {
  p_ = fract(p_ * vec2(127.1, 311.7));
  p_ += dot(p_, p_ + 34.56);
  return fract(p_.x * p_.y);
}

vec3 soft(sampler2D t, vec2 uv, vec2 px) {
  vec2 o = 1.0 / px;
  vec3 s = texture2D(t, uv).rgb * 0.4;
  s += texture2D(t, uv + vec2(o.x, 0.0)).rgb * 0.15;
  s += texture2D(t, uv - vec2(o.x, 0.0)).rgb * 0.15;
  s += texture2D(t, uv + vec2(0.0, o.y)).rgb * 0.15;
  s += texture2D(t, uv - vec2(0.0, o.y)).rgb * 0.15;
  return s;
}

float boxDist(vec2 p, vec4 r) {
  vec2 d = max(max(r.xy - p, p - r.zw), 0.0);
  return length(d);
}

vec3 screenBlend(vec3 a, vec3 b) {
  return 1.0 - (1.0 - a) * (1.0 - b);
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 q = frag / uRes;
  vec2 p = q * uSize;

  float g = length((q - ORIGIN) / SPAN);
  vec3 col = mix(STOP0, STOP1, clamp(g / MID_STOP, 0.0, 1.0));
  col = mix(col, STOP2, clamp((g - MID_STOP) / (1.0 - MID_STOP), 0.0, 1.0));

  vec3 med = soft(uMed, q, uMedPx);
  vec3 big = soft(uBig, q, uBigPx);

  // Quieter under the headline, so it always reads first.
  float clear = 0.35 + 0.65 * smoothstep(0.0, 120.0, boxDist(p, uClear));

  float far = med.r * 0.9;
  float halo = med.g * 0.7 + big.g * 1.2;
  float glow = med.b * 0.6 + big.b * 1.6;

  float a = 1.0 - exp(-(far + halo) * 1.6);
  col = screenBlend(col, mix(MINT, WHITE, 0.25) * a * 0.55 * clear * uIntro);
  float pa = 1.0 - exp(-glow * 1.8);
  col = screenBlend(col, PASS * pa * 0.8 * uIntro);

  col += (hash21(gl_FragCoord.xy) - 0.5) * GRAIN;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
}

interface Light {
  draw(med: HTMLCanvasElement, big: HTMLCanvasElement, intro: number, clear: number[]): void;
  resize(w: number, h: number, scale: number): void;
  destroy(): void;
}

function createLight(canvas: HTMLCanvasElement, palette: Palette): Light | null {
  const gl = canvas.getContext("webgl", {
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    // The reduced-motion path paints one frame and stops.
    preserveDrawingBuffer: true,
    powerPreference: "low-power",
  });
  if (!gl) return null;

  const shaders: WebGLShader[] = [];
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    shaders.push(shader);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error("Hero A shader: " + gl.getShaderInfoLog(shader));
    }
    return shader;
  };

  const program = gl.createProgram()!;
  try {
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentShader(palette)));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Hero A link failed");
  } catch (error) {
    console.warn(error);
    gl.deleteProgram(program);
    for (const s of shaders) gl.deleteShader(s);
    return null;
  }

  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const textures = [0, 1].map((unit) => {
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  });
  // The field is drawn additively, so premultiplied colour is its intensity.
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);

  const u = (name: string) => gl.getUniformLocation(program, name);
  const uRes = u("uRes");
  const uSize = u("uSize");
  const uMedPx = u("uMedPx");
  const uBigPx = u("uBigPx");
  const uIntro = u("uIntro");
  const uClear = u("uClear");
  gl.uniform1i(u("uMed"), 0);
  gl.uniform1i(u("uBig"), 1);

  let wCss = 1;
  let hCss = 1;
  let wPx = 1;
  let hPx = 1;

  return {
    resize(w, h, s) {
      wCss = w;
      hCss = h;
      wPx = Math.max(1, Math.round(w * s));
      hPx = Math.max(1, Math.round(h * s));
      canvas.width = wPx;
      canvas.height = hPx;
      gl.viewport(0, 0, wPx, hPx);
    },
    draw(med, big, intro, clear) {
      [med, big].forEach((layer, unit) => {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, layer);
      });
      gl.uniform2f(uRes, wPx, hPx);
      gl.uniform2f(uSize, wCss, hCss);
      gl.uniform2f(uMedPx, med.width, med.height);
      gl.uniform2f(uBigPx, big.width, big.height);
      gl.uniform1f(uIntro, intro);
      gl.uniform4f(uClear, clear[0]!, clear[1]!, clear[2]!, clear[3]!);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    destroy() {
      for (const t of textures) gl.deleteTexture(t);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      for (const s of shaders) gl.deleteShader(s);
    },
  };
}

/* ------------------------------------------------------------------------ */

type Hue = "r" | "g" | "b" | "ink" | "pass";

export function initHeroA(host: HTMLElement): () => void {
  const lightCanvas = host.querySelector<HTMLCanvasElement>("[data-hero-a-light]");
  const sharpCanvas = host.querySelector<HTMLCanvasElement>("[data-hero-a-sharp]");
  if (!lightCanvas || !sharpCanvas) return () => {};
  const sharp = sharpCanvas.getContext("2d");
  // The glow field, at a third of CSS size, and a ninth for the wide halo.
  const medCanvas = document.createElement("canvas");
  const bigCanvas = document.createElement("canvas");
  const med = medCanvas.getContext("2d");
  const big = bigCanvas.getContext("2d");
  // No 2D context leaves the card as its CSS gradient, which is a finished look.
  if (!sharp || !med || !big) return () => {};

  const style = getComputedStyle(host);
  const read = (name: string, fallback: RGB) => parseColor(style.getPropertyValue(name), fallback);
  const ink = read("--ha-ink", [216, 245, 230]);
  const pass = read("--ha-pass", [61, 220, 132]);
  const palette: Palette = {
    bg: [
      read("--ha-bg-hi", [13, 79, 46]),
      read("--ha-bg-mid", [6, 48, 28]),
      read("--ha-bg-lo", [3, 22, 13]),
    ],
    mint: read("--ha-mint", [66, 224, 138]),
    pass,
    ink,
  };
  const hues: Record<Hue, RGB> = {
    r: [255, 0, 0],
    g: [0, 255, 0],
    b: [0, 0, 255],
    ink,
    pass: mix(pass, ink, 0.12),
  };
  const mono =
    style.getPropertyValue("--font-mono").trim() ||
    "ui-monospace, SFMono-Regular, Menlo, monospace";

  let light = createLight(lightCanvas, palette);

  const params = new URLSearchParams(location.search);
  // Lab only: `?slow=0.2` runs the loop at a fifth of its speed, so slow
  // screenshot tooling can catch a moment mid-measurement.
  const timeScale = Math.min(Math.max(Number(params.get("slow")) || 1, 0.01), 1);
  const realStart = performance.now();
  const clock = () => realStart + (performance.now() - realStart) * timeScale;

  const seed = Math.floor(Math.random() * 1e9);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const startedAt = clock();

  let width = 1;
  let height = 1;
  let dpr = 1;
  let fragments: Fragment[] = [];
  let clearBox = [0, 0, 0, 0];
  const charW = new Map<number, number>();

  /* -- Sprites: every string is rasterised once per size, hue and scale. -- */
  const sprites = new Map<string, HTMLCanvasElement>();
  function sprite(text: string, size: number, hue: Hue, scale: number): HTMLCanvasElement {
    const key = `${scale}|${size}|${hue}|${text}`;
    let c = sprites.get(key);
    if (c) return c;
    c = document.createElement("canvas");
    const font = `450 ${size * scale}px ${mono}`;
    const g = c.getContext("2d")!;
    g.font = font;
    const pad = Math.ceil(2 * scale);
    c.width = Math.max(1, Math.ceil(g.measureText(text).width) + pad * 2);
    c.height = Math.ceil(size * 1.7 * scale);
    g.font = font;
    g.textBaseline = "middle";
    g.fillStyle = css(hues[hue]);
    g.fillText(text, pad, c.height / 2);
    sprites.set(key, c);
    return c;
  }

  function stamp(
    target: CanvasRenderingContext2D,
    scale: number,
    text: string,
    size: number,
    hue: Hue,
    x: number,
    y: number,
    alpha: number,
  ): void {
    if (alpha < 0.004 || !text) return;
    const s = sprite(text, size, hue, scale);
    target.globalAlpha = alpha > 1 ? 1 : alpha;
    const pad = Math.ceil(2 * scale) / scale;
    target.drawImage(s, x - pad, y - s.height / scale / 2, s.width / scale, s.height / scale);
  }

  const MED = 1 / 3;
  const onSharp = (...a: [string, number, Hue, number, number, number]) => stamp(sharp!, dpr, ...a);
  // Glow is drawn straight into the small canvas: shrinking it is the blur.
  const onGlow = (...a: [string, number, Hue, number, number, number]) => {
    if (light) stamp(med!, MED, ...a);
  };

  /* -- Layout -- */

  function exclusions(): Rect[] {
    const box = host.getBoundingClientRect();
    const out: Rect[] = [];
    const pad = width < 640 ? 12 : 22;
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
    let hx0 = Infinity;
    let hy0 = Infinity;
    let hx1 = -Infinity;
    let hy1 = -Infinity;
    if (headline) {
      // Line boxes rather than the block, so a short last line leaves its
      // right side open to the field.
      const range = document.createRange();
      range.selectNodeContents(headline);
      for (const r of range.getClientRects()) {
        add(r);
        hx0 = Math.min(hx0, r.left - box.left);
        hy0 = Math.min(hy0, r.top - box.top);
        hx1 = Math.max(hx1, r.right - box.left);
        hy1 = Math.max(hy1, r.bottom - box.top);
      }
      range.detach();
    }
    clearBox = Number.isFinite(hx0) ? [hx0, hy0, hx1, hy1] : [0, 0, 0, 0];
    host.querySelectorAll("[data-hero-a-avoid]").forEach((el) => add(el.getBoundingClientRect()));
    return out;
  }

  function layout(): void {
    const random = rng(seed);
    const avoid = exclusions();
    const tier = width >= 1024 ? 0 : width >= 640 ? 1 : 2;
    const edge = tier === 2 ? 16 : 26;
    fragments = [];
    const nearRects: Rect[] = [];
    // Each line is used once on the near and mid planes, so no two read alike.
    const pool = SOURCE.map((_, i) => i);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    let next = 0;

    for (const layer of LAYERS) {
      sharp!.font = `450 ${layer.size}px ${mono}`;
      const cw = sharp!.measureText("0").width || layer.size * 0.6;
      charW.set(layer.size, cw);

      const placed: Rect[] = [];
      const budget = layer.count[tier];
      let attempts = 0;
      while (placed.length < budget && attempts < budget * 60) {
        attempts++;
        const index =
          layer.name === "far" ? Math.floor(random() * SOURCE.length) : pool[next % pool.length]!;
        const frag = parseFragment(SOURCE[index]!, layer, random);
        const w = frag.cols * cw + (layer.name === "near" ? 18 : 0);
        const stack = (frag.token.alts.length - 1) * layer.size * STACK;
        const h = layer.size * 1.4 + stack;
        if (w > width - edge * 2) continue;
        const x = edge + random() * (width - edge * 2 - w);
        const y = edge + random() * (height - edge * 2 - h);
        const rect = { x, y, w, h };
        const padded = {
          x: x - layer.gap,
          y: y - layer.gap * 0.5,
          w: w + layer.gap * 2,
          h: h + layer.gap,
        };
        if (layer.hard && avoid.some((r) => overlaps(rect, r))) continue;
        if (placed.some((r) => overlaps(padded, r))) continue;
        if (layer.name !== "near" && nearRects.some((r) => overlaps(padded, r))) continue;

        // The near line's status dot sits in the gutter to its left.
        frag.x = Math.round(x + (layer.name === "near" ? 18 : 0));
        frag.y = Math.round(y + h / 2);
        if (!layer.hard) {
          const d = Math.min(...avoid.map((r) => distToRect(x + w / 2, y + h / 2, r)), 999);
          const inside = avoid.some((r) => overlaps(rect, r));
          frag.mask = inside ? 0.15 : 0.3 + 0.7 * smooth(0, 90, d);
        }
        placed.push(rect);
        if (layer.name === "near") nearRects.push(padded);
        if (layer.name !== "far") next++;
        fragments.push(frag);
      }
    }
  }

  function resize(): void {
    const rect = host.getBoundingClientRect();
    const nextDpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    if (nextDpr !== dpr) sprites.clear();
    dpr = nextDpr;
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    sharpCanvas!.width = Math.round(width * dpr);
    sharpCanvas!.height = Math.round(height * dpr);
    sharp!.setTransform(dpr, 0, 0, dpr, 0, 0);
    medCanvas.width = Math.max(1, Math.round(width * MED));
    medCanvas.height = Math.max(1, Math.round(height * MED));
    med!.setTransform(MED, 0, 0, MED, 0, 0);
    bigCanvas.width = Math.max(1, Math.round(width / 9));
    bigCanvas.height = Math.max(1, Math.round(height / 9));
    light?.resize(width, height, Math.min(dpr, LIGHT_DPR));
    layout();
    if (!running) render(clock());
  }

  /* -- Measurement -- */

  const auto = params.get("auto") !== "0";
  let nextMeasureAt = auto ? startedAt + FIRST_MEASURE_MS : Infinity;
  let fromLeft = true;

  /** Measure every line, in a calm cascade across the card. */
  function measure(now: number): void {
    for (const f of fragments) {
      const t = f.token;
      const across = (f.x + (t.col + t.cols / 2) * charW.get(f.layer.size)!) / width;
      const arrive = now + (fromLeft ? across : 1 - across) * CASCADE_MS + Math.random() * 180;
      t.arriveAt = arrive;
      t.releaseAt = arrive + HOLD_MS + Math.random() * 900;
    }
    fromLeft = !fromLeft;
  }

  /* -- Drawing -- */

  let lastFrame = startedAt;

  function render(now: number): void {
    const still = reducedMotion.matches;
    const time = still ? 0 : now - startedAt;
    const intro = still ? 1 : smooth(0, 1, (now - startedAt - INTRO_DELAY_MS) / INTRO_MS);
    const dt = Math.min(Math.max(now - lastFrame, 0), 100);
    lastFrame = now;

    sharp!.globalAlpha = 1;
    sharp!.clearRect(0, 0, width, height);
    med!.globalAlpha = 1;
    med!.globalCompositeOperation = "source-over";
    med!.clearRect(0, 0, width, height);
    med!.globalCompositeOperation = "lighter";

    for (const f of fragments) {
      const L = f.layer;
      const t = f.token;
      const cw = charW.get(L.size)!;
      const fade = f.mask * intro;
      const far = L.name === "far";

      if (!still) {
        const on = now >= t.arriveAt && now < t.releaseAt;
        const before = t.m;
        const target = on ? 1 : 0;
        t.m += (target - t.m) * (1 - Math.exp(-dt / (target > t.m ? TAU_UP : TAU_DOWN)));
        if (Math.abs(target - t.m) < 0.001) t.m = target;
        if (before < 0.5 && t.m >= 0.5) t.glowAt = now;
      }
      const m = t.m;
      const settle = m * m * (3 - 2 * m);
      const glow = m > 0.05 ? Math.exp(-(now - t.glowAt) / GLOW_MS) : 0;

      const y = f.y;
      const tx = f.x + t.col * cw;
      const fixedA = L.fixedAlpha * (1 + 0.25 * settle) * fade;

      // Once measured, the rest of the line closes up behind the one value left.
      const afterX = tx + (t.cols + (t.alts[0]!.length - t.cols) * settle) * cw;

      // The definite part of the line.
      if (far) {
        onGlow(f.before, L.size, "r", f.x, y, fixedA);
        onGlow(f.after, L.size, "r", afterX, y, fixedA);
      } else {
        onSharp(f.before, L.size, "ink", f.x, y, fixedA);
        onSharp(f.after, L.size, "ink", afterX, y, fixedA);
      }

      // Each value's likelihood drifts slowly, so the values cross-fade.
      let top = 0;
      const p = t.alts.map((_, i) => {
        const v = t.base[i]! * (1 + 0.55 * Math.sin(time * t.freq[i]! + t.phase[i]!));
        top = Math.max(top, v);
        return v;
      });

      const n = t.alts.length;
      const step = L.size * STACK;
      for (let i = 0; i < n; i++) {
        const passing = i === 0;
        // Undecided, every value has its own row in the slot; measured, they
        // gather onto the line and only the passing value is left.
        const row = (t.slot[i]! - (n - 1) / 2) * step * (1 - settle);
        const weight = 0.2 + 0.8 * Math.pow(p[i]! / top, 1.6);
        const spread = L.altAlpha * weight * fade;
        const a = passing
          ? spread + (L.passAlpha * fade - spread) * settle
          : spread * Math.pow(1 - settle, 1.6);
        if (far) {
          onGlow(t.alts[i]!, L.size, passing && settle > 0.5 ? "b" : "r", tx, y + row, a);
          continue;
        }
        onSharp(t.alts[i]!, L.size, "ink", tx, y + row, a * (passing ? 1 - settle : 1));
        if (passing && settle > 0.002) onSharp(t.alts[i]!, L.size, "pass", tx, y + row, a * settle);
        onGlow(t.alts[i]!, L.size, "g", tx, y + row, a * 0.9);
        if (passing && glow > 0.01)
          onGlow(t.alts[i]!, L.size, "b", tx, y + row, L.glowAlpha * glow);
      }

      // The status dot: hollow while the line is undecided, green once it passes.
      if (L.name === "near") {
        const dx = f.x - 14;
        sharp!.globalAlpha = (0.32 + 0.58 * settle) * fade;
        sharp!.beginPath();
        sharp!.arc(dx, y, 2.6, 0, Math.PI * 2);
        if (settle > 0.5) {
          sharp!.fillStyle = css(hues.pass);
          sharp!.fill();
        } else {
          sharp!.strokeStyle = css(ink);
          sharp!.lineWidth = 1;
          sharp!.stroke();
        }
        if (light && glow > 0.01) {
          med!.globalAlpha = glow * fade;
          med!.fillStyle = css(hues.b);
          med!.beginPath();
          med!.arc(dx, y, 6, 0, Math.PI * 2);
          med!.fill();
        }
      }
    }

    sharp!.globalAlpha = 1;
    med!.globalAlpha = 1;
    med!.globalCompositeOperation = "source-over";

    if (light) {
      big!.globalCompositeOperation = "copy";
      big!.imageSmoothingEnabled = true;
      big!.imageSmoothingQuality = "high";
      big!.drawImage(medCanvas, 0, 0, bigCanvas.width, bigCanvas.height);
      light.draw(medCanvas, bigCanvas, intro, clearBox);
    }
  }

  /* -- Loop -- */

  let rafId = 0;
  let running = false;
  let visible = true;

  function frame(): void {
    // One clock for everything: the rAF timestamp and performance.now() are
    // not guaranteed to share a base.
    const now = clock();
    if (now >= nextMeasureAt) {
      measure(now);
      nextMeasureAt = now + CYCLE_MS;
    }
    render(now);
    rafId = requestAnimationFrame(frame);
  }

  function start(): void {
    if (running || !visible || document.hidden || reducedMotion.matches) return;
    running = true;
    lastFrame = clock();
    rafId = requestAnimationFrame(frame);
  }

  function stop(): void {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  let resizeQueued = 0;
  const resizeObserver = new ResizeObserver(() => {
    cancelAnimationFrame(resizeQueued);
    resizeQueued = requestAnimationFrame(() => resize());
  });
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
      render(clock());
    } else {
      start();
    }
  };
  reducedMotion.addEventListener?.("change", onReducedMotionChange);

  // Headline fonts can move the line boxes the layout keeps clear of.
  document.fonts?.ready.then(() => resize()).catch(() => {});

  resize();
  start();

  return function destroy(): void {
    stop();
    cancelAnimationFrame(resizeQueued);
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    document.removeEventListener("visibilitychange", onVisibilityChange);
    reducedMotion.removeEventListener?.("change", onReducedMotionChange);
    light?.destroy();
    light = null;
    sprites.clear();
  };
}
