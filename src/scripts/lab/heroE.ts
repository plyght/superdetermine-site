/**
 * Option E: the quantum carpet.
 *
 * A particle in a box, started as one compact wavepacket, evolves under the
 * Schrodinger equation. Its probability density traced against time draws the
 * Talbot carpet: woven light canals, fractional revivals where the packet
 * splits into exact copies, and full revivals where it reassembles.
 *
 * The card's height is the box and its width is time. The shader sums the box
 * eigenmodes for every pixel, psi(y, t) = sum c_n sin(n pi y) exp(-i 2 pi n^2 t),
 * and paints |psi|^2 as light, with hue following arg(psi). Time scrolls slowly
 * leftward, so the carpet weaves continuously. With the packet started a third
 * of the way in from the wall, the revivals land on a clean rhythm: every sixth
 * of a period the light focuses back to one point, alternating between the
 * packet's home and its mirror, and halfway between two foci it stands as two
 * simultaneous copies. A focus that passes through the clear part of the card
 * resolves green: the state that passed.
 *
 * The light is not uniform. It is carried by a faint field of code glyphs fixed
 * in the carpet, so up close the canals are made of source and from afar they
 * are only light. The pointer only nudges where the packet starts, by a
 * hair, so the weave breathes toward it while the animation runs on its own.
 */

const MAX_DPR = 2;
const MODES = 40;

/** Width of the packet's density, as a fraction of the box. */
const SIGMA = 0.02;
/** Where the packet starts, from the top of the box. Two thirds gives the cleanest weave. */
const HOME = 2 / 3;

/** Seconds per full revival period. Foci arrive every sixth of it. */
const PERIOD_S = 300;

const INTRO_DELAY_MS = 120;
const INTRO_DURATION_MS = 1400;

/** Glide of the packet's start toward and back from the pointer, in seconds. */
const POINTER_GLIDE = 2.8;

/** Furthest the pointer can move the packet's start, as a fraction of the box. */
const POINTER_REACH = 0.018;

const GLYPH_PX = 12;
const GLYPH_ROW_PX = 15;
const MAP_COLS = 256;
const MAP_ROWS = 64;
const ATLAS_COLS = 16;
const ATLAS_ROWS = 6;

/** The source the light is made of. Plausible, quiet, never shown as a listing. */
const SOURCE = [
  "let next = apply(diff, tree);",
  "if (check(state)) return state;",
  "for (const s of states) grade(s);",
  "const ok = await run(cmd);",
  "return states.find(passes);",
  "tree.write(path, blob);",
  "while (lo < hi) mid = (lo + hi) >> 1;",
  "const head = refs.get(name);",
  "if (!ok) continue;",
  "snapshot(worktree, now());",
  "match grade { Pass => keep(s), _ => {} }",
  "let blob = hash(bytes);",
  "parents.push(prev.id);",
  "fn green(&self) -> Option<State>",
  "export const diff = (a, b) => walk(a, b);",
  "store.put(id, encode(obj));",
];

/** Gaussian roll-off of the high modes for the bloom copy of the carpet. */
const BLOOM_ROLLOFF = Array.from({ length: MODES }, (_, i) => Math.exp(-(((i + 1) / 14) ** 2)));

const VERTEX_SHADER = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAGMENT_SHADER = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

#define MODES ${MODES}

uniform vec2  uRes;
uniform float uScale;
uniform float uTime;
uniform vec3  uStop0;
uniform vec3  uStop1;
uniform vec3  uStop2;
uniform float uTau;
uniform float uXm;
uniform float uPeriod;
uniform float uC[MODES];
uniform float uCs[MODES];
uniform vec4  uHead;
uniform vec4  uFoot;
uniform float uIntro;
uniform sampler2D uAtlas;
uniform sampler2D uMap;
uniform vec2  uCell;
uniform float uGlyphOff;

const vec2  ORIGIN = vec2(0.72, 0.64);
const vec2  SPAN = vec2(1.20, 1.50);
const float MID_STOP = 0.46;

const vec3 TEAL = vec3(0.24, 0.78, 0.82);
const vec3 MINT = vec3(0.30, 0.90, 0.58);
const vec3 LIME = vec3(0.78, 0.96, 0.50);
const vec3 PASS = vec3(0.30, 0.95, 0.56);
const vec3 WHITE = vec3(0.93, 1.0, 0.96);

const float PI = 3.14159265;
const float TAU2 = 6.28318531;
const float GRAIN = 0.012;

float hash21(vec2 p_) {
  p_ = fract(p_ * vec2(127.1, 311.7));
  p_ += dot(p_, p_ + 34.56);
  return fract(p_.x * p_.y);
}

vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }

/** Soft coverage of a rectangle, feathered by f device pixels. */
float rectMask(vec2 p, vec4 r, float f) {
  vec2 d = max(r.xy - p, p - r.zw);
  float dist = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  return 1.0 - smoothstep(-f * 0.25, f, dist);
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 p = frag / uRes;

  float g = length((p - ORIGIN) / SPAN);
  vec3 base = mix(uStop0, uStop1, clamp(g / MID_STOP, 0.0, 1.0));
  base = mix(base, uStop2, clamp((g - MID_STOP) / (1.0 - MID_STOP), 0.0, 1.0));

  // The box is the card's height; time runs along its width.
  float y = clamp(p.y, 0.0, 1.0);
  float t = fract(uTau + (frag.x - uXm) / uPeriod);

  // Each mode's phase advances as n^2, so successive phases differ by
  // exp(-i 2 pi (2n + 1) t). Two recurrences give every mode from two
  // rotations instead of a sine and cosine per term.
  float a1 = -TAU2 * t;
  vec2 z = vec2(cos(a1), sin(a1));
  vec2 w = vec2(cos(3.0 * a1), sin(3.0 * a1));
  vec2 b = vec2(cos(2.0 * a1), sin(2.0 * a1));

  // sin(n pi y) by the Chebyshev recurrence.
  float c1 = cos(PI * y);
  float sPrev = 0.0;
  float s = sin(PI * y);

  vec2 psi = vec2(0.0);
  vec2 soft = vec2(0.0);
  for (int n = 0; n < MODES; n++) {
    psi += uC[n] * s * z;
    soft += uCs[n] * s * z;
    float sNext = 2.0 * c1 * s - sPrev;
    sPrev = s;
    s = sNext;
    z = cmul(z, w);
    w = cmul(w, b);
  }
  float rho = dot(psi, psi);
  // The same state with its high modes rolled off: a defocused copy of the
  // carpet that stands in for bloom around the bright canals.
  float bloom = dot(soft, soft);

  // Probability as light: the mean density of the box is one, the canals sit
  // a little above it and a whole packet peaks near eight.
  float L = 1.0 - exp(-pow(rho * 0.27, 1.8));

  // The light is carried by code fixed in the carpet, so it scrolls with it.
  vec2 gp = vec2(frag.x + uGlyphOff, frag.y) / uCell;
  vec2 cell = floor(gp);
  vec2 local = fract(gp);
  vec2 mapUV = (mod(cell, vec2(${MAP_COLS}.0, ${MAP_ROWS}.0)) + 0.5) / vec2(${MAP_COLS}.0, ${MAP_ROWS}.0);
  float ch = floor(texture2D(uMap, mapUV).r * 255.0 + 0.5);
  vec2 atlasCell = vec2(mod(ch, ${ATLAS_COLS}.0), floor(ch / ${ATLAS_COLS}.0));
  float glyph = texture2D(uAtlas, (atlasCell + local) / vec2(${ATLAS_COLS}.0, ${ATLAS_ROWS}.0)).r;

  // A whole packet resolves green while it crosses the clear side of the card.
  float whole = smoothstep(5.0, 13.0, rho);
  float dxm = (frag.x - uXm) / (uRes.x * 0.3);
  float passing = whole * exp(-dxm * dxm);

  float material = 0.26 + 0.2 * passing;
  float light = L * (1.0 - material + material * (0.3 + 1.7 * glyph));

  // Phase colour, held to a quiet band of greens. The global rotation is the
  // packet's own energy, so the hue drifts through the weave without moving it.
  float arg = atan(psi.y, psi.x) + uTime * 0.35;
  vec3 hue = mix(TEAL, MINT, 0.5 + 0.5 * cos(arg));
  hue = mix(hue, LIME, 0.28 * smoothstep(0.25, 1.0, sin(arg)));
  hue = mix(hue, PASS, passing);
  hue = mix(hue, WHITE, smoothstep(0.55, 1.0, L) * (0.55 - 0.25 * passing));

  // Clear of the headline and the foot, and the box walls fade to the field.
  float head = rectMask(frag, uHead, 70.0 * uScale);
  float foot = rectMask(frag, uFoot, 40.0 * uScale);
  float keep = (1.0 - 0.82 * head) * (1.0 - 0.4 * foot);

  float halo = (1.0 - exp(-bloom * 0.2)) * 0.26;
  float a = clamp((light * 0.86 + halo) * keep * uIntro, 0.0, 1.0);

  vec3 col = 1.0 - (1.0 - base) * (1.0 - hue * a);
  col += (hash21(frag) - 0.5) * GRAIN;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error("Carpet shader compile error: " + log);
  }
  return shader;
}

/** Reads a `#rrggbb` custom property off the host, so the CSS owns the palette. */
function readStop(host: HTMLElement, name: string, fallback: string): [number, number, number] {
  const raw = getComputedStyle(host).getPropertyValue(name).trim();
  const hex = /^#[0-9a-f]{6}$/i.test(raw) ? raw : fallback;
  const value = parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * Box eigenmode amplitudes of a Gaussian packet centred at x0. Normalised so
 * the density averages one across the box.
 */
function coefficients(x0: number, out: Float32Array): void {
  let sum = 0;
  for (let i = 0; i < MODES; i++) {
    const n = i + 1;
    const k = n * Math.PI * SIGMA;
    out[i] = Math.exp(-k * k) * Math.sin(n * Math.PI * x0);
    sum += out[i]! * out[i]!;
  }
  const norm = Math.sqrt(2 / Math.max(sum, 1e-9));
  for (let i = 0; i < MODES; i++) out[i]! *= norm;
}

/** One character per cell: lines of source run end to end along each row. */
function buildGlyphMap(): Uint8Array {
  const data = new Uint8Array(MAP_COLS * MAP_ROWS);
  for (let r = 0; r < MAP_ROWS; r++) {
    let line = "";
    let k = (r * 7) % SOURCE.length;
    while (line.length < MAP_COLS) {
      line += SOURCE[k % SOURCE.length] + "   ";
      k += 3;
    }
    for (let c = 0; c < MAP_COLS; c++) {
      const code = line.charCodeAt(c);
      data[r * MAP_COLS + c] = code >= 32 && code < 127 ? code - 32 : 0;
    }
  }
  return data;
}

/** Printable ASCII in a 16 by 6 grid, white on black, one glyph per cell. */
function buildAtlas(cellW: number, cellH: number, fontPx: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(cellW * ATLAS_COLS);
  canvas.height = Math.ceil(cellH * ATLAS_ROWS);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `500 ${fontPx}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace`;
  for (let i = 1; i < 95; i++) {
    const cx = (i % ATLAS_COLS) * cellW + cellW / 2;
    const cy = Math.floor(i / ATLAS_COLS) * cellH + cellH / 2;
    ctx.fillText(String.fromCharCode(32 + i), cx, cy);
  }
  return canvas;
}

export function initHeroE(canvas: HTMLCanvasElement, host: HTMLElement): () => void {
  const gl = (canvas.getContext("webgl", {
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    // The reduced-motion path paints one frame and stops, so the drawing buffer
    // has to survive compositing rather than being cleared behind it.
    preserveDrawingBuffer: true,
    powerPreference: "low-power",
  }) || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
  // No context means the card keeps its CSS gradient.
  if (!gl) return () => {};

  let program: WebGLProgram | null = null;
  let vertex: WebGLShader | null = null;
  let fragment: WebGLShader | null = null;
  let buffer: WebGLBuffer | null = null;
  let atlasTex: WebGLTexture | null = null;
  let mapTex: WebGLTexture | null = null;

  function releaseGL(): void {
    if (!gl) return;
    if (buffer) gl.deleteBuffer(buffer);
    if (atlasTex) gl.deleteTexture(atlasTex);
    if (mapTex) gl.deleteTexture(mapTex);
    if (program) gl.deleteProgram(program);
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    buffer = atlasTex = mapTex = program = vertex = fragment = null;
  }

  try {
    vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    program = gl.createProgram()!;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error("Carpet program link error: " + gl.getProgramInfoLog(program));
    }
  } catch (error) {
    console.warn(error);
    releaseGL();
    return () => {};
  }

  gl.useProgram(program);

  buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const loc = (name: string) => gl.getUniformLocation(program!, name);
  const u = {
    res: loc("uRes"),
    scale: loc("uScale"),
    time: loc("uTime"),
    stop0: loc("uStop0"),
    stop1: loc("uStop1"),
    stop2: loc("uStop2"),
    tau: loc("uTau"),
    xm: loc("uXm"),
    period: loc("uPeriod"),
    c: loc("uC"),
    cs: loc("uCs"),
    head: loc("uHead"),
    foot: loc("uFoot"),
    intro: loc("uIntro"),
    atlas: loc("uAtlas"),
    map: loc("uMap"),
    cell: loc("uCell"),
    glyphOff: loc("uGlyphOff"),
  };

  gl.uniform3fv(u.stop0, readStop(host, "--carpet-stop-0", "#0c4a2b"));
  gl.uniform3fv(u.stop1, readStop(host, "--carpet-stop-1", "#062d1a"));
  gl.uniform3fv(u.stop2, readStop(host, "--carpet-stop-2", "#03140c"));
  gl.uniform1i(u.atlas, 0);
  gl.uniform1i(u.map, 1);

  // The glyph map never changes; the atlas is redrawn whenever the DPR does.
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  mapTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, mapTex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.LUMINANCE,
    MAP_COLS,
    MAP_ROWS,
    0,
    gl.LUMINANCE,
    gl.UNSIGNED_BYTE,
    buildGlyphMap(),
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  atlasTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, atlasTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const headline = host.querySelector<HTMLElement>("[data-hero-headline]");
  const foot = host.querySelector<HTMLElement>("[data-carpet-foot]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");

  // Lab only: `?tau=0.25` pins the carpet with that moment at the clear point,
  // for screenshots. 0 is a full revival, 0.25 two copies, 0.1 mid-weave.
  const pinned = Number.parseFloat(new URLSearchParams(location.search).get("tau") ?? "");
  const pin = Number.isFinite(pinned) ? pinned : null;

  const coeffs = new Float32Array(MODES);
  const softCoeffs = new Float32Array(MODES);
  let x0 = HOME;
  let x0Target = HOME;
  coefficients(x0, coeffs);

  // Geometry, in device pixels.
  let W = 1;
  let H = 1;
  let scale = 1;
  let xm = 0;
  let period = 1;
  let cellW = 7;
  let cellH = GLYPH_ROW_PX;
  let atlasScale = 0;
  const head = new Float32Array(4);
  const footRect = new Float32Array(4);

  // Time. `tau` is the moment at the clear point, in periods, and never wraps
  // here so the glyph field can scroll without a seam.
  let tau = pin ?? (reducedMotion.matches ? 0 : -0.025);
  let clock = 0;

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

  function uploadAtlas(): void {
    if (atlasScale === scale) return;
    atlasScale = scale;
    const fontPx = GLYPH_PX * scale;
    const probe = document.createElement("canvas").getContext("2d")!;
    probe.font = `500 ${fontPx}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace`;
    cellW = Math.max(1, Math.round(probe.measureText("M").width));
    cellH = Math.round(GLYPH_ROW_PX * scale);
    const atlas = buildAtlas(cellW, cellH, fontPx);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, atlasTex);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.LUMINANCE, gl!.LUMINANCE, gl!.UNSIGNED_BYTE, atlas);
  }

  function measureLayout(): void {
    const rect = host.getBoundingClientRect();
    const cssW = rect.width;
    const cssH = rect.height;
    const narrow = cssW < 640;

    // The clear point, where a whole packet reads green, sits right of the
    // headline on a wide card and in the middle on a narrow one.
    xm = (narrow ? 0.66 : 0.68) * cssW * scale;
    // Seconds of carpet across the card: a period spans about four card widths
    // on a laptop and is compressed on a phone so a focus still fits.
    const periodCss = narrow ? cssH * 10 : clamp(cssW * 9, cssH * 14, cssH * 26);
    period = periodCss * scale;

    const toRect = (el: HTMLElement | null, out: Float32Array, pad: number) => {
      if (!el) {
        out.set([-1e4, -1e4, -1e4, -1e4]);
        return;
      }
      const r = el.getBoundingClientRect();
      out[0] = (r.left - rect.left - pad) * scale;
      out[1] = (r.top - rect.top - pad) * scale;
      out[2] = (r.right - rect.left + pad) * scale;
      out[3] = (r.bottom - rect.top + pad) * scale;
    };
    toRect(headline, head, 6);
    toRect(foot, footRect, 0);
  }

  function draw(): void {
    const tauWrapped = tau - Math.floor(tau);
    const glyphSpan = MAP_COLS * cellW;
    const scrolled = tau * period;
    const glyphOff = ((scrolled % glyphSpan) + glyphSpan) % glyphSpan;

    gl!.uniform2f(u.res, W, H);
    gl!.uniform1f(u.scale, scale);
    gl!.uniform1f(u.time, clock);
    gl!.uniform1f(u.tau, tauWrapped);
    gl!.uniform1f(u.xm, xm);
    gl!.uniform1f(u.period, period);
    gl!.uniform1fv(u.c, coeffs);
    for (let i = 0; i < MODES; i++) softCoeffs[i] = coeffs[i]! * BLOOM_ROLLOFF[i]!;
    gl!.uniform1fv(u.cs, softCoeffs);
    gl!.uniform4fv(u.head, head);
    gl!.uniform4fv(u.foot, footRect);
    gl!.uniform1f(u.intro, introProgress());
    gl!.uniform2f(u.cell, cellW, cellH);
    gl!.uniform1f(u.glyphOff, glyphOff);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }

  function resize(): void {
    const rect = host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const nextW = Math.max(1, Math.round(rect.width * dpr));
    const nextH = Math.max(1, Math.round(rect.height * dpr));
    scale = dpr;
    uploadAtlas();
    measureLayout();
    if (nextW !== W || nextH !== H) {
      W = nextW;
      H = nextH;
      canvas.width = nextW;
      canvas.height = nextH;
      gl!.viewport(0, 0, nextW, nextH);
    }
    if (!running) draw();
  }

  function frame(now: number): void {
    const dt = clamp((now - lastFrame) / 1000, 0, 0.1);
    lastFrame = now;
    clock += dt;
    tau += dt / PERIOD_S;

    // The packet's start glides toward the pointer and back home, and the whole
    // carpet re-weaves around it as it moves.
    const k = 1 - Math.exp(-dt / POINTER_GLIDE);
    const before = x0;
    x0 += (x0Target - x0) * k;
    if (Math.abs(x0Target - x0) < 1e-4) x0 = x0Target;
    if (x0 !== before) coefficients(x0, coeffs);

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

  const onPointerMove = (event: PointerEvent) => {
    if (!finePointer.matches || reducedMotion.matches || pin !== null) return;
    const rect = host.getBoundingClientRect();
    const yn = (event.clientY - rect.top) / Math.max(rect.height, 1);
    // A nudge, never a steer: the start shifts by a few hundredths of the box,
    // enough for the weave to breathe toward the pointer and no more.
    x0Target = HOME + (clamp(yn, 0, 1) - 0.5) * POINTER_REACH * 2;
  };

  const onPointerLeave = () => {
    x0Target = HOME;
  };

  host.addEventListener("pointermove", onPointerMove);
  host.addEventListener("pointerleave", onPointerLeave);

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
      // The still frame is a full revival at the clear point, resolved green.
      tau = 0;
      x0 = x0Target = HOME;
      coefficients(x0, coeffs);
      draw();
    } else {
      start();
    }
  };
  reducedMotion.addEventListener?.("change", onReducedMotionChange);

  // The headline is split into spans after load, which can move its box.
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
    host.removeEventListener("pointermove", onPointerMove);
    host.removeEventListener("pointerleave", onPointerLeave);
    window.removeEventListener("load", onLoad);
    reducedMotion.removeEventListener?.("change", onReducedMotionChange);
    releaseGL();
  };
}
