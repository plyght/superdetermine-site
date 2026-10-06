/**
 * Hero option A: superposed tokens.
 *
 * A deep field of code fragments on three depth planes. Most of each fragment
 * is definite, but some tokens hold several values at once (`<` and `<=`,
 * `+ 1` and `- 1`). Each value is a slow orbital smear of copies weighted by
 * its amplitude, and the whole possibility field is rendered as light: a
 * shader blooms it, runs it through a two source interference pattern so its
 * hue follows the phase, and screens it onto the card. Near tokens carry their
 * wavefunction under them, and some tokens in different fragments are
 * entangled, joined by a thread of light.
 *
 * On a timed loop the field is measured. There is nothing to see arrive: the
 * tokens settle onto the value that passes one after another, in a loose
 * cascade, entangled partners settling at the same instant wherever they are.
 * The pass blooms green, and the field then decoheres back into superposition.
 * It runs entirely on its own; there is no pointer interaction.
 */

type RGB = [number, number, number];

interface QState {
  /** 0 superposed, 1 resolved. Integrated per frame toward the target. */
  m: number;
  arriveAt: number;
  releaseAt: number;
  glowAt: number;
  members: Token[];
}

interface Token {
  alts: string[];
  base: number[];
  freq: number[];
  phase: number[];
  col: number;
  line: number;
  cols: number;
  state: QState;
  frag: Fragment;
  /** Centre in CSS pixels, set at layout. */
  cx: number;
  cy: number;
}

interface Fixed {
  text: string;
  col: number;
  line: number;
}

interface Layer {
  name: "far" | "mid" | "near";
  size: number;
  lineHeight: number;
  /** Fragment budget at desktop, tablet and phone widths. */
  count: [number, number, number];
  fixedAlpha: number;
  ghostAlpha: number;
  sharpAlpha: number;
  glowAlpha: number;
  /** Copies per value: the orbital each value smears into. */
  copies: number;
  /** Orbital radius, in multiples of the font size. */
  orbit: number;
  gap: number;
  /** Hard layers never overlap the headline; soft ones fade near it. */
  hard: boolean;
  psi: boolean;
}

interface Fragment {
  layer: Layer;
  fixed: Fixed[];
  tokens: Token[];
  cols: number;
  lines: number;
  x: number;
  y: number;
  /** Fade from the headline clear zone, 0 to 1. */
  mask: number;
  breath: number;
}

/**
 * The source. A token written `{a|b|c}` is superposed, and its first value is
 * the one that passes.
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
  ["{const|let|var} seen = new Set();"],
  ["x {&&|&|??} y"],
  ["n {>=|>} 0"],
  ["fn grade(s) {", "  s.run({check|test|lint})", "}"],
  ["head = {prev|next}"],
  ["{await|yield} save(tree)"],
  ["i{++|--}"],
  ["assert({a === b|a == b})"],
  ["match {ok|err} {"],
  ["k = {k + 1|k << 1|k}"],
  ["{Some(v)|None}"],
  ["sum {+=|-=} w[i];"],
  ["if (len {>|>=} cap) grow()"],
  ["return {lo|hi|mid};"],
  ["defer {close()|flush()}"],
  ["{true|false}"],
];

const LAYERS: Layer[] = [
  {
    name: "near",
    size: 15,
    lineHeight: 23,
    count: [8, 6, 3],
    fixedAlpha: 0.26,
    ghostAlpha: 0.62,
    sharpAlpha: 0.9,
    glowAlpha: 1,
    copies: 6,
    orbit: 0.08,
    gap: 36,
    hard: true,
    psi: true,
  },
  {
    name: "mid",
    size: 12,
    lineHeight: 18,
    count: [18, 12, 7],
    fixedAlpha: 0.32,
    ghostAlpha: 0.55,
    sharpAlpha: 0.6,
    glowAlpha: 0.75,
    copies: 4,
    orbit: 0.1,
    gap: 22,
    hard: true,
    psi: false,
  },
  {
    name: "far",
    size: 10,
    lineHeight: 15,
    count: [46, 30, 18],
    fixedAlpha: 0.3,
    ghostAlpha: 0.45,
    sharpAlpha: 0.5,
    glowAlpha: 0.45,
    copies: 2,
    orbit: 0.1,
    gap: 10,
    hard: false,
    psi: false,
  },
];

/** How long a measurement takes to reach every token, and how loosely. */
const CASCADE_MS = 1800;
const CASCADE_ORDER = 0.45;
const HOLD_MS = 2400;
const FIRST_MEASURE_MS = 3000;
const CYCLE_MS = 8200;
/** Collapse settles quickly but never snaps; decoherence is a slow spread. */
const TAU_UP = 150;
const TAU_DOWN = 900;
const GLOW_MS = 1300;
const INTRO_DELAY_MS = 150;
const INTRO_MS = 1500;
/** Interference wavelength, CSS pixels, and angular speed, radians per second. */
const LAMBDA = 110;
const OMEGA = 0.8;

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

function newState(): QState {
  return {
    m: 0,
    arriveAt: Infinity,
    releaseAt: -Infinity,
    glowAt: -Infinity,
    members: [],
  };
}

function parseFragment(lines: string[], layer: Layer, random: () => number): Fragment {
  const frag: Fragment = {
    layer,
    fixed: [],
    tokens: [],
    cols: 0,
    lines: lines.length,
    x: 0,
    y: 0,
    mask: 1,
    breath: random() * Math.PI * 2,
  };

  lines.forEach((source, line) => {
    let col = 0;
    let last = 0;
    const re = /\{([^}]*)\}/g;
    let match: RegExpExecArray | null;
    const pushFixed = (text: string) => {
      if (text.trim()) frag.fixed.push({ text, col, line });
      col += text.length;
    };
    while ((match = re.exec(source))) {
      pushFixed(source.slice(last, match.index));
      const alts = match[1]!.split("|");
      const width = Math.max(...alts.map((a) => a.length));
      const state = newState();
      const token: Token = {
        alts,
        base: alts.map((_, i) => (i === 0 ? 0.85 : 0.6 + random() * 0.5)),
        freq: alts.map(() => 0.00035 + random() * 0.0005),
        phase: alts.map(() => random() * Math.PI * 2),
        col,
        line,
        cols: width,
        state,
        frag,
        cx: 0,
        cy: 0,
      };
      state.members.push(token);
      frag.tokens.push(token);
      col += width;
      last = match.index + match[0].length;
    }
    pushFixed(source.slice(last));
    frag.cols = Math.max(frag.cols, col);
  });

  return frag;
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
/* The light layer.                                                           */
/*                                                                            */
/* The possibility field is drawn on an offscreen canvas, one channel per     */
/* kind of light: red for the far plane, green for the near and mid planes,   */
/* blue for the green of a pass. The shader blooms each channel at its own    */
/* radius, so depth reads as focus, and turns the result into light.          */
/* ------------------------------------------------------------------------ */

const VERTEX_SHADER = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

interface Palette {
  bg: [RGB, RGB, RGB];
  teal: RGB;
  mint: RGB;
  lime: RGB;
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
uniform float uScale;
uniform vec2 uSize;
uniform sampler2D uField;
uniform sampler2D uMed;
uniform sampler2D uBig;
uniform vec2 uMedPx;
uniform vec2 uBigPx;
uniform float uTime;
uniform float uIntro;
uniform vec4 uSrc;
uniform vec4 uClear;

const vec3 STOP0 = ${glsl(c.bg[0])};
const vec3 STOP1 = ${glsl(c.bg[1])};
const vec3 STOP2 = ${glsl(c.bg[2])};
const vec2 ORIGIN = vec2(0.74, 0.30);
const vec2 SPAN = vec2(1.30, 1.50);
const float MID_STOP = 0.46;

const vec3 TEAL = ${glsl(c.teal)};
const vec3 MINT = ${glsl(c.mint)};
const vec3 LIME = ${glsl(c.lime)};
const vec3 PASS = ${glsl(c.pass)};
const vec3 WHITE = ${glsl(c.ink)};

const float K = ${((2 * Math.PI) / LAMBDA).toFixed(5)};
const float OMEGA = ${OMEGA.toFixed(5)};
const float EXPO = 2.1;
const float GRAIN = 0.012;

float hash21(vec2 p_) {
  p_ = fract(p_ * vec2(127.1, 311.7));
  p_ += dot(p_, p_ + 34.56);
  return fract(p_.x * p_.y);
}

vec3 ring(vec2 uv, float r) {
  vec2 t = r / uSize;
  vec2 d = t * 0.7071;
  vec3 s = texture2D(uField, uv + vec2(t.x, 0.0)).rgb;
  s += texture2D(uField, uv - vec2(t.x, 0.0)).rgb;
  s += texture2D(uField, uv + vec2(0.0, t.y)).rgb;
  s += texture2D(uField, uv - vec2(0.0, t.y)).rgb;
  s += texture2D(uField, uv + d).rgb;
  s += texture2D(uField, uv - d).rgb;
  s += texture2D(uField, uv + vec2(d.x, -d.y)).rgb;
  s += texture2D(uField, uv + vec2(-d.x, d.y)).rgb;
  return s * 0.125;
}

// A small tent over a downsampled copy of the field: the bloom is built by
// shrinking the field on the 2D side, so here it only needs smoothing.
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
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uScale;
  vec2 q = p / uSize;

  float g = length((q - ORIGIN) / SPAN);
  vec3 base = mix(STOP0, STOP1, clamp(g / MID_STOP, 0.0, 1.0));
  base = mix(base, STOP2, clamp((g - MID_STOP) / (1.0 - MID_STOP), 0.0, 1.0));

  vec2 uv = q;
  vec3 c0 = texture2D(uField, uv).rgb;
  vec3 r1 = ring(uv, 1.6);
  vec3 med = soft(uMed, uv, uMedPx);
  vec3 big = soft(uBig, uv, uBigPx);

  float far = 0.2 * r1.r + 0.8 * med.r;
  float near = 0.5 * c0.g + 0.5 * r1.g;
  float halo = 0.9 * med.g + 1.6 * big.g;
  float passLight = 0.2 * c0.b + 0.6 * med.b + 1.8 * big.b;

  // Two coherent sources off the card. Their amplitudes add, so the field is
  // banded by |psi|^2 and its hue follows arg(psi).
  float d1 = length(p - uSrc.xy);
  float d2 = length(p - uSrc.zw);
  float a1 = d1 * K - uTime * OMEGA;
  float a2 = d2 * K - uTime * OMEGA * 1.07;
  vec2 psi = vec2(cos(a1) + cos(a2), sin(a1) + sin(a2));
  float I = dot(psi, psi) * 0.25;
  float arg = atan(psi.y, psi.x);

  float clear = smoothstep(0.0, 110.0, boxDist(p, uClear));
  float field = 0.3 + 0.7 * clear;

  float L = (near * 1.0 + halo * 0.5 + far * 0.6) * (0.5 + 0.9 * I) + I * 0.006 * field;
  float a = 1.0 - exp(-pow(max(L, 0.0) * EXPO, 0.85));

  vec3 hue = mix(TEAL, MINT, 0.5 + 0.5 * cos(arg));
  hue = mix(hue, LIME, 0.3 * smoothstep(0.2, 1.0, sin(arg)));
  hue = mix(hue, WHITE, 0.35 * smoothstep(0.45, 1.0, a));

  vec3 col = screenBlend(base, hue * a * field * uIntro);

  float pa = 1.0 - exp(-passLight * 2.4);
  col = screenBlend(col, mix(PASS, WHITE, 0.25 * pa) * pa * uIntro);

  col += (hash21(gl_FragCoord.xy) - 0.5) * GRAIN;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
}

interface LightFrame {
  time: number;
  intro: number;
  src: [number, number, number, number];
  clear: [number, number, number, number];
}

interface Light {
  draw(layers: HTMLCanvasElement[], f: LightFrame): void;
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

  const textures = [0, 1, 2].map((unit) => {
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
  const uScale = u("uScale");
  const uSize = u("uSize");
  const uField = u("uField");
  const uTime = u("uTime");
  const uIntro = u("uIntro");
  const uSrc = u("uSrc");
  const uClear = u("uClear");
  gl.uniform1i(uField, 0);
  gl.uniform1i(u("uMed"), 1);
  gl.uniform1i(u("uBig"), 2);
  const uMedPx = u("uMedPx");
  const uBigPx = u("uBigPx");

  let scale = 1;
  let wCss = 1;
  let hCss = 1;
  let wPx = 1;
  let hPx = 1;

  return {
    resize(w, h, s) {
      scale = s;
      wCss = w;
      hCss = h;
      wPx = Math.max(1, Math.round(w * s));
      hPx = Math.max(1, Math.round(h * s));
      canvas.width = wPx;
      canvas.height = hPx;
      gl.viewport(0, 0, wPx, hPx);
    },
    draw(layers, f) {
      layers.forEach((layer, unit) => {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, layer);
      });
      gl.uniform2f(uMedPx, layers[1]!.width, layers[1]!.height);
      gl.uniform2f(uBigPx, layers[2]!.width, layers[2]!.height);
      gl.uniform2f(uRes, wPx, hPx);
      gl.uniform1f(uScale, wPx / wCss);
      gl.uniform2f(uSize, wCss, hCss);
      gl.uniform1f(uTime, f.time);
      gl.uniform1f(uIntro, f.intro);
      gl.uniform4f(uSrc, ...f.src);
      gl.uniform4f(uClear, ...f.clear);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      void scale;
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

type Hue = "r" | "g" | "b" | "ink" | "settled" | "pass";

export function initHeroA(host: HTMLElement): () => void {
  const lightCanvas = host.querySelector<HTMLCanvasElement>("[data-hero-a-light]");
  const sharpCanvas = host.querySelector<HTMLCanvasElement>("[data-hero-a-sharp]");
  if (!lightCanvas || !sharpCanvas) return () => {};
  const sharp = sharpCanvas.getContext("2d");
  const fieldCanvas = document.createElement("canvas");
  const fieldCtx = fieldCanvas.getContext("2d");
  // The bloom: the field shrunk twice. Downsampling is the blur.
  const medCanvas = document.createElement("canvas");
  const bigCanvas = document.createElement("canvas");
  const medCtx = medCanvas.getContext("2d");
  const bigCtx = bigCanvas.getContext("2d");
  // No 2D context leaves the card as its CSS gradient, which is a finished look.
  if (!sharp || !fieldCtx) return () => {};

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
    teal: read("--ha-teal", [56, 204, 219]),
    mint: read("--ha-mint", [66, 224, 138]),
    lime: read("--ha-lime", [204, 245, 117]),
    pass,
    ink,
  };
  const hues: Record<Hue, RGB> = {
    r: [255, 0, 0],
    g: [0, 255, 0],
    b: [0, 0, 255],
    ink,
    settled: mix(ink, pass, 0.22),
    pass,
  };
  const mono =
    style.getPropertyValue("--font-mono").trim() ||
    "ui-monospace, SFMono-Regular, Menlo, monospace";

  let light = createLight(lightCanvas, palette);
  // Without WebGL the possibility field is drawn plainly onto the sharp layer.
  const field = light ? fieldCtx : sharp;

  const seed = Math.floor(Math.random() * 1e9);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  // Lab only: `?slow=0.2` runs the field at a fifth of its speed, so slow
  // screenshot tooling can catch a moment mid-measurement.
  const params = new URLSearchParams(location.search);
  const timeScale = Math.min(Math.max(Number(params.get("slow")) || 1, 0.01), 1);
  const realStart = performance.now();
  const clock = () => realStart + (performance.now() - realStart) * timeScale;
  const startedAt = clock();

  let width = 1;
  let height = 1;
  let dpr = 1;
  let fieldScale = 1;
  let fragments: Fragment[] = [];
  let tokens: Token[] = [];
  let states: QState[] = [];
  let clearBox: [number, number, number, number] = [0, 0, 0, 0];
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
    c.width = Math.ceil(g.measureText(text).width) + pad * 2;
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
    text: string,
    size: number,
    hue: Hue,
    x: number,
    y: number,
    alpha: number,
  ): void {
    if (alpha < 0.003) return;
    let h = hue;
    let a = alpha;
    if (!light && target === sharp && (hue === "r" || hue === "g" || hue === "b")) {
      h = hue === "b" ? "pass" : "ink";
      a *= hue === "g" ? 0.35 : 0.2;
    }
    const scale = target === sharp ? dpr : fieldScale;
    const s = sprite(text, size, h, scale);
    target.globalAlpha = a > 1 ? 1 : a;
    const pad = Math.ceil(2 * scale) / scale;
    target.drawImage(s, x - pad, y - s.height / scale / 2, s.width / scale, s.height / scale);
  }

  /* -- Layout -- */

  function exclusions(): Rect[] {
    const box = host.getBoundingClientRect();
    const out: Rect[] = [];
    const pad = width < 640 ? 12 : 20;
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
    const edge = tier === 2 ? 14 : 22;
    fragments = [];
    const nearRects: Rect[] = [];

    for (const layer of LAYERS) {
      sharp!.font = `450 ${layer.size}px ${mono}`;
      const cw = sharp!.measureText("0").width || layer.size * 0.6;
      charW.set(layer.size, cw);

      const placed: Rect[] = [];
      const budget = layer.count[tier];
      let attempts = 0;
      while (placed.length < budget && attempts < budget * 40) {
        attempts++;
        const lines = SOURCE[Math.floor(random() * SOURCE.length)]!;
        const frag = parseFragment(lines, layer, random);
        const w = frag.cols * cw;
        const h = frag.lines * layer.lineHeight;
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

        frag.x = Math.round(x);
        frag.y = Math.round(y);
        if (!layer.hard) {
          const d = Math.min(...avoid.map((r) => distToRect(x + w / 2, y + h / 2, r)), 999);
          const inside = avoid.some((r) => overlaps(rect, r));
          frag.mask = inside ? 0.15 : 0.3 + 0.7 * smooth(0, 90, d);
        }
        placed.push(rect);
        if (layer.name === "near") nearRects.push(padded);
        fragments.push(frag);
      }
    }

    tokens = [];
    for (const f of fragments) {
      const cw = charW.get(f.layer.size)!;
      for (const t of f.tokens) {
        t.cx = f.x + (t.col + t.cols / 2) * cw;
        t.cy = f.y + (t.line + 0.5) * f.layer.lineHeight;
        tokens.push(t);
      }
    }

    // Entanglement: pairs of near or mid tokens in different fragments share
    // one state, so they resolve at the same instant wherever they are.
    const candidates = tokens.filter((t) => t.frag.layer.name !== "far");
    const pairs = tier === 2 ? 2 : tier === 1 ? 4 : 5;
    let made = 0;
    for (let i = 0; i < candidates.length && made < pairs; i++) {
      const a = candidates[i]!;
      if (a.state.members.length > 1) continue;
      for (let j = i + 1; j < candidates.length; j++) {
        const b = candidates[j]!;
        if (b.frag === a.frag || b.state.members.length > 1) continue;
        const d = Math.hypot(a.cx - b.cx, a.cy - b.cy);
        if (d < (tier === 2 ? 120 : 260) || d > (tier === 2 ? 420 : 760)) continue;
        a.state.members.push(b);
        b.state = a.state;
        made++;
        break;
      }
    }
    states = [...new Set(tokens.map((t) => t.state))];
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
    // The field is bloomed in the shader, so it never needs full resolution.
    fieldScale = Math.min(dpr, 1.25);
    fieldCanvas.width = Math.round(width * fieldScale);
    fieldCanvas.height = Math.round(height * fieldScale);
    fieldCtx!.setTransform(fieldScale, 0, 0, fieldScale, 0, 0);
    medCanvas.width = Math.max(1, Math.round(width / 3));
    medCanvas.height = Math.max(1, Math.round(height / 3));
    bigCanvas.width = Math.max(1, Math.round(width / 9));
    bigCanvas.height = Math.max(1, Math.round(height / 9));
    light?.resize(width, height, Math.min(dpr, LIGHT_DPR));
    layout();
    if (!running) render(clock());
  }

  /* -- Measurement -- */

  // Lab only: `?auto=0` stops the timed measurements, for screenshots.
  const auto = params.get("auto") !== "0";
  let nextAutoAt = auto ? startedAt + FIRST_MEASURE_MS : Infinity;
  let fromLeft = true;

  const isOn = (s: QState, now: number) => now >= s.arriveAt && now < s.releaseAt;

  /**
   * Measure the field. Each state settles at its own moment within the
   * cascade: loosely ordered across the card, never as a visible front. An
   * entangled state settles when the first of its members would.
   */
  function measure(now: number): void {
    for (const s of states) {
      let across = 1;
      for (const t of s.members) {
        const u = Math.min(Math.max(t.cx / width, 0), 1);
        across = Math.min(across, fromLeft ? u : 1 - u);
      }
      const order = CASCADE_ORDER * across + (1 - CASCADE_ORDER) * Math.random();
      const arrive = now + order * CASCADE_MS;
      const hold = arrive + HOLD_MS + Math.random() * 1200;
      if (isOn(s, now)) {
        s.releaseAt = Math.max(s.releaseAt, hold);
      } else {
        s.arriveAt = arrive;
        s.releaseAt = hold;
      }
    }
    fromLeft = !fromLeft;
  }

  /* -- Drawing -- */

  function sources(time: number): [number, number, number, number] {
    return [
      width * (0.58 + 0.1 * Math.sin(time * 0.05)),
      -height * 0.4,
      width * (1.1 + 0.05 * Math.cos(time * 0.04)),
      height * (0.9 + 0.15 * Math.sin(time * 0.045)),
    ];
  }

  let lastFrame = startedAt;

  function render(now: number): void {
    const still = reducedMotion.matches;
    const time = still ? 47 : now / 1000;
    const tms = time * 1000;
    const intro = still ? 1 : smooth(0, 1, (now - startedAt - INTRO_DELAY_MS) / INTRO_MS);
    const dt = Math.min(Math.max(now - lastFrame, 0), 100);
    lastFrame = now;

    if (!still) {
      for (const s of states) {
        const target = isOn(s, now) ? 1 : 0;
        const before = s.m;
        const tau = target > s.m ? TAU_UP : TAU_DOWN;
        s.m += (target - s.m) * (1 - Math.exp(-dt / tau));
        if (Math.abs(target - s.m) < 0.001) s.m = target;
        if (before < 0.4 && s.m >= 0.4) s.glowAt = now;
      }
    }

    for (const g of light ? [sharp!, fieldCtx!] : [sharp!]) {
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";
      g.clearRect(0, 0, width, height);
      g.globalCompositeOperation = "lighter";
    }
    if (!light) sharp!.globalCompositeOperation = "source-over";

    const glowOf = (s: QState) => (s.m > 0.05 ? Math.exp(-(now - s.glowAt) / GLOW_MS) : 0);

    for (const f of fragments) {
      const L = f.layer;
      const cw = charW.get(L.size)!;
      const channel: Hue = L.name === "far" ? "r" : "g";
      const fade = f.mask * (light ? 1 : intro);

      let resolved = 0;
      let glow = 0;
      for (const t of f.tokens) {
        resolved += t.state.m;
        glow = Math.max(glow, glowOf(t.state));
      }
      resolved /= Math.max(1, f.tokens.length);

      const breath = 0.85 + 0.15 * Math.sin(time * 0.35 + f.breath);
      const fixedA = L.fixedAlpha * (1 + 0.6 * resolved) * breath * fade;
      for (const s of f.fixed) {
        const x = f.x + s.col * cw;
        const y = f.y + (s.line + 0.5) * L.lineHeight;
        if (L.name === "near") {
          stamp(sharp!, s.text, L.size, "ink", x, y, fixedA * intro);
          if (glow > 0.02)
            stamp(sharp!, s.text, L.size, "pass", x, y, fixedA * glow * 0.45 * intro);
        } else {
          stamp(field, s.text, L.size, channel, x, y, fixedA);
        }
        if (glow > 0.02) stamp(field, s.text, L.size, "b", x, y, fixedA * glow * 0.35);
      }

      for (const t of f.tokens) {
        const s = t.state;
        const m = s.m;
        const g = glowOf(s);
        const x = f.x + t.col * cw;
        const y = f.y + (t.line + 0.5) * L.lineHeight;
        const unresolved = 1 - m;

        if (unresolved > 0.003) {
          let total = 0;
          const p = t.alts.map((_, i) => {
            const v = t.base[i]! * (1 + 0.55 * Math.sin(tms * t.freq[i]! + t.phase[i]!));
            total += v;
            return v;
          });
          const n = t.alts.length;
          const orbit = L.size * L.orbit;
          for (let i = 0; i < n; i++) {
            const prob = p[i]! / total;
            const a = (L.ghostAlpha * Math.pow(prob, 0.7) * unresolved * fade * 1.6) / L.copies;
            if (a < 0.002) continue;
            // Each value is an orbital: copies spread round an ellipse, wider
            // for the less likely values, the values stacked a little apart.
            const stack = (i - (n - 1) / 2) * L.size * 0.48 * unresolved;
            const spread = orbit * (1 + 1.4 * (1 - prob)) * unresolved;
            for (let k = 0; k < L.copies; k++) {
              const th = time * (0.3 + 0.1 * i) + (k / L.copies) * Math.PI * 2 + t.phase[i]!;
              const ox = Math.cos(th) * spread * 1.1;
              const oy = Math.sin(th) * spread * 0.6 + stack;
              stamp(field, t.alts[i]!, L.size, channel, x + ox, y + oy, a);
            }
          }
        }

        if (m > 0.003) {
          const a = L.sharpAlpha * m * fade;
          if (L.name === "far") {
            stamp(field, t.alts[0]!, L.size, "r", x, y, a);
          } else {
            stamp(sharp!, t.alts[0]!, L.size, "settled", x, y, a * intro);
            if (g > 0.01) stamp(sharp!, t.alts[0]!, L.size, "pass", x, y, a * g * intro);
          }
          if (g > 0.01) stamp(field, t.alts[0]!, L.size, "b", x, y, L.glowAlpha * g * m * fade);
        }

        if (L.psi) drawPsi(t, x, y + L.size * 1.05, cw, m, g, time, fade);
      }
    }

    drawThreads(time, glowOf);

    sharp!.globalAlpha = 1;
    sharp!.globalCompositeOperation = "source-over";
    fieldCtx!.globalAlpha = 1;
    fieldCtx!.globalCompositeOperation = "source-over";

    if (light) {
      for (const [g, c, from] of [
        [medCtx, medCanvas, fieldCanvas],
        [bigCtx, bigCanvas, medCanvas],
      ] as const) {
        if (!g) continue;
        g.globalCompositeOperation = "copy";
        g.imageSmoothingEnabled = true;
        g.imageSmoothingQuality = "high";
        g.drawImage(from, 0, 0, c.width, c.height);
      }
      light.draw([fieldCanvas, medCanvas, bigCanvas], {
        time,
        intro,
        src: sources(time),
        clear: clearBox,
      });
    }
  }

  /** The wavefunction under a near token: spread while superposed, one peak once measured. */
  function drawPsi(
    t: Token,
    x: number,
    y: number,
    cw: number,
    m: number,
    g: number,
    time: number,
    fade: number,
  ): void {
    const w = t.cols * cw + 16;
    const x0 = x - 8;
    const steps = 32;
    const k = (Math.PI * 2 * (2 + t.alts.length)) / w;
    field.beginPath();
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const env = Math.exp(-Math.pow((u - 0.5) / 0.28, 2));
      const wave = Math.cos(u * w * k - time * 1.1 + t.phase[0]!) * env * 2.6 * (1 - m);
      const peak = Math.exp(-Math.pow((u - 0.5) / 0.08, 2)) * 5 * m;
      const px = x0 + u * w;
      const py = y - wave - peak;
      if (i === 0) field.moveTo(px, py);
      else field.lineTo(px, py);
    }
    field.lineWidth = 1;
    field.strokeStyle = css(light ? hues.g : ink);
    field.globalAlpha = Math.min(1, (light ? 0.5 : 0.15) * (0.6 + 0.4 * (1 - m)) * fade);
    field.stroke();
    if (g > 0.02 || m > 0.02) {
      field.strokeStyle = css(light ? hues.b : pass);
      field.globalAlpha = Math.min(1, (0.25 * m + 0.6 * g) * fade);
      field.stroke();
    }
  }

  /** Entanglement threads: a faint dotted line of light, lit green as the pair resolves. */
  function drawThreads(time: number, glowOf: (s: QState) => number): void {
    for (const s of states) {
      if (s.members.length < 2) continue;
      const [a, c] = s.members as [Token, Token];
      const mx = (a.cx + c.cx) / 2;
      const my = (a.cy + c.cy) / 2;
      const dx = c.cx - a.cx;
      const dy = c.cy - a.cy;
      const bow = 0.14 * Math.sin(time * 0.25 + a.phase[0]!);
      const qx = mx - dy * bow;
      const qy = my + dx * bow;
      const glow = glowOf(s);
      const path = () => {
        field.beginPath();
        field.moveTo(a.cx, a.cy + 10);
        field.quadraticCurveTo(qx, qy + 10, c.cx, c.cy + 10);
      };

      field.setLineDash([1, 9]);
      field.lineDashOffset = -time * 5;
      field.lineWidth = 1.2;
      field.strokeStyle = css(light ? hues.g : ink);
      field.globalAlpha = light ? 0.2 + 0.2 * s.m : 0.08;
      path();
      field.stroke();
      field.setLineDash([]);

      if (glow > 0.02) {
        field.strokeStyle = css(light ? hues.b : pass);
        field.globalAlpha = 0.4 * glow;
        field.lineWidth = 1;
        path();
        field.stroke();
      }
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
    if (now >= nextAutoAt) {
      measure(now);
      nextAutoAt = now + CYCLE_MS;
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
