/**
 * Option F: an orbital of code.
 *
 * The light is a hydrogen electron in a superposition of two energy
 * eigenstates, 4d(z^2) and 5f(z^3). A single eigenstate is stationary: its
 * density never moves. A superposition of two is not. The cross term
 * 2AB psi1 psi2 cos(dE t) oscillates at the beat frequency, and because one
 * state is even along the axis and the other is odd, the density sloshes from
 * one end of the orbital to the other, which is the oscillating dipole an atom
 * radiates from. The shader ray marches |psi|^2 through the volume and paints
 * it as emitted light, with hue following the relative phase of psi. Each
 * state has one radial node, so the light sits in nested shells of opposite
 * sign, and the hue turns over from one shell to the next.
 *
 * A few thousand code glyphs, sampled from the same density, drift inside the
 * light as faint material and carry the same weights.
 *
 * Measurement runs on its own slow loop; the cursor never steers it. The
 * 5f part decays away (5f to 4d is an allowed dipole transition, and the
 * photon leaves as a faint ring brightest across the axis, as dipole radiation
 * does). What is left is one still, symmetric 4d eigenstate in passing green,
 * and the measured state resolves at the nucleus. Then the superposition
 * re-forms.
 */

const MAX_DPR = 2;

const INTRO_DELAY_MS = 120;
const INTRO_DURATION_MS = 1300;

/** Seconds per phase of the measurement loop. */
const SPREAD_FIRST = 6.5;
const SPREAD = 10.5;
const COLLAPSE = 1.6;
const HOLD = 3.2;
const RELEASE = 3.0;

/**
 * The superposition's mixing angle: amplitudes cos and sin of it. Leaning past
 * an even split shows more of the larger 5f state before the decay.
 */
const THETA = 0.92;

/** One slosh of the superposition, in seconds. */
const BEAT_PERIOD = 9;

/**
 * The axis leans in the plane of the card and nods slowly in depth, so the
 * orbital is always seen near side on, where its shape reads best. Rates in
 * rad/s, angles in radians. The spin about the axis only shows in the glyphs.
 */
const NOD_RATE = 0.06;
const NOD = 0.55;
const SPIN = 0.07;
const LEAN = 0.42;
const PITCH = 0.2;

/** Bounding radius of the volume, in Bohr radii, and the camera distance. */
const BOUND = 56;
const CAM = 280;

/** Volume buffer resolution, as a fraction of CSS pixels. */
const VOLUME_SCALE = 0.66;
const STEPS = 72;

/** Glyphs per square CSS pixel of card, and their bounds. */
const GLYPH_DENSITY = 0.0042;
const GLYPH_MIN = 700;
const GLYPH_MAX = 4200;
const GLYPHS = "{}()[]<>=;:+-*/&?0xyfnrtes_.%#";

/**
 * Real hydrogen eigenstates in Bohr radii, normalised numerically, then scaled
 * together so the 4d peak amplitude is 1. Unnormalised:
 * psi_420 = (3z^2 - r^2) (1 - r/12) e^(-r/4)
 * psi_530 = (5z^3 - 3zr^2) (1 - r/20) e^(-r/5)
 */
const R1 = (r: number) => r * r * (1 - r / 12) * Math.exp(-r / 4);
const R2 = (r: number) => r * r * r * (1 - r / 20) * Math.exp(-r / 5);
const [C1, C2] = (() => {
  let i1 = 0;
  let i2 = 0;
  let peak = 0;
  for (let r = 0.005; r < 400; r += 0.01) {
    i1 += R1(r) ** 2 * r * r * 0.01;
    i2 += R2(r) ** 2 * r * r * 0.01;
  }
  const k1 = Math.sqrt(5 / (16 * Math.PI) / i1);
  const k2 = Math.sqrt(7 / (16 * Math.PI) / i2);
  for (let z = 0; z < 80; z += 0.01) peak = Math.max(peak, Math.abs(k1 * 2 * R1(z)));
  return [k1 / peak, k2 / peak];
})();

const f = (n: number): string => n.toFixed(9);

const FULLSCREEN_VS = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const PRECISION = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

/** The two eigenstates, shared by both programs that need them. */
const ORBITALS = `
const float C1 = ${f(C1)};
const float C2 = ${f(C2)};
vec2 orbitals(vec3 x) {
  float r = length(x);
  float z = x.z;
  float r2 = r * r;
  float p1 = C1 * (3.0 * z * z - r2) * (1.0 - r / 12.0) * exp(-r / 4.0);
  float p2 = C2 * (5.0 * z * z * z - 3.0 * z * r2) * (1.0 - r / 20.0) * exp(-r / 5.0);
  return vec2(p1, p2);
}
`;

/** Soft keep-out around the headline's line boxes, in device pixels. */
const AVOID = `
#define AVOID_N 8
uniform vec4 uAvoid[AVOID_N];
uniform float uFeather;
float avoidMask(vec2 p) {
  float cover = 0.0;
  for (int i = 0; i < AVOID_N; i++) {
    vec4 r = uAvoid[i];
    if (r.z <= r.x) continue;
    vec2 c = 0.5 * (r.xy + r.zw);
    vec2 h = 0.5 * (r.zw - r.xy);
    vec2 d = abs(p - c) - h;
    float sd = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
    cover = max(cover, 1.0 - smoothstep(-uFeather * 0.35, uFeather, sd));
  }
  return 1.0 - 0.86 * cover;
}
`;

const VOLUME_FS = `
${PRECISION}
uniform vec2  uRes;
uniform vec2  uCenter;
uniform float uPx;
uniform mat3  uRot;
uniform vec2  uAB;
uniform float uBeat;
uniform float uGain;

const float BOUND = ${f(BOUND)};
const float CAM = ${f(CAM)};
const int STEPS = ${STEPS};

${ORBITALS}

float hash21(vec2 p_) {
  p_ = fract(p_ * vec2(127.1, 311.7));
  p_ += dot(p_, p_ + 34.56);
  return fract(p_.x * p_.y);
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 q = (frag - uCenter) / uPx;
  q.y = -q.y;

  vec3 ro = vec3(0.0, 0.0, CAM);
  vec3 rd = normalize(vec3(q, 0.0) - ro);
  float b = dot(ro, rd);
  float c = dot(ro, ro) - BOUND * BOUND;
  float disc = b * b - c;
  if (disc <= 0.0) {
    gl_FragColor = vec4(0.0, 0.5, 0.5, 0.0);
    return;
  }
  float s = sqrt(disc);
  float t0 = -b - s;
  float t1 = -b + s;

  // Into the orbital's own frame: v * M is the transpose of M applied to v.
  vec3 o = ro * uRot;
  vec3 d = rd * uRot;

  float dt = (t1 - t0) / float(STEPS);
  float t = t0 + dt * hash21(frag);
  float A = uAB.x;
  float B = uAB.y;
  float cb = cos(uBeat);
  float sb = sin(uBeat);

  float I = 0.0;
  float hc = 0.0;
  float hs = 0.0;
  for (int i = 0; i < STEPS; i++) {
    vec2 p = orbitals(o + d * t);
    float re = A * p.x + B * p.y * cb;
    float im = -B * p.y * sb;
    float rho = re * re + im * im;
    float inv = inversesqrt(rho + 1e-9);
    I += rho;
    hc += rho * re * inv;
    hs += rho * im * inv;
    t += dt;
  }
  I *= dt;
  float L = 1.0 - exp(-pow(I * uGain, 1.1));
  float n = max(I / dt, 1e-9);
  gl_FragColor = vec4(L, 0.5 + 0.5 * hc / n, 0.5 + 0.5 * hs / n, 1.0);
}
`;

const COMPOSITE_FS = `
${PRECISION}
uniform vec2  uRes;
uniform vec2  uCenter;
uniform float uScale;
uniform sampler2D uVol;
uniform vec3  uStop0;
uniform vec3  uStop1;
uniform vec3  uStop2;
uniform vec3  uTeal;
uniform vec3  uMint;
uniform vec3  uLime;
uniform vec3  uWhite;
uniform vec3  uPass;
uniform float uCollapse;
uniform float uIntro;
uniform vec2  uAxis;
uniform vec3  uRing;

const float GRAIN = 0.012;

${AVOID}

float hash21(vec2 p_) {
  p_ = fract(p_ * vec2(127.1, 311.7));
  p_ += dot(p_, p_ + 34.56);
  return fract(p_.x * p_.y);
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = frag / uRes;

  vec2 cn = uCenter / uRes;
  float g = length((p - cn) / vec2(1.15, 1.4));
  vec3 base = mix(uStop0, uStop1, clamp(g / 0.44, 0.0, 1.0));
  base = mix(base, uStop2, clamp((g - 0.44) / 0.56, 0.0, 1.0));

  // The volume is soft by nature; while the intro runs it is softer still.
  vec4 v = texture2D(uVol, uv);
  float spread = (1.0 - uIntro) * 10.0 * uScale;
  if (spread > 0.1) {
    vec2 px = spread / uRes;
    v = 0.2 * v
      + 0.2 * texture2D(uVol, uv + vec2(px.x, 0.0))
      + 0.2 * texture2D(uVol, uv - vec2(px.x, 0.0))
      + 0.2 * texture2D(uVol, uv + vec2(0.0, px.y))
      + 0.2 * texture2D(uVol, uv - vec2(0.0, px.y));
  }
  float L = v.r;
  float hc = v.g * 2.0 - 1.0;
  float hs = v.b * 2.0 - 1.0;

  // Bloom: two rings of taps around the pixel, so bright lobes spill a little
  // light into the field the way an optical system does.
  float bloom = 0.0;
  for (int i = 0; i < 8; i++) {
    float ang = float(i) * 0.785398 + 0.3;
    vec2 dirB = vec2(cos(ang), sin(ang));
    bloom += texture2D(uVol, uv + dirB * 16.0 * uScale / uRes).r;
    bloom += texture2D(uVol, uv + vec2(-dirB.y, dirB.x) * 38.0 * uScale / uRes).r;
  }
  bloom /= 16.0;

  // Phase colour, held to a quiet band of greens: one sign of psi reads mint,
  // the other teal, and the interference between the states leans lime.
  vec3 hue = mix(uTeal, uMint, 0.5 + 0.5 * hc);
  hue = mix(hue, uLime, 0.55 * smoothstep(0.05, 0.9, abs(hs)));
  hue = mix(hue, mix(uPass, uWhite, 0.25), 0.8 * uCollapse);
  hue = mix(hue, uWhite, smoothstep(0.6, 1.0, L) * 0.35);

  // The photon from the decay: a ring leaving the nucleus, brightest across
  // the dipole axis and dark along it, as dipole radiation is.
  vec2 dc = frag - uCenter;
  float rr = length(dc);
  vec2 dir = dc / max(rr, 1.0);
  float cosAx = dot(dir, uAxis);
  float sin2 = 1.0 - cosAx * cosAx;
  float rw = (rr - uRing.x) / (26.0 * uScale);
  float ring = uRing.y * sin2 * exp(-rw * rw);

  float mask = avoidMask(frag);
  float a = clamp((L * 0.78 + bloom * bloom * 0.28) * mask * uIntro, 0.0, 1.0);
  float rg = clamp(ring * mask * uIntro, 0.0, 1.0);

  vec3 col = 1.0 - (1.0 - base) * (1.0 - hue * a);
  col = 1.0 - (1.0 - col) * (1.0 - mix(uPass, uWhite, 0.4) * rg);

  col += (hash21(frag) - 0.5) * GRAIN;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

const GLYPH_VS = `
attribute vec3 aPos;
attribute vec2 aAmp;
attribute vec2 aGlyph;

uniform vec2  uRes;
uniform vec2  uCenter;
uniform float uPx;
uniform mat3  uRot;
uniform vec2  uAB;
uniform float uBeat;
uniform float uSize;
uniform float uAlpha;
uniform float uCollapse;
uniform float uIntro;
uniform vec3  uTeal;
uniform vec3  uMint;
uniform vec3  uLime;
uniform vec3  uWhite;
uniform vec3  uPass;

const float CAM = ${f(CAM)};
const float BOUND = ${f(BOUND)};

${AVOID}

varying vec3  vCol;
varying float vAlpha;
varying float vBlur;
varying float vGlyph;

void main() {
  vec3 w = uRot * aPos;
  float persp = CAM / (CAM - w.z);
  vec2 screen = uCenter + vec2(w.x, -w.y) * uPx * persp;
  gl_Position = vec4(screen / uRes * 2.0 - 1.0, 0.0, 1.0);
  gl_Position.y = -gl_Position.y;

  // The same amplitudes as the light, weighted against the density the glyph
  // was sampled from, so the glyphs follow the slosh and the decay exactly.
  float A = uAB.x;
  float B = uAB.y;
  float re = A * aAmp.x + B * aAmp.y * cos(uBeat);
  float im = -B * aAmp.y * sin(uBeat);
  float weight = re * re + im * im;
  float inv = inversesqrt(weight + 1e-6);

  vec3 hue = mix(uTeal, uMint, 0.5 + 0.5 * re * inv);
  hue = mix(hue, uLime, 0.55 * smoothstep(0.05, 0.9, abs(im * inv)));
  hue = mix(hue, uPass, 0.8 * uCollapse);
  vCol = mix(hue, uWhite, 0.45);

  float depth = clamp(w.z / BOUND, -1.0, 1.0);
  vBlur = clamp(abs(w.z) / 20.0 * (1.0 - 0.6 * uCollapse) + (1.0 - uIntro), 0.0, 1.0);

  float a = uAlpha * weight / (1.0 + 0.45 * weight);
  a *= mix(0.35, 1.0, 0.5 + 0.5 * depth);
  a *= mix(1.0, 0.55, vBlur);
  a *= avoidMask(screen) * uIntro * aGlyph.y;
  vAlpha = a;
  vGlyph = aGlyph.x;

  gl_PointSize = a < 0.004 ? 0.0 : uSize * persp * (1.0 + 0.5 * vBlur);
}
`;

const GLYPH_FS = `
${PRECISION}
uniform sampler2D uAtlas;
uniform float uCols;

varying vec3  vCol;
varying float vAlpha;
varying float vBlur;
varying float vGlyph;

void main() {
  float col = mod(vGlyph, uCols);
  float row = floor(vGlyph / uCols);
  vec2 cell = (vec2(col, row) + gl_PointCoord) / uCols;
  float sharp = texture2D(uAtlas, vec2(cell.x * 0.5, cell.y)).a;
  float soft = texture2D(uAtlas, vec2(0.5 + cell.x * 0.5, cell.y)).a;
  float a = mix(sharp, soft, vBlur) * vAlpha;
  gl_FragColor = vec4(vCol * a, a);
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error("Orbital shader compile error: " + log);
  }
  return shader;
}

function link(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram {
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const fr = compile(gl, gl.FRAGMENT_SHADER, fs);
  const program = gl.createProgram()!;
  gl.attachShader(program, v);
  gl.attachShader(program, fr);
  gl.linkProgram(program);
  gl.deleteShader(v);
  gl.deleteShader(fr);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error("Orbital program link error: " + gl.getProgramInfoLog(program));
  }
  return program;
}

/** Reads a `#rrggbb` custom property off the host, so the CSS owns the palette. */
function readColor(host: HTMLElement, name: string, fallback: string): [number, number, number] {
  const raw = getComputedStyle(host).getPropertyValue(name).trim();
  const hex = /^#[0-9a-f]{6}$/i.test(raw) ? raw : fallback;
  const value = parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function readNumber(host: HTMLElement, name: string, fallback: number): number {
  const value = Number.parseFloat(getComputedStyle(host).getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Column-major 3x3 product. */
function mul(a: number[], b: number[]): number[] {
  const out = new Array<number>(9);
  for (let c = 0; c < 3; c++) {
    for (let r = 0; r < 3; r++) {
      out[c * 3 + r] = a[r]! * b[c * 3]! + a[3 + r]! * b[c * 3 + 1]! + a[6 + r]! * b[c * 3 + 2]!;
    }
  }
  return out;
}

const rotX = (t: number) => [1, 0, 0, 0, Math.cos(t), Math.sin(t), 0, -Math.sin(t), Math.cos(t)];
const rotY = (t: number) => [Math.cos(t), 0, -Math.sin(t), 0, 1, 0, Math.sin(t), 0, Math.cos(t)];
const rotZ = (t: number) => [Math.cos(t), Math.sin(t), 0, -Math.sin(t), Math.cos(t), 0, 0, 0, 1];

/** Orbital z onto screen up, orbital y into the screen. */
const UPRIGHT = [1, 0, 0, 0, 0, -1, 0, 1, 0];

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

/**
 * Rejection samples glyph positions from the equal mixture of both densities,
 * and stores each glyph's two amplitudes divided by the square root of that
 * mixture. The shader's |A u1 + B u2 e^(-i dE t)|^2 is then exactly the
 * importance weight that turns the fixed sample into the live density.
 */
function sampleGlyphs(count: number): Float32Array {
  const rand = mulberry32(0x5d7e);
  const L = 54;
  const psi = (x: number, y: number, z: number): [number, number] => {
    const r = Math.hypot(x, y, z);
    const r2 = r * r;
    return [
      C1 * (3 * z * z - r2) * (1 - r / 12) * Math.exp(-r / 4),
      C2 * (5 * z * z * z - 3 * z * r2) * (1 - r / 20) * Math.exp(-r / 5),
    ];
  };
  let max = 0;
  for (let x = 0; x <= L; x += 0.5) {
    for (let z = -L; z <= L; z += 0.5) {
      const [a, b] = psi(x, 0, z);
      max = Math.max(max, 0.5 * (a * a + b * b));
    }
  }
  max *= 1.08;

  const out = new Float32Array(count * 7);
  let n = 0;
  let guard = 0;
  while (n < count && guard++ < 4e6) {
    const x = (rand() * 2 - 1) * L;
    const y = (rand() * 2 - 1) * L;
    const z = (rand() * 2 - 1) * L;
    const [a, b] = psi(x, y, z);
    const p = 0.5 * (a * a + b * b);
    if (rand() * max >= p) continue;
    const s = 1 / Math.sqrt(p);
    const o = n * 7;
    out[o] = x;
    out[o + 1] = y;
    out[o + 2] = z;
    out[o + 3] = a * s;
    out[o + 4] = b * s;
    out[o + 5] = Math.floor(rand() * GLYPHS.length);
    // A little per glyph variance so the material never reads as a grid.
    out[o + 6] = 0.55 + 0.45 * rand();
    n++;
  }
  return out.subarray(0, n * 7);
}

/** A glyph atlas: sharp cells on the left half, a defocused copy on the right. */
function buildAtlas(): { canvas: HTMLCanvasElement; cols: number } {
  const cell = 32;
  const cols = Math.ceil(Math.sqrt(GLYPHS.length));
  const size = cell * cols;
  const canvas = document.createElement("canvas");
  canvas.width = size * 2;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `500 22px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
  const taps: Array<[number, number, number]> = [[0, 0, 0.16]];
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * Math.PI * 2;
    taps.push([Math.cos(t) * 1.4, Math.sin(t) * 1.4, 0.11]);
    taps.push([Math.cos(t + 0.4) * 2.8, Math.sin(t + 0.4) * 2.8, 0.06]);
  }
  for (let i = 0; i < GLYPHS.length; i++) {
    const cx = (i % cols) * cell + cell / 2;
    const cy = Math.floor(i / cols) * cell + cell / 2;
    const ch = GLYPHS[i]!;
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#fff";
    ctx.fillText(ch, cx, cy + 1);
    for (const [dx, dy, a] of taps) {
      ctx.globalAlpha = a;
      ctx.fillText(ch, size + cx + dx, cy + 1 + dy);
    }
  }
  return { canvas, cols };
}

type Phase = "spread" | "collapse" | "hold" | "release";

export function initHeroF(canvas: HTMLCanvasElement, host: HTMLElement): () => void {
  const gl = (canvas.getContext("webgl", {
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
    powerPreference: "low-power",
  }) || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
  // No context means the card keeps its CSS gradient.
  if (!gl) return () => {};

  let volProg: WebGLProgram | null = null;
  let compProg: WebGLProgram | null = null;
  let glyphProg: WebGLProgram | null = null;
  let quad: WebGLBuffer | null = null;
  let glyphBuf: WebGLBuffer | null = null;
  let volTex: WebGLTexture | null = null;
  let atlasTex: WebGLTexture | null = null;
  let fbo: WebGLFramebuffer | null = null;

  function releaseGL(): void {
    if (!gl) return;
    for (const p of [volProg, compProg, glyphProg]) if (p) gl.deleteProgram(p);
    for (const b of [quad, glyphBuf]) if (b) gl.deleteBuffer(b);
    for (const t of [volTex, atlasTex]) if (t) gl.deleteTexture(t);
    if (fbo) gl.deleteFramebuffer(fbo);
    volProg = compProg = glyphProg = null;
    quad = glyphBuf = null;
    volTex = atlasTex = null;
    fbo = null;
  }

  try {
    volProg = link(gl, FULLSCREEN_VS, VOLUME_FS);
    compProg = link(gl, FULLSCREEN_VS, COMPOSITE_FS);
    glyphProg = link(gl, GLYPH_VS, GLYPH_FS);
  } catch (error) {
    console.warn(error);
    releaseGL();
    return () => {};
  }

  quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  volTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, volTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, volTex, 0);
  const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (!complete) {
    releaseGL();
    return () => {};
  }

  const atlas = buildAtlas();
  atlasTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, atlasTex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const locs = (program: WebGLProgram, names: string[]) =>
    Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(program, n)])) as Record<
      string,
      WebGLUniformLocation | null
    >;
  const uv = locs(volProg, ["uRes", "uCenter", "uPx", "uRot", "uAB", "uBeat", "uGain"]);
  const PALETTE = ["uTeal", "uMint", "uLime", "uWhite", "uPass"];
  const uc = locs(compProg, [
    "uRes",
    "uCenter",
    "uScale",
    "uVol",
    "uStop0",
    "uStop1",
    "uStop2",
    "uCollapse",
    "uIntro",
    "uAxis",
    "uRing",
    "uAvoid",
    "uFeather",
    ...PALETTE,
  ]);
  const ug = locs(glyphProg, [
    "uRes",
    "uCenter",
    "uPx",
    "uRot",
    "uAB",
    "uBeat",
    "uSize",
    "uAlpha",
    "uCollapse",
    "uIntro",
    "uAtlas",
    "uCols",
    "uAvoid",
    "uFeather",
    ...PALETTE,
  ]);

  const palette: Record<string, [number, number, number]> = {
    uTeal: readColor(host, "--hf-teal", "#38ccdb"),
    uMint: readColor(host, "--hf-mint", "#42e08a"),
    uLime: readColor(host, "--hf-lime", "#ccf575"),
    uWhite: readColor(host, "--hf-white", "#edfff5"),
    uPass: readColor(host, "--hf-pass", "#3ddc84"),
  };

  gl.useProgram(compProg);
  gl.uniform3fv(uc.uStop0!, readColor(host, "--hf-stop-0", "#0d4f2e"));
  gl.uniform3fv(uc.uStop1!, readColor(host, "--hf-stop-1", "#06301c"));
  gl.uniform3fv(uc.uStop2!, readColor(host, "--hf-stop-2", "#03160d"));
  gl.uniform1i(uc.uVol!, 0);
  for (const name of PALETTE) gl.uniform3fv(uc[name]!, palette[name]!);
  gl.useProgram(glyphProg);
  gl.uniform1i(ug.uAtlas!, 1);
  gl.uniform1f(ug.uCols!, atlas.cols);
  for (const name of PALETTE) gl.uniform3fv(ug[name]!, palette[name]!);

  const aQuadVol = gl.getAttribLocation(volProg, "aPos");
  const aQuadComp = gl.getAttribLocation(compProg, "aPos");
  const aPos = gl.getAttribLocation(glyphProg, "aPos");
  const aAmp = gl.getAttribLocation(glyphProg, "aAmp");
  const aGlyph = gl.getAttribLocation(glyphProg, "aGlyph");

  const headline = host.querySelector<HTMLElement>("[data-hero-headline]");
  const line = host.querySelector<HTMLElement>("[data-hf-line]");
  const mark = host.querySelector<HTMLElement>("[data-hf-mark]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Lab only: `?hf=0.6&beat=1.2` pins the collapse and the slosh for screenshots.
  const params = new URLSearchParams(location.search);
  const pinRaw = Number.parseFloat(params.get("hf") ?? "");
  const pin = Number.isFinite(pinRaw) ? clamp(pinRaw, 0, 1) : null;
  const beatRaw = Number.parseFloat(params.get("beat") ?? "");
  const pinBeat = Number.isFinite(beatRaw) ? beatRaw : null;

  // Geometry, all in device pixels.
  let W = 1;
  let H = 1;
  let VW = 1;
  let VH = 1;
  let scale = 1;
  let cx = 0;
  let cy = 0;
  let px = 1;
  let radiusCss = 1;
  const avoid = new Float32Array(32);
  let glyphCount = 0;

  const glyphData = sampleGlyphs(GLYPH_MAX);
  const glyphTotal = glyphData.length / 7;
  glyphBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, glyphBuf);
  gl.bufferData(gl.ARRAY_BUFFER, glyphData, gl.STATIC_DRAW);

  // Clock and per-frame state.
  let t = reducedMotion.matches ? 0 : Math.random() * 60;
  let beat = pinBeat ?? (reducedMotion.matches ? 1.1 : Math.random() * Math.PI * 2);
  let phase: Phase = "spread";
  let phaseT = 0;
  let spreadFor = SPREAD_FIRST;
  let autoC = 0;
  let ringAge = 99;
  let slow = 0;

  const startedAt = performance.now();
  let lastFrame = startedAt;
  let rafId = 0;
  let running = false;
  let visible = true;

  function introProgress(): number {
    if (reducedMotion.matches || pin !== null) return 1;
    const raw = (performance.now() - startedAt - INTRO_DELAY_MS) / INTRO_DURATION_MS;
    const x = clamp(raw, 0, 1);
    return 1 - Math.pow(1 - x, 3);
  }

  function collapse(): number {
    if (pin !== null) return pin;
    if (reducedMotion.matches) return 1;
    return autoC;
  }

  function rotation(): number[] {
    const precess = NOD * Math.sin(t * NOD_RATE);
    const spin = t * SPIN;
    return mul(rotX(PITCH), mul(rotY(precess), mul(rotZ(-LEAN), mul(UPRIGHT, rotZ(spin)))));
  }

  function measureLayout(): void {
    const rect = host.getBoundingClientRect();
    const cssW = rect.width;
    const cssH = rect.height;
    const fx = readNumber(host, "--hf-cx", 0.735);
    const fy = readNumber(host, "--hf-cy", 0.54);
    const fr = readNumber(host, "--hf-r", 0.6);
    radiusCss = cssW < 640 ? fr * Math.max(cssW, 1) * 1.6 : fr * cssH;
    cx = fx * cssW * scale;
    cy = fy * cssH * scale;
    px = (radiusCss * scale) / 40;

    // The headline's own line boxes, merged per line, so the light stays off
    // the words but is free to bloom past the end of a short line.
    avoid.fill(0);
    if (headline) {
      const range = document.createRange();
      range.selectNodeContents(headline);
      const lines: DOMRect[] = [];
      for (const r of Array.from(range.getClientRects())) {
        if (r.width < 1 || r.height < 1) continue;
        const hit = lines.find((l) => Math.abs(l.top + l.height / 2 - (r.top + r.height / 2)) < 12);
        if (hit) {
          const left = Math.min(hit.left, r.left);
          const right = Math.max(hit.right, r.right);
          const top = Math.min(hit.top, r.top);
          const bottom = Math.max(hit.bottom, r.bottom);
          hit.x = left;
          hit.y = top;
          hit.width = right - left;
          hit.height = bottom - top;
        } else {
          lines.push(new DOMRect(r.left, r.top, r.width, r.height));
        }
      }
      lines.slice(0, 7).forEach((l, i) => {
        avoid[i * 4] = (l.left - rect.left) * scale;
        avoid[i * 4 + 1] = (l.top - rect.top + l.height * 0.12) * scale;
        avoid[i * 4 + 2] = (l.right - rect.left) * scale;
        avoid[i * 4 + 3] = (l.bottom - rect.top - l.height * 0.1) * scale;
      });
    }
    // The wordmark in the corner gets the last slot.
    if (mark) {
      const m = mark.getBoundingClientRect();
      avoid[28] = (m.left - rect.left) * scale;
      avoid[29] = (m.top - rect.top) * scale;
      avoid[30] = (m.right - rect.left) * scale;
      avoid[31] = (m.bottom - rect.top) * scale;
    }

    // The sample is drawn once; a smaller card simply draws fewer of it.
    const target = Math.round(cssW * cssH * GLYPH_DENSITY);
    glyphCount = clamp(target, GLYPH_MIN, glyphTotal);
  }

  function draw(): void {
    const c = collapse();
    const ce = easeInOut(clamp(c, 0, 1));
    const theta = THETA * (1 - ce);
    const A = Math.cos(theta);
    const B = Math.sin(theta);
    const rot = rotation();
    const intro = introProgress();
    const feather = 46 * scale;

    // The volume, at reduced resolution.
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo);
    gl!.viewport(0, 0, VW, VH);
    gl!.disable(gl!.BLEND);
    gl!.useProgram(volProg);
    gl!.bindBuffer(gl!.ARRAY_BUFFER, quad);
    gl!.enableVertexAttribArray(aQuadVol);
    gl!.vertexAttribPointer(aQuadVol, 2, gl!.FLOAT, false, 0, 0);
    const vs = VW / W;
    gl!.uniform2f(uv.uRes!, VW, VH);
    gl!.uniform2f(uv.uCenter!, cx * vs, cy * vs);
    gl!.uniform1f(uv.uPx!, px * vs);
    gl!.uniformMatrix3fv(uv.uRot!, false, rot);
    gl!.uniform2f(uv.uAB!, A, B);
    gl!.uniform1f(uv.uBeat!, beat);
    gl!.uniform1f(uv.uGain!, 0.45 * (1 + 0.15 * ce));
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);

    // The field, the light and the photon.
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    gl!.viewport(0, 0, W, H);
    gl!.useProgram(compProg);
    gl!.vertexAttribPointer(aQuadComp, 2, gl!.FLOAT, false, 0, 0);
    gl!.enableVertexAttribArray(aQuadComp);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, volTex);
    gl!.uniform2f(uc.uRes!, W, H);
    gl!.uniform2f(uc.uCenter!, cx, cy);
    gl!.uniform1f(uc.uScale!, scale);
    gl!.uniform1f(uc.uCollapse!, ce);
    gl!.uniform1f(uc.uIntro!, intro);
    // The orbital axis on screen is the third column of the rotation.
    const ax = rot[6]!;
    const ay = -rot[7]!;
    const al = Math.hypot(ax, ay) || 1;
    gl!.uniform2f(uc.uAxis!, ax / al, ay / al);
    const ringR = ringAge * 260 * scale;
    const ringA = ringAge < 4 ? 0.2 * Math.exp(-ringAge / 1.1) * clamp(ringAge * 5, 0, 1) : 0;
    gl!.uniform3f(uc.uRing!, ringR, ringA, 0);
    gl!.uniform4fv(uc.uAvoid!, avoid);
    gl!.uniform1f(uc.uFeather!, feather);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    gl!.disableVertexAttribArray(aQuadComp);

    // The glyphs, as faint material inside the light.
    if (glyphBuf && glyphCount > 0) {
      gl!.useProgram(glyphProg);
      gl!.enable(gl!.BLEND);
      gl!.blendFunc(gl!.ONE, gl!.ONE_MINUS_SRC_ALPHA);
      gl!.activeTexture(gl!.TEXTURE1);
      gl!.bindTexture(gl!.TEXTURE_2D, atlasTex);
      gl!.bindBuffer(gl!.ARRAY_BUFFER, glyphBuf);
      const stride = 7 * 4;
      gl!.enableVertexAttribArray(aPos);
      gl!.vertexAttribPointer(aPos, 3, gl!.FLOAT, false, stride, 0);
      gl!.enableVertexAttribArray(aAmp);
      gl!.vertexAttribPointer(aAmp, 2, gl!.FLOAT, false, stride, 12);
      gl!.enableVertexAttribArray(aGlyph);
      gl!.vertexAttribPointer(aGlyph, 2, gl!.FLOAT, false, stride, 20);
      gl!.uniform2f(ug.uRes!, W, H);
      gl!.uniform2f(ug.uCenter!, cx, cy);
      gl!.uniform1f(ug.uPx!, px);
      gl!.uniformMatrix3fv(ug.uRot!, false, rot);
      gl!.uniform2f(ug.uAB!, A, B);
      gl!.uniform1f(ug.uBeat!, beat);
      gl!.uniform1f(ug.uSize!, 15 * scale);
      gl!.uniform1f(ug.uAlpha!, 0.24);
      gl!.uniform1f(ug.uCollapse!, ce);
      gl!.uniform1f(ug.uIntro!, intro);
      gl!.uniform4fv(ug.uAvoid!, avoid);
      gl!.uniform1f(ug.uFeather!, feather);
      gl!.drawArrays(gl!.POINTS, 0, glyphCount);
      gl!.disableVertexAttribArray(aPos);
      gl!.disableVertexAttribArray(aAmp);
      gl!.disableVertexAttribArray(aGlyph);
      gl!.disable(gl!.BLEND);
    }

    // The measured state resolves at the nucleus, focus and opacity only.
    if (line) {
      const focus = clamp((c - 0.82) / 0.18, 0, 1);
      line.style.setProperty("--hf-focus", (focus * intro).toFixed(3));
    }
  }

  function resize(): void {
    const rect = host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const nextW = Math.max(1, Math.round(rect.width * dpr));
    const nextH = Math.max(1, Math.round(rect.height * dpr));
    scale = dpr;
    if (nextW !== W || nextH !== H) {
      W = nextW;
      H = nextH;
      canvas.width = nextW;
      canvas.height = nextH;
      VW = Math.max(1, Math.round(rect.width * VOLUME_SCALE));
      VH = Math.max(1, Math.round(rect.height * VOLUME_SCALE));
      gl!.bindTexture(gl!.TEXTURE_2D, volTex);
      gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, VW, VH, 0, gl!.RGBA, gl!.UNSIGNED_BYTE, null);
    }
    measureLayout();
    if (!running) draw();
  }

  function stepAuto(dt: number): void {
    phaseT += dt;
    ringAge += dt;
    switch (phase) {
      case "spread":
        autoC = 0;
        if (phaseT >= spreadFor) {
          phase = "collapse";
          phaseT = 0;
          spreadFor = SPREAD;
          ringAge = 0;
        }
        break;
      case "collapse":
        autoC = easeInOut(clamp(phaseT / COLLAPSE, 0, 1));
        if (phaseT >= COLLAPSE) {
          phase = "hold";
          phaseT = 0;
        }
        break;
      case "hold":
        autoC = 1;
        if (phaseT >= HOLD) {
          phase = "release";
          phaseT = 0;
        }
        break;
      case "release":
        autoC = 1 - easeInOut(clamp(phaseT / RELEASE, 0, 1));
        if (phaseT >= RELEASE) {
          phase = "spread";
          phaseT = 0;
        }
        break;
    }
  }

  function frame(now: number): void {
    const dt = clamp((now - lastFrame) / 1000, 0, 0.1);
    lastFrame = now;

    stepAuto(dt);
    host.dataset.hfPhase = phase;

    // A measured orbital is still: the turning slows while it is held.
    const c = collapse();
    slow += (c - slow) * (1 - Math.exp(-dt / 0.8));
    t += dt * (1 - 0.75 * slow);
    if (pinBeat === null) beat = (beat + (dt * Math.PI * 2) / BEAT_PERIOD) % (Math.PI * 2);

    draw();
    rafId = requestAnimationFrame(frame);
  }

  function start(): void {
    if (running || !visible || document.hidden || reducedMotion.matches || pin !== null) return;
    running = true;
    lastFrame = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function stop(): void {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(host);
  if (headline) resizeObserver.observe(headline);

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
      draw();
    } else {
      start();
    }
  };
  reducedMotion.addEventListener?.("change", onReducedMotionChange);

  // The headline is split into spans after load, which can move its lines.
  const onLoad = () => resize();
  window.addEventListener("load", onLoad);
  document.fonts?.ready.then(() => resize()).catch(() => {});

  resize();
  draw();
  start();

  return function destroy(): void {
    stop();
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("load", onLoad);
    reducedMotion.removeEventListener?.("change", onReducedMotionChange);
    releaseGL();
  };
}
