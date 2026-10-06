/**
 * Option G: the code orbital, dithered.
 *
 * The physics is option F's. A hydrogen electron sits in a superposition of
 * two eigenstates, 4d(z^2) and 5f(z^3). The cross term 2AB psi1 psi2 cos(dE t)
 * beats, and because one state is even along the axis and the other odd, the
 * density sloshes from one end of the orbital to the other. On a slow loop the
 * 5f part decays away (an allowed dipole transition, the photon leaving as a
 * ring brightest across the axis), and one still 4d eigenstate is left, in
 * passing green, with `sdt green` resolved at the nucleus.
 *
 * What changes is how it is drawn. Instead of glowing fog, the orbital is a
 * solid isosurface of |psi|, the shape a chemistry textbook draws, so its lobes,
 * rings and nested shells read at a glance, lit from one side so it reads in
 * depth. It is ray marched onto a coarse grid of art pixels (a few CSS pixels
 * each, a whole number of device pixels) and every colour on the card is one
 * of six flat palette entries. Light and shade, the two signs of psi, the fade
 * behind the words and the reveal are all ordered dither, Bayer 8x8, locked to
 * the art grid so the pattern never swims: motion reads as density flowing
 * through a still screen.
 *
 * The thin cloud outside the surface is written in code: each 6x8 tile of the
 * grid holds one 5x7 bitmap glyph, picked by how much light the cloud has
 * there, so the faint outer shell is an ASCII rendering of itself.
 */

const MAX_DPR = 2;

const INTRO_DELAY_MS = 80;
const INTRO_DURATION_MS = 1500;

/** Seconds per phase of the measurement loop. */
const SPREAD_FIRST = 7.5;
const SPREAD = 11;
const COLLAPSE = 1.8;
const HOLD = 3.6;
const RELEASE = 2.6;

/** The superposition's mixing angle: amplitudes cos and sin of it. */
const THETA = 0.92;

/** One slosh of the superposition, in seconds. */
const BEAT_PERIOD = 9;

/**
 * The axis leans off screen vertical and precesses steadily about it, so the
 * orbital turns in depth and both its lobes and its rings stay readable.
 * Radians and radians per second.
 */
const LEAN = 0.42;
const PITCH = 0.42;
const PRECESS = (Math.PI * 2) / 48;

/** Bounding radius of the volume in Bohr radii, and the camera distance. */
const BOUND = 62;
const CAM = 240;
const STEPS = 150;

/** Code glyph tiles, in art pixels: a 5x7 glyph and its spacing. */
const TILE_W = 6;
const TILE_H = 8;

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

/**
 * A 5x7 bitmap font, rows top to bottom. The label's letters come first, then
 * the code glyphs, which are sorted by ink at load to form a tone ramp.
 */
const LABEL_FONT: Record<string, string[]> = {
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  s: [".....", ".....", ".####", "#....", ".###.", "....#", "####."],
  d: ["....#", "....#", ".####", "#...#", "#...#", "#...#", ".####"],
  t: [".#...", ".#...", "####.", ".#...", ".#...", ".#..#", "..##."],
  g: [".....", ".####", "#...#", "#...#", ".####", "....#", ".###."],
  r: [".....", ".....", "#.##.", "##..#", "#....", "#....", "#...."],
  e: [".....", ".....", ".###.", "#...#", "#####", "#....", ".###."],
  n: [".....", ".....", "#.##.", "##..#", "#...#", "#...#", "#...#"],
};

const CODE_FONT: Record<string, string[]> = {
  ".": [".....", ".....", ".....", ".....", ".....", "..#..", "....."],
  ":": [".....", "..#..", ".....", ".....", ".....", "..#..", "....."],
  "-": [".....", ".....", ".....", ".###.", ".....", ".....", "....."],
  "'": ["..#..", "..#..", ".....", ".....", ".....", ".....", "....."],
  "=": [".....", ".....", "#####", ".....", "#####", ".....", "....."],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
  ";": [".....", "..#..", ".....", ".....", "..#..", "..#..", ".#..."],
  _: [".....", ".....", ".....", ".....", ".....", ".....", "#####"],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  "<": ["...#.", "..#..", ".#...", "#....", ".#...", "..#..", "...#."],
  ">": [".#...", "..#..", "...#.", "....#", "...#.", "..#..", ".#..."],
  "(": ["...#.", "..#..", ".#...", ".#...", ".#...", "..#..", "...#."],
  ")": [".#...", "..#..", "...#.", "...#.", "...#.", "..#..", ".#..."],
  "[": [".###.", ".#...", ".#...", ".#...", ".#...", ".#...", ".###."],
  "]": [".###.", "...#.", "...#.", "...#.", "...#.", "...#.", ".###."],
  "{": ["..##.", ".#...", ".#...", "#....", ".#...", ".#...", "..##."],
  "}": [".##..", "...#.", "...#.", "....#", "...#.", "...#.", ".##.."],
  "|": ["..#..", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
  "*": [".....", "#.#.#", ".###.", "#####", ".###.", "#.#.#", "....."],
  x: [".....", ".....", "#...#", ".#.#.", "..#..", ".#.#.", "#...#"],
  f: ["..##.", ".#...", "####.", ".#...", ".#...", ".#...", ".#..."],
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
  "%": ["##...", "##..#", "...#.", "..#..", ".#...", "#..##", "...##"],
  "&": [".##..", "#..#.", "#.#..", ".#...", "#.#.#", "#..#.", ".##.#"],
  "#": [".#.#.", ".#.#.", "#####", ".#.#.", "#####", ".#.#.", ".#.#."],
  "@": [".###.", "#...#", "#.###", "#.#.#", "#.###", "#....", ".####"],
};

const LABEL = "sdt green";

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

/**
 * The volume pass, one fragment per art pixel. It finds where each ray first
 * crosses the isosurface |psi| = ISO and lights it, and integrates the thinner
 * cloud in front of it.
 *   r: surface light, 0 where the ray misses
 *   g: the sign of psi at the surface, 0 one sign, 1 the other
 *   b: the cloud in front of the surface
 *   a: the sign of psi in that cloud
 */
const VOLUME_FS = `
${PRECISION}
uniform vec2  uGrid;
uniform vec2  uCenter;
uniform float uPx;
uniform mat3  uRot;
uniform vec2  uAB;
uniform float uBeat;
uniform float uIso;
uniform vec3  uLight;

const float BOUND = ${f(BOUND)};
const float CAM = ${f(CAM)};
const int STEPS = ${STEPS};
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

// psi as (re, im), with the beat as the relative phase of the two states.
vec2 psi(vec3 x, float A, float B, float cb, float sb) {
  vec2 p = orbitals(x);
  return vec2(A * p.x + B * p.y * cb, -B * p.y * sb);
}

float rho(vec3 x, float A, float B, float cb, float sb) {
  vec2 w = psi(x, A, B, cb, sb);
  return dot(w, w);
}

// Light at a point on the isosurface, and the sign of psi there.
vec2 shade(vec3 x, vec3 rd, float A, float B, float cb, float sb) {
  const float e = 0.35;
  vec2 w0 = psi(x, A, B, cb, sb);
  vec3 grad = vec3(
    rho(x + vec3(e, 0.0, 0.0), A, B, cb, sb) - rho(x - vec3(e, 0.0, 0.0), A, B, cb, sb),
    rho(x + vec3(0.0, e, 0.0), A, B, cb, sb) - rho(x - vec3(0.0, e, 0.0), A, B, cb, sb),
    rho(x + vec3(0.0, 0.0, e), A, B, cb, sb) - rho(x - vec3(0.0, 0.0, e), A, B, cb, sb)
  );
  // Outward is down the density gradient. Back into view space: M v.
  vec3 n = normalize(uRot * -grad);
  vec3 vdir = -rd;
  float diff = max(dot(n, uLight), 0.0);
  float spec = pow(max(dot(reflect(-uLight, n), vdir), 0.0), 16.0);
  float face = max(dot(n, vdir), 0.0);
  float depth = (uRot * x).z / BOUND;

  float light = 0.1 + 0.72 * diff + 0.18 * face;
  light *= mix(0.55, 1.0, smoothstep(-0.7, 0.5, depth));
  light = clamp(light + 0.5 * spec, 0.0, 1.0);
  float sgn = 0.5 + 0.5 * w0.x * inversesqrt(dot(w0, w0) + 1e-9);
  return vec2(0.04 + 0.96 * light, sgn);
}

void main() {
  vec2 cell = vec2(floor(gl_FragCoord.x), uGrid.y - 1.0 - floor(gl_FragCoord.y)) + 0.5;
  vec2 q = (cell - uCenter) / uPx;
  q.y = -q.y;

  vec3 ro = vec3(0.0, 0.0, CAM);
  vec3 rd = normalize(vec3(q, 0.0) - ro);
  float b = dot(ro, rd);
  float c = dot(ro, ro) - BOUND * BOUND;
  float disc = b * b - c;
  if (disc <= 0.0) {
    gl_FragColor = vec4(0.0, 0.25, 0.0, 0.5);
    return;
  }
  float s = sqrt(disc);
  float t0 = -b - s;
  float t1 = -b + s;

  // Into the orbital's own frame: v * M is the transpose of M applied to v.
  vec3 o = ro * uRot;
  vec3 d = rd * uRot;

  float A = uAB.x;
  float B = uAB.y;
  float cb = cos(uBeat);
  float sb = sin(uBeat);
  float iso2 = uIso * uIso;

  // Two crossings: the first surface the ray meets, and the next one behind
  // it once the ray has come back out, so an outer shell can be drawn as a
  // mesh with the inner one showing through.
  float dt = (t1 - t0) / float(STEPS);
  float t = t0;
  float prev = 0.0;
  float tFront = -1.0;
  float tBack = -1.0;
  bool inside = false;
  for (int i = 0; i < STEPS; i++) {
    float r = rho(o + d * t, A, B, cb, sb);
    if (!inside && r > iso2) {
      float k = (iso2 - prev) / max(r - prev, 1e-6);
      float th = t - dt * (1.0 - clamp(k, 0.0, 1.0));
      if (tFront < 0.0) {
        tFront = th;
        inside = true;
      } else {
        tBack = th;
        break;
      }
    } else if (inside && r < iso2) {
      inside = false;
    }
    prev = r;
    t += dt;
  }

  if (tFront < 0.0) {
    gl_FragColor = vec4(0.0, 0.25, 0.0, 0.5);
    return;
  }

  vec3 xf = o + d * tFront;
  vec2 front = shade(xf, rd, A, B, cb, sb);
  vec2 back = vec2(0.0, 0.5);
  float shell = 0.0;
  if (tBack > 0.0) {
    vec3 xb = o + d * tBack;
    back = shade(xb, rd, A, B, cb, sb);
    // The front is an outer shell when it lies well outside what is behind it.
    shell = step(length(xb) + 4.0, length(xf));
  }
  gl_FragColor = vec4(front.x, front.y * 0.49 + shell * 0.5, back.x, back.y);
}
`;

/**
 * The composite, at device resolution. Every device pixel finds its art pixel
 * and paints it one flat palette colour.
 */
const COMPOSITE_FS = `
${PRECISION}
uniform vec2  uRes;
uniform float uCell;
uniform vec2  uGrid;
uniform vec2  uCenter;
uniform sampler2D uVol;
uniform sampler2D uFont;
uniform float uFontN;
uniform float uRamp0;
uniform float uRampN;
uniform float uLabel[12];
uniform float uLabelN;
uniform float uFocus;
uniform vec3  uInk;
uniform vec3  uDeep;
uniform vec3  uA;
uniform vec3  uB;
uniform vec3  uLight;
uniform vec3  uPass;
uniform float uCollapse;
uniform float uIntro;
uniform vec2  uAxis;
uniform vec2  uRing;
uniform vec4  uBlocks[10];

#define AVOID_N 8
uniform vec4 uAvoid[AVOID_N];
uniform float uFeather;

float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x / 2.0 + a.y * a.y * 0.75);
}
// Bayer 8x8 by recursion: each level adds a finer 2x2 to a coarser one.
float bayer(vec2 a) {
  return (bayer2(0.25 * a) * 0.25 + bayer2(0.5 * a)) * 0.25 + bayer2(a);
}

float hash21(vec2 p_) {
  vec3 p3 = fract(vec3(p_.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec4 vol(vec2 cell) {
  cell = clamp(cell, vec2(0.0), uGrid - 1.0);
  return texture2D(uVol, vec2(cell.x + 0.5, uGrid.y - cell.y - 0.5) / uGrid);
}

float glyph(float index, vec2 p) {
  if (p.x > 4.5 || p.y > 6.5) return 0.0;
  return texture2D(uFont, vec2((index * 5.0 + p.x + 0.5) / (uFontN * 5.0), (p.y + 0.5) / 7.0)).r;
}

float avoidMask(vec2 p) {
  float cover = 0.0;
  for (int i = 0; i < AVOID_N; i++) {
    vec4 r = uAvoid[i];
    if (r.z <= r.x) continue;
    vec2 c = 0.5 * (r.xy + r.zw);
    vec2 h = 0.5 * (r.zw - r.xy);
    vec2 d = abs(p - c) - h;
    float sd = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
    cover = max(cover, 1.0 - smoothstep(-uFeather * 0.2, uFeather, sd));
  }
  return 1.0 - cover;
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 cell = floor(frag / uCell);
  float bt = bayer(cell);
  // Offset copies of the same matrix, so independent choices do not lock step.
  float bt2 = bayer(cell + vec2(4.0, 2.0));
  float bt3 = bayer(cell + vec2(2.0, 5.0));
  float mask = avoidMask(cell + 0.5);
  float show = step(bt3, uIntro);

  // The field: flat ink with a sparse dithered pool of deep around the nucleus.
  float m = min(uGrid.x * 0.75, uGrid.y);
  vec2 g = (cell - uCenter) / vec2(m * 0.95, m * 0.75);
  float pool = 0.1 * (1.0 - smoothstep(0.0, 1.0, length(g)));
  vec3 col = (pool * mask > bt) ? uDeep : uInk;

  // A few mosaic squares drifting through the empty sky.
  for (int i = 0; i < 10; i++) {
    vec4 k = uBlocks[i];
    if (k.z <= 0.0) continue;
    vec2 rel = cell - k.xy;
    if (rel.x >= 0.0 && rel.y >= 0.0 && rel.x < k.z && rel.y < k.z && mask > 0.95) {
      col = k.w < 0.5 ? uDeep : (k.w < 1.5 ? uB : (mod(cell.x + cell.y, 2.0) < 1.0 ? uB : uDeep));
    }
  }

  vec4 v = vol(cell);
  float hit = step(0.01, v.r);
  float shell = step(0.495, v.g);
  float fs = (v.g - 0.5 * shell) / 0.49;
  // An outer shell over an inner one is a mesh: every other art pixel shows
  // the surface behind it, the oldest transparency in pixel art.
  bool mesh = shell > 0.5 && v.b > 0.01 && mod(cell.x + cell.y, 2.0) > 0.5;
  float L = mesh ? v.b : v.r;
  float sg = mesh ? v.a : fs;

  // The sign colours. Psi's phase picks between them through the dither, and
  // a measurement turns one sign green, a pixel at a time.
  vec3 xs = (sg > 0.25 + 0.5 * bt2) ? uA : uB;
  if (sg > 0.5 && uCollapse > bt2) xs = uPass;

  if (hit > 0.5 && mask > bt * 0.999 && show > 0.5) {
    vec3 sc;
    if (L >= 0.7) {
      // Lit: the sign colour, breaking to paper light in the highlight.
      // Paper light is kept off the fade, so no bright speck sits by a word.
      sc = ((L - 0.7) / 0.3 * 0.7 * step(0.98, mask) > bt) ? uLight : xs;
    } else if (L >= 0.4) {
      sc = ((L - 0.4) / 0.3 * 0.5 + 0.5 > bt) ? xs : uDeep;
    } else {
      // Shadow is written in code: one glyph per tile, chosen by its ink.
      vec2 tile = floor(cell / vec2(${TILE_W}.0, ${TILE_H}.0));
      vec2 inTile = cell - tile * vec2(${TILE_W}.0, ${TILE_H}.0);
      float tone = clamp(L / 0.4, 0.0, 0.999);
      float pick = floor(tone * uRampN + (hash21(tile) - 0.5) * 2.0);
      pick = clamp(pick, 0.0, uRampN - 1.0);
      sc = glyph(uRamp0 + pick, inTile) > 0.5 ? xs : uDeep;
    }
    // A crisp silhouette: an art pixel at the edge of a lobe is always lit.
    float edge = step(vol(cell + vec2(1.0, 0.0)).r, 0.01) + step(vol(cell - vec2(1.0, 0.0)).r, 0.01)
      + step(vol(cell + vec2(0.0, 1.0)).r, 0.01) + step(vol(cell - vec2(0.0, 1.0)).r, 0.01);
    if (edge > 0.5) sc = xs;
    col = sc;
  }

  // The photon from the decay, a ring of mosaic squares leaving the nucleus,
  // brightest across the dipole axis and dark along it.
  if (uRing.y > 0.001) {
    vec2 blk = floor(cell / 4.0);
    vec2 dc = blk * 4.0 + 2.0 - uCenter;
    float rr = length(dc);
    float ca = dot(dc / max(rr, 1.0), uAxis);
    float rw = (rr - uRing.x) / 7.0;
    float ring = uRing.y * (1.0 - ca * ca) * exp(-rw * rw) * mask;
    if (ring > 0.04 + hash21(blk + 7.0)) col = uPass;
  }

  // The measured state, on a plate of pass green at the nucleus.
  if (uFocus > 0.0) {
    float w = uLabelN * 6.0 - 1.0;
    vec2 o = floor(uCenter - vec2(floor(w * 0.5), 3.0));
    vec2 lp = cell - o;
    if (lp.x >= -5.0 && lp.x < w + 5.0 && lp.y >= -4.0 && lp.y < 11.0 && uFocus > bt) {
      // An ink margin keeps the plate off whatever lobe it sits on.
      bool plate = lp.x >= -4.0 && lp.x < w + 4.0 && lp.y >= -3.0 && lp.y < 10.0;
      col = plate ? uPass : uInk;
      if (lp.x >= 0.0 && lp.y >= 0.0 && lp.x < w && lp.y < 7.0) {
        float slot = floor(lp.x / 6.0);
        float gi = 0.0;
        for (int i = 0; i < 12; i++) {
          if (float(i) == slot) gi = uLabel[i];
        }
        if (glyph(gi, vec2(lp.x - slot * 6.0, lp.y)) > 0.5) col = uInk;
      }
    }
  }

  gl_FragColor = vec4(col, 1.0);
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

/**
 * The font as one strip texture, glyph after glyph, 5 texels wide each. The
 * label's letters come first; the code glyphs follow, sorted by ink, so a
 * glyph's index along the ramp is the tone it prints.
 */
function buildFont(): { data: Uint8Array; count: number; ramp0: number; rampN: number } {
  const label = Object.entries(LABEL_FONT);
  const code = Object.entries(CODE_FONT)
    .map(([, rows]) => rows.join(""))
    .map((bits) => [bits, bits.split("").filter((b) => b === "#").length] as const)
    .sort((a, b) => a[1] - b[1]);
  const glyphs = [...label.map(([, rows]) => rows.join("")), ...code.map(([bits]) => bits)];
  const count = glyphs.length;
  const data = new Uint8Array(count * 5 * 7);
  glyphs.forEach((bits, gi) => {
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 5; x++) {
        data[y * count * 5 + gi * 5 + x] = bits[y * 5 + x] === "#" ? 255 : 0;
      }
    }
  });
  return { data, count, ramp0: label.length, rampN: code.length };
}

type Phase = "spread" | "collapse" | "hold" | "release";

/** The drifting mosaic squares: fractions of the card, size in art pixels. */
const BLOCKS: Array<[number, number, number, number, number]> = [
  // x, y, size, tone (0 deep, 1 sign, 2 checker), drift in art pixels per second
  [0.86, 0.1, 6, 1, 0.7],
  [0.9, 0.16, 4, 0, 0.5],
  [0.8, 0.07, 4, 2, 0.6],
  [0.95, 0.06, 8, 0, 0.4],
  [0.74, 0.14, 3, 1, 0.8],
  [0.97, 0.22, 5, 2, 0.5],
  [0.69, 0.05, 5, 0, 0.45],
];

export function initHeroG(canvas: HTMLCanvasElement, host: HTMLElement): () => void {
  // Lab only: `?pal=phosphor` swaps the palette for comparison.
  const params = new URLSearchParams(location.search);
  const pal = params.get("pal");
  if (pal) host.dataset.palette = pal;

  const gl = (canvas.getContext("webgl", {
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
    powerPreference: "low-power",
  }) || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
  // No context means the card keeps its flat ink.
  if (!gl) return () => {};

  let volProg: WebGLProgram | null = null;
  let compProg: WebGLProgram | null = null;
  let quad: WebGLBuffer | null = null;
  let volTex: WebGLTexture | null = null;
  let fontTex: WebGLTexture | null = null;
  let fbo: WebGLFramebuffer | null = null;

  function releaseGL(): void {
    if (!gl) return;
    for (const p of [volProg, compProg]) if (p) gl.deleteProgram(p);
    if (quad) gl.deleteBuffer(quad);
    for (const t of [volTex, fontTex]) if (t) gl.deleteTexture(t);
    if (fbo) gl.deleteFramebuffer(fbo);
    volProg = compProg = null;
    quad = null;
    volTex = fontTex = null;
    fbo = null;
  }

  try {
    volProg = link(gl, FULLSCREEN_VS, VOLUME_FS);
    compProg = link(gl, FULLSCREEN_VS, COMPOSITE_FS);
  } catch (error) {
    console.warn(error);
    releaseGL();
    return () => {};
  }

  quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const nearest = () => {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  };

  volTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, volTex);
  nearest();
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

  const font = buildFont();
  fontTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, fontTex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.LUMINANCE,
    font.count * 5,
    7,
    0,
    gl.LUMINANCE,
    gl.UNSIGNED_BYTE,
    font.data,
  );
  nearest();

  const locs = (program: WebGLProgram, names: string[]) =>
    Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(program, n)])) as Record<
      string,
      WebGLUniformLocation | null
    >;
  const uv = locs(volProg, ["uGrid", "uCenter", "uPx", "uRot", "uAB", "uBeat", "uIso", "uLight"]);
  const uc = locs(compProg, [
    "uRes",
    "uCell",
    "uGrid",
    "uCenter",
    "uVol",
    "uFont",
    "uFontN",
    "uRamp0",
    "uRampN",
    "uLabel",
    "uLabelN",
    "uFocus",
    "uInk",
    "uDeep",
    "uA",
    "uB",
    "uLight",
    "uPass",
    "uCollapse",
    "uIntro",
    "uAxis",
    "uRing",
    "uBlocks",
    "uAvoid",
    "uFeather",
  ]);

  const labelKeys = Object.keys(LABEL_FONT);
  const label = new Float32Array(12);
  for (let i = 0; i < LABEL.length && i < 12; i++) {
    label[i] = Math.max(0, labelKeys.indexOf(LABEL[i]!));
  }

  gl.useProgram(compProg);
  gl.uniform1i(uc.uVol!, 0);
  gl.uniform1i(uc.uFont!, 1);
  gl.uniform1f(uc.uFontN!, font.count);
  gl.uniform1f(uc.uRamp0!, font.ramp0);
  gl.uniform1f(uc.uRampN!, font.rampN);
  gl.uniform1fv(uc.uLabel!, label);
  gl.uniform1f(uc.uLabelN!, LABEL.length);

  function readPalette(): void {
    gl!.useProgram(compProg);
    gl!.uniform3fv(uc.uInk!, readColor(host, "--hg-ink", "#0b0c22"));
    gl!.uniform3fv(uc.uDeep!, readColor(host, "--hg-deep", "#252c78"));
    gl!.uniform3fv(uc.uA!, readColor(host, "--hg-a", "#ff6a55"));
    gl!.uniform3fv(uc.uB!, readColor(host, "--hg-b", "#7c8cff"));
    gl!.uniform3fv(uc.uLight!, readColor(host, "--hg-light", "#f3eee4"));
    gl!.uniform3fv(uc.uPass!, readColor(host, "--hg-pass", "#4be38d"));
  }
  readPalette();

  const aQuadVol = gl.getAttribLocation(volProg, "aPos");
  const aQuadComp = gl.getAttribLocation(compProg, "aPos");

  const headline = host.querySelector<HTMLElement>("[data-hero-headline]");
  const mark = host.querySelector<HTMLElement>("[data-hg-mark]");
  const button = host.querySelector<HTMLElement>("[data-buy-btn]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Lab only: `?hg=1&beat=1.2&rot=0.5` pins the collapse, the slosh and the turn.
  const num = (key: string) => {
    const raw = Number.parseFloat(params.get(key) ?? "");
    return Number.isFinite(raw) ? raw : null;
  };
  const pinRaw = num("hg");
  const pin = pinRaw === null ? null : clamp(pinRaw, 0, 1);
  const pinBeat = num("beat");
  const pinRot = num("rot");
  const pinRing = num("ring");

  // Geometry. W and H in device pixels; everything else in art pixels.
  let W = 1;
  let H = 1;
  let GW = 1;
  let GH = 1;
  let cellPx = 1;
  let cx = 0;
  let cy = 0;
  let px = 1;
  const avoid = new Float32Array(32);
  const blocks = new Float32Array(40);

  // Clock and per-frame state.
  let t = pinRot ?? (reducedMotion.matches ? 9 : Math.random() * 48);
  let beat = pinBeat ?? (reducedMotion.matches ? 1.1 : Math.random() * Math.PI * 2);
  let drift = 0;
  let phase: Phase = "spread";
  let phaseT = 0;
  let spreadFor = SPREAD_FIRST;
  let autoC = 0;
  let ringAge = pinRing ?? 99;
  let slow = 0;

  const startedAt = performance.now();
  let lastFrame = startedAt;
  let rafId = 0;
  let running = false;
  let visible = true;

  function introProgress(): number {
    if (reducedMotion.matches || pin !== null) return 1;
    const raw = (performance.now() - startedAt - INTRO_DELAY_MS) / INTRO_DURATION_MS;
    return clamp(raw, 0, 1);
  }

  function collapse(): number {
    if (pin !== null) return pin;
    if (reducedMotion.matches) return 1;
    return autoC;
  }

  function rotation(): number[] {
    return mul(rotX(PITCH), mul(rotY(t * PRECESS), mul(rotZ(-LEAN), UPRIGHT)));
  }

  function measureLayout(): void {
    const rect = host.getBoundingClientRect();
    const cssW = Math.max(rect.width, 1);
    const cssH = Math.max(rect.height, 1);
    const cellCss = cellPx / Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const fx = readNumber(host, "--hg-cx", 0.72);
    const fy = readNumber(host, "--hg-cy", 0.56);
    const fr = readNumber(host, "--hg-r", 0.62);
    const radiusCss = cssW < 640 ? fr * cssW * 1.6 : fr * cssH;
    cx = Math.round((fx * cssW) / cellCss);
    cy = Math.round((fy * cssH) / cellCss);
    px = radiusCss / cellCss / 42;

    const toCells = (r: DOMRect, i: number, padX = 0, padY = 0) => {
      avoid[i * 4] = (r.left - rect.left - padX) / cellCss;
      avoid[i * 4 + 1] = (r.top - rect.top - padY) / cellCss;
      avoid[i * 4 + 2] = (r.right - rect.left + padX) / cellCss;
      avoid[i * 4 + 3] = (r.bottom - rect.top + padY) / cellCss;
    };

    // The headline's own line boxes, merged per line, so the field stays off
    // the words but is free to reach past the end of a short line.
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
      lines.slice(0, 6).forEach((l, i) => toCells(l, i, 6, -l.height * 0.08));
    }
    if (mark) toCells(mark.getBoundingClientRect(), 6, 6, 6);
    if (button) toCells(button.getBoundingClientRect(), 7, 6, 6);
  }

  function placeBlocks(): void {
    blocks.fill(0);
    if (GW < 200) return;
    BLOCKS.forEach(([x, y, size, tone, speed], i) => {
      const span = GW * 0.4;
      const along = (((x * GW - GW * 0.6 - drift * speed) % span) + span) % span;
      blocks[i * 4] = Math.floor(GW * 0.6 + along);
      blocks[i * 4 + 1] = Math.floor(y * GH - drift * speed * 0.25);
      blocks[i * 4 + 2] = size;
      blocks[i * 4 + 3] = tone;
    });
  }

  function draw(): void {
    const c = collapse();
    const ce = easeInOut(clamp(c, 0, 1));
    const theta = THETA * (1 - ce);
    const A = Math.cos(theta);
    const B = Math.sin(theta);
    const rot = rotation();
    const intro = introProgress();

    // The volume, one fragment per art pixel.
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo);
    gl!.viewport(0, 0, GW, GH);
    gl!.useProgram(volProg);
    gl!.bindBuffer(gl!.ARRAY_BUFFER, quad);
    gl!.enableVertexAttribArray(aQuadVol);
    gl!.vertexAttribPointer(aQuadVol, 2, gl!.FLOAT, false, 0, 0);
    gl!.uniform2f(uv.uGrid!, GW, GH);
    gl!.uniform2f(uv.uCenter!, cx + 0.5, cy + 0.5);
    gl!.uniform1f(uv.uPx!, px);
    gl!.uniformMatrix3fv(uv.uRot!, false, rot);
    gl!.uniform2f(uv.uAB!, A, B);
    gl!.uniform1f(uv.uBeat!, beat);
    gl!.uniform1f(uv.uIso!, 0.14 + 0.015 * (1 - ce));
    const l = [-0.55, 0.62, 0.56];
    const ll = Math.hypot(l[0]!, l[1]!, l[2]!);
    gl!.uniform3f(uv.uLight!, l[0]! / ll, l[1]! / ll, l[2]! / ll);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);

    // The composite, at device resolution.
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    gl!.viewport(0, 0, W, H);
    gl!.useProgram(compProg);
    gl!.vertexAttribPointer(aQuadComp, 2, gl!.FLOAT, false, 0, 0);
    gl!.enableVertexAttribArray(aQuadComp);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, volTex);
    gl!.activeTexture(gl!.TEXTURE1);
    gl!.bindTexture(gl!.TEXTURE_2D, fontTex);
    gl!.uniform2f(uc.uRes!, W, H);
    gl!.uniform1f(uc.uCell!, cellPx);
    gl!.uniform2f(uc.uGrid!, GW, GH);
    gl!.uniform2f(uc.uCenter!, cx + 0.5, cy + 0.5);
    gl!.uniform1f(uc.uCollapse!, ce);
    gl!.uniform1f(uc.uIntro!, intro);
    // The orbital axis on screen is the third column of the rotation.
    const ax = rot[6]!;
    const ay = -rot[7]!;
    const al = Math.hypot(ax, ay) || 1;
    gl!.uniform2f(uc.uAxis!, ax / al, ay / al);
    const ringR = ringAge * 70;
    const ringA = ringAge < 3.2 ? 0.75 * Math.exp(-ringAge / 1.0) * clamp(ringAge * 6, 0, 1) : 0;
    gl!.uniform2f(uc.uRing!, ringR, ringA);
    placeBlocks();
    gl!.uniform4fv(uc.uBlocks!, blocks);
    gl!.uniform4fv(uc.uAvoid!, avoid);
    gl!.uniform1f(uc.uFeather!, 22);
    gl!.uniform1f(uc.uFocus!, clamp((c - 0.8) / 0.2, 0, 1) * intro);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    gl!.disableVertexAttribArray(aQuadComp);
  }

  function resize(): void {
    const rect = host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const nextW = Math.max(1, Math.round(rect.width * dpr));
    const nextH = Math.max(1, Math.round(rect.height * dpr));
    // A whole number of device pixels per art pixel keeps every edge hard.
    const nextCell = Math.max(1, Math.round(readNumber(host, "--hg-cell", 3) * dpr));
    if (nextW !== W || nextH !== H || nextCell !== cellPx) {
      W = nextW;
      H = nextH;
      cellPx = nextCell;
      canvas.width = W;
      canvas.height = H;
      GW = Math.ceil(W / cellPx);
      GH = Math.ceil(H / cellPx);
      gl!.bindTexture(gl!.TEXTURE_2D, volTex);
      gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, GW, GH, 0, gl!.RGBA, gl!.UNSIGNED_BYTE, null);
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
    host.dataset.hgPhase = phase;

    // A measured orbital is still: the turning slows while it is held.
    const c = collapse();
    slow += (c - slow) * (1 - Math.exp(-dt / 0.8));
    t += dt * (1 - 0.7 * slow);
    drift += dt;
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
