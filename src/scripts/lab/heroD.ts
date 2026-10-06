/**
 * Option D: the path integral.
 *
 * A change leaves a source on the left and arrives at a detector on the right
 * by every route at once. Each route is a real sample of a Feynman path
 * integral: the classical parabola plus a Fourier sum of sine modes that pin
 * both ends (a Brownian bridge), so the bundle is the actual space of
 * histories rather than decoration.
 *
 * Every history carries a phase, its action over hbar, drawn as a slow carrier
 * of light along it. The bundle is accumulated additively in a float buffer and
 * tone mapped, so it reads as one quiet luminous texture low across the card.
 * The weight a history keeps is set by how far its action strays from the
 * classical one, measured in units of hbar.
 *
 * The field breathes, slowly, by turning hbar. Large, and every history is in
 * phase: a wide, faint bundle of all of them. Small, and the outlying histories
 * cancel while those near the stationary path reinforce into one calm green
 * line: the classical path, the state that passed. It runs on its own.
 */

const MAX_DPR = 2;

/** Fourier modes per history. The shader unrolls over two vec4s. */
const MODES = 8;

/** Segments per drawn history. */
const SEGMENTS = 96;

/** Largest per-mode deviation, as a fraction of the source to detector span. */
const SIGMA = 0.34;

/** hbar at the two ends of the breath, in units of the span's action scale. */
const HBAR_WIDE = 0.55;
const HBAR_SHARP = 0.0022;

/** Seconds per phase of the breath. */
const OPEN_FIRST = 4.5;
const OPEN = 8;
const RESOLVE = 6;
const HOLD = 7;
const RELEASE = 6;

const INTRO_DELAY_MS = 120;
const INTRO_DURATION_MS = 1800;

interface Layout {
  /** Source and detector, as fractions of the card. */
  a: [number, number];
  b: [number, number];
  /** Sag of the classical parabola at its midpoint, as a fraction of the span. */
  bulge: number;
}

// Low on the card and nearly level, so the bundle lies under the headline as a
// texture rather than crossing it.
const WIDE: Layout = { a: [0.05, 0.665], b: [0.95, 0.57], bulge: 0.05 };
const TALL: Layout = { a: [0.06, 0.6], b: [0.94, 0.52], bulge: 0.06 };

/* ------------------------------------------------------------------ shaders */

/**
 * One history at parameter s in [0, 1]. The coefficients are the live mode
 * amplitudes, already rotated for this frame; mode k has amplitude c[k] / k in
 * position, so the bundle is smooth with fine detail riding on it.
 */
const PATH_GLSL = `
uniform vec2  uA;
uniform vec2  uB;
uniform float uBulge;
uniform float uTime;
uniform float uHbar;
uniform vec2  uRes;
uniform float uScale;

const float PI = 3.14159265;

void modes(vec4 u0, vec4 u1, vec4 v0, vec4 v1, vec4 p, out vec4 c0, out vec4 c1) {
  float ang = p.y + p.x * uTime;
  float ca = cos(ang);
  float sa = sin(ang);
  c0 = u0 * ca + v0 * sa;
  c1 = u1 * ca + v1 * sa;
}

/** Position, unit tangent, and d(deviation)/ds over the span, at s. */
void pathAt(float s, vec4 c0, vec4 c1, out vec2 P, out vec2 T, out float dev1) {
  vec2 ab = uB - uA;
  float L = length(ab);
  vec2 dir = ab / L;
  vec2 N = vec2(-dir.y, dir.x);
  float d = 0.0;
  float d1 = 0.0;
  for (int k = 0; k < 8; k++) {
    float c = k < 4 ? c0[k] : c1[k - 4];
    float kk = float(k + 1);
    float w = kk * PI * s;
    d += c / kk * sin(w);
    d1 += c * PI * cos(w);
  }
  float cl = uBulge * 4.0 * s * (1.0 - s);
  float cl1 = uBulge * 4.0 * (1.0 - 2.0 * s);
  P = uA + ab * s + N * (cl + d) * L;
  vec2 dP = ab + N * (cl1 + d1) * L;
  T = normalize(dP);
  dev1 = d1;
}

/**
 * Excess action accumulated up to s, against the classical path. Only the
 * diagonal terms are kept; the cross terms between modes integrate to zero
 * over the whole route and only ripple along it.
 */
float actionTo(float s, vec4 c0, vec4 c1) {
  float acc = 0.0;
  for (int k = 0; k < 8; k++) {
    float c = k < 4 ? c0[k] : c1[k - 4];
    float kk = float(k + 1);
    float b = c * PI;
    acc += b * b * (0.5 * s + sin(2.0 * kk * PI * s) / (4.0 * kk * PI));
  }
  return 0.5 * acc;
}

float actionTotal(vec4 c0, vec4 c1) {
  return 0.25 * PI * PI * (dot(c0, c0) + dot(c1, c1));
}

vec4 toClip(vec2 css) {
  vec2 px = css * uScale;
  return vec4(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0, 0.0, 1.0);
}
`;

const PATH_VS = `#version 300 es
precision highp float;
${PATH_GLSL}
uniform float uMode;
uniform float uQ;
uniform float uStripes;

layout(location = 0) in vec2 aT;
layout(location = 1) in vec4 iU0;
layout(location = 2) in vec4 iU1;
layout(location = 3) in vec4 iV0;
layout(location = 4) in vec4 iV1;
layout(location = 5) in vec4 iP;

out float vSide;
out float vS;
out float vPhase;
out float vContrast;
out float vWeight;
out float vCore;

void main() {
  float s = aT.x;
  vec4 c0;
  vec4 c1;
  modes(iU0, iU1, iV0, iV1, iP, c0, c1);
  vec2 P;
  vec2 T;
  float d1;
  pathAt(s, c0, c1, P, T, d1);
  vec2 n = vec2(-T.y, T.x);

  float glow = step(0.5, uMode);
  float halfW = mix(0.5 + 0.5 / uScale, 20.0, glow);
  gl_Position = toClip(P + n * aT.y * halfW);

  float L = length(uB - uA);
  float theta = actionTotal(c0, c1) / uHbar;
  // How much of its weight a history keeps once its phase has wound away from
  // the stationary one. Past a couple of radians it is cancelled by its
  // neighbours, so it fades.
  vWeight = exp(-theta / 1.6);
  // The classical history is one sample among many until hbar shrinks, so it
  // does not stand out while every history is still in phase.
  vWeight *= iP.z < 1e-4 ? mix(0.25, 1.0, uQ) : 1.0;
  vCore = exp(-theta / 0.6);

  // The phase along the route: a carrier that travels from source to detector,
  // plus the excess action this history has picked up so far.
  float extra = actionTo(s, c0, c1) / uHbar;
  vPhase = 6.2831853 * uStripes * s + extra - uTime * 1.5;
  // Local wavenumber in radians per CSS pixel. Past the point the stripes
  // could be resolved they are held flat rather than allowed to alias.
  float k = (6.2831853 * uStripes + 0.5 * d1 * d1 / uHbar) / L;
  vContrast = 1.0 - smoothstep(0.12, 0.32, k);

  vSide = aT.y;
  vS = s;
}
`;

const PATH_FS = `#version 300 es
precision highp float;
uniform float uMode;
uniform float uQ;
uniform float uGain;
uniform vec3  uTeal;
uniform vec3  uMint;
uniform vec3  uLime;
uniform vec3  uPass;

in float vSide;
in float vS;
in float vPhase;
in float vContrast;
in float vWeight;
in float vCore;

out vec4 outColor;

void main() {
  // Every history converges on the two endpoints, so they are tapered there
  // and the endpoint glows carry the convergence instead.
  float taper = smoothstep(0.0, 0.16, vS) * smoothstep(1.0, 0.86, vS);

  if (uMode > 0.5) {
    // The classical beam's bloom.
    float g = exp(-3.2 * vSide * vSide);
    float ends = smoothstep(0.0, 0.08, vS) * smoothstep(1.0, 0.94, vS);
    float pulse = 0.82 + 0.18 * cos(vPhase);
    outColor = vec4(uPass * g * ends * pulse * uQ * 0.035, 1.0);
    return;
  }

  float cov = 1.0 - vSide * vSide;
  float c = cos(vPhase);
  float stripe = 1.0 + (0.3 + 0.2 * uQ) * vContrast * c;
  vec3 hue = mix(uTeal, uMint, 0.5 + 0.5 * c * vContrast);
  hue = mix(hue, uLime, 0.25 * smoothstep(0.3, 1.0, sin(vPhase)) * vContrast);
  // Near the stationary path, as hbar shrinks, the light turns the green of a
  // passing state.
  hue = mix(hue, uPass, clamp(vCore * uQ * 1.1, 0.0, 0.85));
  float taperCore = mix(taper, 1.0, vCore * uQ * 0.7);
  float I = uGain * vWeight * stripe * cov * mix(taper, taperCore, vCore);
  outColor = vec4(hue * I, 1.0);
}
`;

const COMPOSITE_VS = `#version 300 es
layout(location = 0) in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const COMPOSITE_FS = `#version 300 es
precision highp float;
uniform sampler2D uLight;
uniform vec2  uRes;
uniform float uScale;
uniform vec3  uStop0;
uniform vec3  uStop1;
uniform vec3  uStop2;
uniform vec4  uRects[3];
uniform vec3  uRectDim;
uniform vec2  uA;
uniform vec2  uB;
uniform float uQ;
uniform float uIntro;
uniform vec3  uPass;
uniform vec3  uWhite;

out vec4 outColor;

const vec2  ORIGIN = vec2(0.62, 0.72);
const vec2  SPAN = vec2(1.25, 1.5);
const float MID_STOP = 0.44;
const float GRAIN = 0.012;

float hash21(vec2 p_) {
  p_ = fract(p_ * vec2(127.1, 311.7));
  p_ += dot(p_, p_ + 34.56);
  return fract(p_.x * p_.y);
}

float rectMask(vec2 p, vec4 r, float feather) {
  vec2 lo = smoothstep(r.xy - feather, r.xy + feather * 0.5, p);
  vec2 hi = 1.0 - smoothstep(r.zw - feather * 0.5, r.zw + feather, p);
  return lo.x * lo.y * hi.x * hi.y;
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 p = frag / uRes;
  vec2 css = frag / uScale;

  float g = length((p - ORIGIN) / SPAN);
  vec3 base = mix(uStop0, uStop1, clamp(g / MID_STOP, 0.0, 1.0));
  base = mix(base, uStop2, clamp((g - MID_STOP) / (1.0 - MID_STOP), 0.0, 1.0));

  vec3 light = texture(uLight, vec2(gl_FragCoord.x / uRes.x, gl_FragCoord.y / uRes.y)).rgb;

  // The endpoints: a soft source, and a detector that brightens to green as
  // the classical history arrives.
  vec2 da = css - uA;
  vec2 db = css - uB;
  light += uWhite * 0.06 * exp(-dot(da, da) / (2.0 * 14.0 * 14.0));
  light += uWhite * 0.14 * exp(-dot(da, da) / (2.0 * 2.2 * 2.2));
  light += mix(uWhite * 0.04, uPass * 0.12, uQ) * exp(-dot(db, db) / (2.0 * 18.0 * 18.0));
  light += uWhite * mix(0.1, 0.24, uQ) * exp(-dot(db, db) / (2.0 * 2.4 * 2.4));

  // Clear of the type: dimmed under the headline and the foot.
  float m = 1.0;
  for (int i = 0; i < 3; i++) {
    m *= 1.0 - uRectDim[i] * rectMask(css, uRects[i], 36.0);
  }

  vec3 tone = vec3(1.0) - exp(-light * 1.6);
  float a = uIntro * m;
  // Screen blend, so the light lifts the field without flattening it.
  vec3 col = 1.0 - (1.0 - base) * (1.0 - tone * a);
  col += (hash21(frag) - 0.5) * GRAIN;
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

/* ------------------------------------------------------------------ helpers */

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error("Path integral shader compile error: " + log);
  }
  return shader;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  const program = gl.createProgram()!;
  gl.attachShader(program, v);
  gl.attachShader(program, f);
  gl.linkProgram(program);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error("Path integral program link error: " + log);
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

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/**
 * The histories. Each is a point on a sphere in mode space at radius rho,
 * turning slowly along a great circle, so its shape wanders while its excess
 * action, and therefore its weight, holds still. Most are drawn close to the
 * classical path so the resolved beam has body.
 */
function buildHistories(count: number, random: () => number): Float32Array {
  const stride = 20;
  const data = new Float32Array(count * stride);
  const gauss = () => {
    const u = Math.max(random(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
  };
  for (let i = 0; i < count; i++) {
    const u = Array.from({ length: MODES }, gauss);
    const v = Array.from({ length: MODES }, gauss);
    const nu = Math.hypot(...u);
    for (let k = 0; k < MODES; k++) u[k]! /= nu;
    let dot = 0;
    for (let k = 0; k < MODES; k++) dot += u[k]! * v[k]!;
    for (let k = 0; k < MODES; k++) v[k]! -= dot * u[k]!;
    const nv = Math.hypot(...v);
    for (let k = 0; k < MODES; k++) v[k]! /= nv;

    // History 0 is the classical one.
    const rho = i === 0 ? 0 : Math.pow(random(), 1.05);
    const o = i * stride;
    for (let k = 0; k < MODES; k++) {
      data[o + k] = u[k]! * rho * SIGMA;
      data[o + 8 + k] = v[k]! * rho * SIGMA;
    }
    const sign = random() < 0.5 ? -1 : 1;
    data[o + 16] = sign * (0.035 + 0.09 * random());
    data[o + 17] = random() * Math.PI * 2;
    data[o + 18] = rho;
    data[o + 19] = random();
  }
  return data;
}

/* --------------------------------------------------------------------- init */

export function initHeroD(canvas: HTMLCanvasElement, host: HTMLElement): () => void {
  const gl = canvas.getContext("webgl2", {
    antialias: true,
    alpha: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    // The reduced-motion path paints one frame and stops, so the drawing
    // buffer has to survive compositing rather than being cleared behind it.
    preserveDrawingBuffer: true,
    powerPreference: "high-performance",
  });
  // No WebGL2 means the card keeps its CSS gradient.
  if (!gl) return () => {};

  const programs: WebGLProgram[] = [];
  const buffers: WebGLBuffer[] = [];
  const vaos: WebGLVertexArrayObject[] = [];
  let lightTex: WebGLTexture | null = null;
  let fbo: WebGLFramebuffer | null = null;

  function releaseGL(): void {
    if (!gl) return;
    for (const p of programs) gl.deleteProgram(p);
    for (const b of buffers) gl.deleteBuffer(b);
    for (const v of vaos) gl.deleteVertexArray(v);
    if (lightTex) gl.deleteTexture(lightTex);
    if (fbo) gl.deleteFramebuffer(fbo);
    programs.length = buffers.length = vaos.length = 0;
    lightTex = null;
    fbo = null;
  }

  let pathProg: WebGLProgram;
  let compProg: WebGLProgram;
  try {
    pathProg = link(gl, PATH_VS, PATH_FS);
    compProg = link(gl, COMPOSITE_VS, COMPOSITE_FS);
    programs.push(pathProg, compProg);
  } catch (error) {
    console.warn(error);
    releaseGL();
    return () => {};
  }

  // A float light buffer keeps thousands of faint strokes from banding. Fall
  // back to bytes where float targets are not renderable.
  const floatOk = !!gl.getExtension("EXT_color_buffer_float");

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const headline = host.querySelector<HTMLElement>("[data-hero-headline]");
  const avoid = [...host.querySelectorAll<HTMLElement>("[data-hero-d-avoid]")];

  // Lab only: `?q=0.9` pins the breath at that value for screenshots.
  const pinRaw = Number.parseFloat(new URLSearchParams(location.search).get("q") ?? "");
  const pin = Number.isFinite(pinRaw) ? clamp(pinRaw, 0, 1) : null;

  const seed = (Math.random() * 2 ** 31) | 0;
  const random = mulberry32(pin !== null ? 7 : seed);

  const hostWidth = host.getBoundingClientRect().width || 1200;
  const count = hostWidth < 640 ? 170 : 320;
  const histories = buildHistories(count, random);

  /* ---- the strip every history and the bloom are drawn on */
  const strip = new Float32Array((SEGMENTS + 1) * 4);
  for (let i = 0; i <= SEGMENTS; i++) {
    const s = i / SEGMENTS;
    strip.set([s, -1, s, 1], i * 4);
  }

  function makeBuffer(data: Float32Array): WebGLBuffer {
    const b = gl!.createBuffer()!;
    gl!.bindBuffer(gl!.ARRAY_BUFFER, b);
    gl!.bufferData(gl!.ARRAY_BUFFER, data, gl!.STATIC_DRAW);
    buffers.push(b);
    return b;
  }

  function bindHistories(buffer: WebGLBuffer, stride: number): void {
    gl!.bindBuffer(gl!.ARRAY_BUFFER, buffer);
    for (let i = 0; i < 5; i++) {
      gl!.enableVertexAttribArray(1 + i);
      gl!.vertexAttribPointer(1 + i, 4, gl!.FLOAT, false, stride * 4, i * 16);
      gl!.vertexAttribDivisor(1 + i, 1);
    }
  }

  const stripBuf = makeBuffer(strip);
  const histBuf = makeBuffer(histories);

  const pathVao = gl.createVertexArray()!;
  vaos.push(pathVao);
  gl.bindVertexArray(pathVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, stripBuf);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  bindHistories(histBuf, 20);

  /* ---- full screen triangle for the composite */
  const triBuf = makeBuffer(new Float32Array([-1, -1, 3, -1, -1, 3]));
  const triVao = gl.createVertexArray()!;
  vaos.push(triVao);
  gl.bindVertexArray(triVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, triBuf);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  /* ---- uniforms */
  const uniforms = (program: WebGLProgram, names: string[]) => {
    const out: Record<string, WebGLUniformLocation | null> = {};
    for (const n of names) out[n] = gl.getUniformLocation(program, n);
    return out;
  };
  const shared = ["uA", "uB", "uBulge", "uTime", "uHbar", "uRes", "uScale", "uQ"];
  const pu = uniforms(pathProg, [
    ...shared,
    "uMode",
    "uStripes",
    "uGain",
    "uTeal",
    "uMint",
    "uLime",
    "uPass",
  ]);
  const cu = uniforms(compProg, [
    "uLight",
    "uRes",
    "uScale",
    "uStop0",
    "uStop1",
    "uStop2",
    "uRects",
    "uRectDim",
    "uA",
    "uB",
    "uQ",
    "uIntro",
    "uPass",
    "uWhite",
  ]);

  const teal = readColor(host, "--hd-teal", "#38c9d6");
  const mint = readColor(host, "--hd-mint", "#5ee6a0");
  const lime = readColor(host, "--hd-lime", "#ccf575");
  const pass = readColor(host, "--hd-pass", "#3ddc84");
  const white = readColor(host, "--hd-white", "#eefff5");

  gl.useProgram(pathProg);
  gl.uniform3fv(pu.uTeal!, teal);
  gl.uniform3fv(pu.uMint!, mint);
  gl.uniform3fv(pu.uLime!, lime);
  gl.uniform3fv(pu.uPass!, pass);

  gl.useProgram(compProg);
  gl.uniform3fv(cu.uStop0!, readColor(host, "--hd-stop-0", "#0e5132"));
  gl.uniform3fv(cu.uStop1!, readColor(host, "--hd-stop-1", "#06301c"));
  gl.uniform3fv(cu.uStop2!, readColor(host, "--hd-stop-2", "#03150c"));
  gl.uniform3fv(cu.uPass!, pass);
  gl.uniform3fv(cu.uWhite!, white);
  gl.uniform1i(cu.uLight!, 0);

  /* ---- geometry */
  let W = 1;
  let H = 1;
  let cssW = 1;
  let cssH = 1;
  let scale = 1;
  let layout = WIDE;
  const home = { x: 0, y: 0 };
  const src = { x: 0, y: 0 };
  const det = { x: 0, y: 0 };
  const rects = new Float32Array(12);
  const rectDim = new Float32Array(3);

  function measureRects(): void {
    const box = host.getBoundingClientRect();
    const els: Array<[HTMLElement | null, number]> = [
      [headline, 0.85],
      [avoid[0] ?? null, 0.6],
      [avoid[1] ?? null, 0.6],
    ];
    els.forEach(([el, dim], i) => {
      if (!el) {
        rectDim[i] = 0;
        return;
      }
      const r = el.getBoundingClientRect();
      rects.set(
        [r.left - box.left, r.top - box.top, r.right - box.left, r.bottom - box.top],
        i * 4,
      );
      rectDim[i] = dim;
    });
  }

  function allocLight(): void {
    if (lightTex) gl!.deleteTexture(lightTex);
    if (fbo) gl!.deleteFramebuffer(fbo);
    lightTex = gl!.createTexture();
    gl!.bindTexture(gl!.TEXTURE_2D, lightTex);
    if (floatOk) {
      gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA16F, W, H, 0, gl!.RGBA, gl!.HALF_FLOAT, null);
    } else {
      gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA8, W, H, 0, gl!.RGBA, gl!.UNSIGNED_BYTE, null);
    }
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.NEAREST);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.NEAREST);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    fbo = gl!.createFramebuffer();
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo);
    gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, lightTex, 0);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
  }

  /* ---- clock */
  let clock = pin !== null ? 40 : reducedMotion.matches ? 40 : 0;
  let cycleT = 0;
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

  /** The breath: 0 is every history at once, 1 is the classical path alone. */
  function cycleQ(): number {
    const period = OPEN + RESOLVE + HOLD + RELEASE;
    let t = cycleT - (OPEN_FIRST - OPEN);
    if (t < 0) return 0;
    t %= period;
    if (t < OPEN) return 0;
    t -= OPEN;
    if (t < RESOLVE) return smoother(t / RESOLVE);
    t -= RESOLVE;
    if (t < HOLD) return 1;
    t -= HOLD;
    return 1 - smoother(t / RELEASE);
  }

  function currentQ(): number {
    if (pin !== null) return pin;
    // Reduced motion shows the finished state: the beam resolved, with the
    // histories it came from still faintly around it.
    if (reducedMotion.matches) return 0.85;
    return cycleQ();
  }

  function draw(): void {
    const q = currentQ();
    // hbar falls geometrically, so the field narrows at an even perceived rate.
    const hbar = Math.exp(Math.log(HBAR_WIDE) + (Math.log(HBAR_SHARP) - Math.log(HBAR_WIDE)) * q);
    const L = Math.hypot(det.x - src.x, det.y - src.y);
    // Fewer histories survive as the line resolves, so each one is lifted to
    // keep the light roughly even across the breath.
    const gain = (0.058 + 0.17 * q * q) * (count > 200 ? 1 : 1.1);
    // The carrier keeps one wavelength in pixels whatever the span, and it
    // shortens as hbar does, as a de Broglie wavelength would.
    const stripes = L / (220 - 60 * q);

    gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo);
    gl!.viewport(0, 0, W, H);
    gl!.clearColor(0, 0, 0, 1);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    gl!.enable(gl!.BLEND);
    gl!.blendFunc(gl!.ONE, gl!.ONE);

    const setShared = (u: Record<string, WebGLUniformLocation | null>) => {
      gl!.uniform2f(u.uA!, src.x, src.y);
      gl!.uniform2f(u.uB!, det.x, det.y);
      gl!.uniform1f(u.uBulge!, layout.bulge);
      gl!.uniform1f(u.uTime!, clock);
      gl!.uniform1f(u.uHbar!, hbar);
      gl!.uniform2f(u.uRes!, W, H);
      gl!.uniform1f(u.uScale!, scale);
      gl!.uniform1f(u.uQ!, q);
    };

    gl!.useProgram(pathProg);
    setShared(pu);
    gl!.uniform1f(pu.uStripes!, stripes);
    gl!.uniform1f(pu.uGain!, gain);
    gl!.bindVertexArray(pathVao);
    gl!.uniform1f(pu.uMode!, 0);
    gl!.drawArraysInstanced(gl!.TRIANGLE_STRIP, 0, (SEGMENTS + 1) * 2, count);
    // The bloom rides history 0, the classical one.
    gl!.uniform1f(pu.uMode!, 1);
    gl!.drawArraysInstanced(gl!.TRIANGLE_STRIP, 0, (SEGMENTS + 1) * 2, 1);

    gl!.disable(gl!.BLEND);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    gl!.viewport(0, 0, W, H);
    gl!.useProgram(compProg);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, lightTex);
    gl!.uniform2f(cu.uRes!, W, H);
    gl!.uniform1f(cu.uScale!, scale);
    gl!.uniform4fv(cu.uRects!, rects);
    gl!.uniform3fv(cu.uRectDim!, rectDim);
    gl!.uniform2f(cu.uA!, src.x, src.y);
    gl!.uniform2f(cu.uB!, det.x, det.y);
    gl!.uniform1f(cu.uQ!, q);
    gl!.uniform1f(cu.uIntro!, introProgress());
    gl!.bindVertexArray(triVao);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    gl!.bindVertexArray(null);
  }

  function resize(): void {
    const rect = host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    cssW = Math.max(1, rect.width);
    cssH = Math.max(1, rect.height);
    const nextW = Math.max(1, Math.round(cssW * dpr));
    const nextH = Math.max(1, Math.round(cssH * dpr));
    layout = cssW / cssH > 1.15 ? WIDE : TALL;
    src.x = layout.a[0] * cssW;
    src.y = layout.a[1] * cssH;
    home.x = layout.b[0] * cssW;
    home.y = layout.b[1] * cssH;
    det.x = home.x;
    det.y = home.y;
    measureRects();
    if (nextW !== W || nextH !== H || dpr !== scale || !lightTex) {
      W = nextW;
      H = nextH;
      scale = dpr;
      canvas.width = W;
      canvas.height = H;
      allocLight();
    }
    if (!running) draw();
  }

  function frame(now: number): void {
    const delta = Math.min(Math.max((now - lastFrame) / 1000, 0), 0.1);
    lastFrame = now;
    clock += delta;
    cycleT += delta;
    // A very slow drift, so the detector is never quite pinned.
    det.x = home.x + Math.sin(clock * 0.07) * 8;
    det.y = home.y + Math.sin(clock * 0.09 + 1.3) * 6;
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

  /* ---- events */
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
      draw();
    } else {
      start();
    }
  };
  reducedMotion.addEventListener?.("change", onReducedMotionChange);

  // The headline settles after its own reveal; measure the type again once it
  // has, and once webfonts land.
  const remeasure = window.setTimeout(() => {
    measureRects();
    if (!running) draw();
  }, 1200);
  document.fonts?.ready.then(() => {
    measureRects();
    if (!running) draw();
  });

  resize();
  draw();
  start();

  return function destroy(): void {
    stop();
    window.clearTimeout(remeasure);
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    document.removeEventListener("visibilitychange", onVisibilityChange);
    reducedMotion.removeEventListener?.("change", onReducedMotionChange);
    releaseGL();
  };
}
