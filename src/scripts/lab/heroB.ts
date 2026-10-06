/**
 * Option B: the history wavefunction.
 *
 * History arrives from the left as a single settled trunk. At the present it
 * stops being one thing: a fan of possible futures leaves the present point as
 * a set of coherent paraxial Gaussian beams, each with its own tilt, width and
 * slowly drifting phase. The shader sums them as complex amplitudes and paints
 * |psi|^2, so wherever two futures overlap they interfere and lay down fringes,
 * exactly as a multi slit does, and the hue of the light follows arg(psi).
 *
 * Measurement collapses the field. On a timed loop, or wherever the pointer
 * sits over the fan, every possible future is drawn toward one path and fades
 * while that path resolves into a single sharp trunk: the state that passed.
 * Then the field decoheres and spreads again.
 */

const MAX_DPR = 2;

const INTRO_DELAY_MS = 120;
const INTRO_DURATION_MS = 1100;

/** Seconds per phase of the measurement loop. */
const SPREAD_FIRST = 3.4;
const SPREAD = 5.2;
const COLLAPSE = 0.85;
const HOLD = 1.8;
const RELEASE = 2.6;

/** Pointer measurement glide, in seconds, toward and away from collapse. */
const POINTER_IN = 0.16;
const POINTER_OUT = 0.45;

/** How long a tap holds its measurement on touch screens, in seconds. */
const TAP_HOLD = 1.6;

const TRIGGER_SELECTOR = "[data-wave-trigger], .buy-btn";

/**
 * The possible futures. `u` is the tilt as a fraction of the fan's half-angle,
 * `a` the amplitude and `w` an angular frequency in rad/s that makes each
 * future's phase drift against the others, so the fringes never stand still.
 * The tilts are deliberately uneven so the pattern reads as speckle and
 * branching rather than a tidy grating.
 */
const BEAMS: ReadonlyArray<{ u: number; a: number; w: number; b: number }> = [
  { u: -0.86, a: 0.5, w: 0.83, b: -0.3 },
  { u: -0.66, a: 0.78, w: -0.61, b: 0.12 },
  { u: -0.43, a: 0.66, w: 1.27, b: -0.18 },
  { u: -0.22, a: 1.0, w: -1.06, b: 0.06 },
  { u: -0.02, a: 0.86, w: 0.41, b: -0.08 },
  { u: 0.2, a: 1.0, w: -0.29, b: 0.1 },
  { u: 0.42, a: 0.72, w: 1.62, b: -0.12 },
  { u: 0.66, a: 0.84, w: -1.41, b: 0.16 },
  { u: 0.9, a: 0.55, w: 0.68, b: 0.3 },
];

const N = BEAMS.length;

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

#define N ${N}

uniform vec2  uRes;
uniform float uScale;
uniform float uTime;
uniform vec3  uStop0;
uniform vec3  uStop1;
uniform vec3  uStop2;
uniform vec2  uOrigin;
uniform float uK;
uniform float uW0;
uniform float uGrow;
uniform float uFan;
uniform float uTheta[N];
uniform float uBend[N];
uniform float uAmp[N];
uniform float uPhi[N];
uniform vec3  uWin;
uniform float uCollapse;
uniform vec3  uFade;
uniform vec3  uDetect;
uniform float uIntro;

const vec2  ORIGIN = vec2(0.20, 0.66);
const vec2  SPAN = vec2(1.20, 1.50);
const float MID_STOP = 0.44;

const vec3 TEAL = vec3(0.22, 0.80, 0.86);
const vec3 MINT = vec3(0.26, 0.88, 0.54);
const vec3 LIME = vec3(0.80, 0.96, 0.46);
const vec3 WHITE = vec3(0.93, 1.0, 0.96);

const float EXPO = 3.4;
const float GRAIN = 0.012;

float hash21(vec2 p_) {
  p_ = fract(p_ * vec2(127.1, 311.7));
  p_ += dot(p_, p_ + 34.56);
  return fract(p_.x * p_.y);
}

/**
 * One coherent future: a paraxial Gaussian beam leaving the present along a
 * gently bending path. Its transverse phase follows the local tilt, so two
 * futures that overlap lay down fringes spaced by how far apart they lean.
 */
vec2 beam(float dx, float dy, float theta, float bend, float amp, float w0, float grow, float phi) {
  float w = sqrt(w0 * w0 + grow * grow * dx * dx) + (1.0 - uIntro) * 14.0 * uScale;
  float slope = theta + 2.0 * bend * dx;
  float d = (dy - (theta + bend * dx) * dx) / w;
  float env = amp * exp(-d * d) * sqrt(uW0 / w);
  float ph = uK * (slope * dy - 0.5 * slope * slope * dx) + phi;
  return env * vec2(cos(ph), sin(ph));
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 p = frag / uRes;

  float g = length((p - ORIGIN) / SPAN);
  vec3 base = mix(uStop0, uStop1, clamp(g / MID_STOP, 0.0, 1.0));
  base = mix(base, uStop2, clamp((g - MID_STOP) / (1.0 - MID_STOP), 0.0, 1.0));

  float dx = frag.x - uOrigin.x;
  float dy = frag.y - uOrigin.y;
  float c = uCollapse;
  float r = length(vec2(dx, dy));

  // The future. Every possible branch is summed as an amplitude, so the
  // brightness is |psi|^2 and overlapping branches interfere.
  float gate = smoothstep(-2.0 * uW0, 3.0 * uW0, dx);
  vec2 psi = vec2(0.0);
  float inc = 0.0;
  float glow = 0.0;
  if (dx > -4.0 * uW0) {
    float fdx = max(dx, 0.0);
    for (int k = 0; k < N; k++) {
      vec2 b = beam(fdx, dy, uTheta[k], uBend[k], uAmp[k], uW0, uGrow, uPhi[k]);
      psi += b;
      inc += dot(b, b);
    }
    // The measured state: one sharp path that does not spread.
    vec2 b = beam(fdx, dy, uWin.x, 0.0, uWin.y, uWin.z, 0.0, 0.0);
    psi += b;
    inc += dot(b, b);
  }
  float coherent = dot(psi, psi);

  // The probability cloud: a broad, incoherent haze the futures sit inside.
  float spreadW = uFan * max(dx, 0.0) * 0.9 + 6.0 * uScale;
  float cd = dy / spreadW;
  float cloud = 0.03 * exp(-cd * cd) * (1.0 - c) * smoothstep(0.0, 120.0 * uScale, dx);

  // A travelling carrier. Wavefronts ring outward from the present, so the
  // density visibly propagates instead of standing still like a light beam.
  float carrier = 0.21 * r / uScale - uTime * 3.0;
  float ripple = 1.0 + 0.18 * cos(carrier) * (1.0 - c);

  float future = ((0.8 * coherent + 0.5 * inc) * ripple + cloud) * gate;

  // The past. One settled trunk, softening into haze toward the left edge.
  float left = clamp(-dx / max(uOrigin.x, 1.0), 0.0, 1.0);
  float wp = uW0 * 1.15 + 9.0 * uScale * pow(left, 2.2) + (1.0 - uIntro) * 14.0 * uScale;
  float pd = dy / wp;
  float past = 0.8 * exp(-2.0 * pd * pd) * (uW0 / wp) * (1.0 - gate) * (1.0 - 0.6 * left);
  float pg = dy / (10.0 * uScale);

  // A soft bloom along whichever path is real: the trunk behind the present
  // and, once measured, the passing state ahead of it. The two are blended
  // across the present so the measured path reads as one continuous line.
  float wd = (dy - uWin.x * max(dx, 0.0)) / (13.0 * uScale);
  float pastBloom = 0.03 * exp(-pg * pg) * (1.0 - left);
  float winBloom = (0.03 + 0.08 * uWin.y * uWin.y) * exp(-wd * wd) * min(uWin.y * 3.0, 1.0);
  glow = mix(pastBloom, winBloom, smoothstep(-40.0 * uScale, 40.0 * uScale, dx));

  // The present: a soft node where history becomes possibility.
  float sig = 20.0 * uScale;
  float node = 0.12 * exp(-r * r / (2.0 * sig * sig)) * (1.0 - 0.5 * c);

  float I = future + past + glow;
  float L = 1.0 - exp(-pow(I * EXPO, 0.8));

  // Phase colour. The hue follows arg(psi) and the carrier, held to a quiet
  // band of greens so the shimmer reads as depth rather than as a rainbow.
  float arg = atan(psi.y, psi.x) + carrier * 0.3;
  vec3 hue = mix(TEAL, MINT, 0.5 + 0.5 * cos(arg));
  hue = mix(hue, LIME, 0.32 * smoothstep(0.2, 1.0, sin(arg)));
  hue = mix(hue, MINT, 1.0 - gate);
  hue = mix(hue, WHITE, clamp(0.5 * c + smoothstep(0.5, 1.0, L) * 0.6, 0.0, 1.0));

  // The apparatus: a brief click where the measurement lands.
  vec2 dd = frag - uDetect.xy;
  float ds = 4.0 * uScale;
  float click = exp(-dot(dd, dd) / (2.0 * ds * ds));
  float halo = exp(-dot(dd, dd) / (2.0 * 30.0 * 30.0 * uScale * uScale));
  float sx = dd.x / (0.9 * uScale);
  float sy = dd.y / (64.0 * uScale);
  float screen = exp(-sx * sx) * exp(-sy * sy);
  float det = uDetect.z * (0.95 * click + 0.18 * halo + 0.3 * screen);

  // Clear of the headline: faded beneath it, free to bloom beyond its end.
  float topFade = max(
    smoothstep(uFade.x, uFade.y, frag.y),
    smoothstep(uFade.z, uFade.z + 180.0 * uScale, frag.x) * smoothstep(0.0, 60.0 * uScale, frag.y)
  );
  float a = clamp((L * 0.94 + node) * topFade * uIntro, 0.0, 1.0);
  float d = clamp(det * topFade * uIntro, 0.0, 1.0);

  // Screen blend, so the light adds to the field without ever flattening it.
  vec3 col = 1.0 - (1.0 - base) * (1.0 - hue * a);
  col = 1.0 - (1.0 - col) * (1.0 - WHITE * d);

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
    throw new Error("Wavefunction shader compile error: " + log);
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

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

type Phase = "spread" | "collapse" | "hold" | "release";

export function initHeroB(canvas: HTMLCanvasElement, host: HTMLElement): () => void {
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

  let program: WebGLProgram | null = null;
  let vertex: WebGLShader | null = null;
  let fragment: WebGLShader | null = null;
  let buffer: WebGLBuffer | null = null;

  function releaseGL(): void {
    if (!gl) return;
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    buffer = program = vertex = fragment = null;
  }

  try {
    vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    program = gl.createProgram()!;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error("Wavefunction program link error: " + gl.getProgramInfoLog(program));
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
    stop0: loc("uStop0"),
    stop1: loc("uStop1"),
    stop2: loc("uStop2"),
    origin: loc("uOrigin"),
    k: loc("uK"),
    w0: loc("uW0"),
    grow: loc("uGrow"),
    theta: loc("uTheta"),
    amp: loc("uAmp"),
    phi: loc("uPhi"),
    win: loc("uWin"),
    collapse: loc("uCollapse"),
    fade: loc("uFade"),
    detect: loc("uDetect"),
    intro: loc("uIntro"),
    time: loc("uTime"),
    fan: loc("uFan"),
    bend: loc("uBend"),
  };

  gl.uniform3fv(u.stop0, readStop(host, "--psi-stop-0", "#0d4f2e"));
  gl.uniform3fv(u.stop1, readStop(host, "--psi-stop-1", "#06301c"));
  gl.uniform3fv(u.stop2, readStop(host, "--psi-stop-2", "#03160d"));

  const headline = host.querySelector<HTMLElement>("[data-hero-headline]");
  const foot = host.querySelector<HTMLElement>("[data-psi-foot]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const coarse = window.matchMedia("(pointer: coarse)");

  // Lab only: `?psi=0.6` pins the collapse at that value for screenshots.
  const pinned = Number.parseFloat(new URLSearchParams(location.search).get("psi") ?? "");
  const pin = Number.isFinite(pinned) ? clamp(pinned, 0, 1) : null;

  // Geometry, all in device pixels.
  let W = 1;
  let H = 1;
  let scale = 1;
  let ox = 0;
  let oy = 0;
  let fan = 0.2;
  let fadeA = 0;
  let fadeB = 1;
  let fadeX = 1;

  // Clock and per-frame state.
  const seed = Math.random() * 100;
  let t = pin !== null ? 9.5 : reducedMotion.matches ? 9.5 : seed;
  let phase: Phase = "spread";
  let phaseT = 0;
  let spreadFor = SPREAD_FIRST;
  let autoTheta = 0;
  let autoDetX = 0.7;
  let autoC = 0;

  let pointerOn = false;
  let pointerC = 0;
  let pointerTheta = 0;
  let pointerX = 0;
  let pointerY = 0;
  let tapUntil = 0;
  let triggerHeld = false;

  let flashAge = 99;

  const theta = new Float32Array(N);
  const amp = new Float32Array(N);
  const phi = new Float32Array(N);
  const bend = new Float32Array(N);

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

  /** The drifting, unmeasured tilt of future k at time t. */
  function baseTheta(k: number): number {
    const b = BEAMS[k]!;
    return fan * (b.u + 0.07 * Math.sin(0.23 * t * (1 + 0.13 * k) + k * 1.7));
  }

  function pickWinner(): void {
    // Weighted toward the stronger futures, never the faint outer ones.
    let total = 0;
    for (const b of BEAMS) total += b.a * b.a;
    let r = Math.random() * total;
    let k = 0;
    for (; k < N - 1; k++) {
      r -= BEAMS[k]!.a * BEAMS[k]!.a;
      if (r <= 0) break;
    }
    autoTheta = baseTheta(k);
    autoDetX = 0.5 + Math.random() * 0.32;
  }

  function measureLayout(): void {
    const rect = host.getBoundingClientRect();
    const cssW = rect.width;
    const cssH = rect.height;
    let textBottom = cssH * 0.4;
    let textRight = cssW * 0.6;
    let footTop = cssH * 0.8;
    if (headline) {
      const h = headline.getBoundingClientRect();
      textBottom = h.bottom - rect.top;
      textRight = h.right - rect.left;
    }
    if (foot) footTop = foot.getBoundingClientRect().top - rect.top;
    const narrow = cssW < 640;

    // The present sits in the clear band between the headline and the foot,
    // with history arriving from the left and the futures fanning right.
    const oxCss = narrow ? cssW * 0.12 : cssW * 0.3;
    const oyCss = textBottom + Math.max(footTop - textBottom, 40) * 0.5;
    const len = Math.max(cssW - oxCss, 1);
    const spreadCss = narrow ? cssH * 0.24 : cssH * 0.4;
    fan = clamp(spreadCss / len, 0.08, 0.42);

    ox = oxCss * scale;
    oy = oyCss * scale;
    fadeA = (textBottom - 6) * scale;
    fadeB = (textBottom + Math.min(70, (oyCss - textBottom) * 0.75)) * scale;
    fadeX = (narrow ? cssW * 4 : textRight + 40) * scale;
  }

  function updateBeams(): { c: number; win: number } {
    // The pointer measures wherever it sits over the fan.
    if (pin !== null) autoTheta = baseTheta(3);
    const pc = pointerC;
    const c = pin !== null ? pin : Math.max(autoC, pc);
    const weight = pc / (pc + autoC + 1e-4);
    const win = autoTheta + (pointerTheta - autoTheta) * weight;
    const ce = easeInOut(clamp(c, 0, 1));

    for (let k = 0; k < N; k++) {
      const b = BEAMS[k]!;
      const free = baseTheta(k);
      theta[k] = free + (win - free) * ce;
      amp[k] = b.a * Math.pow(1 - c, 1.6);
      phi[k] = (b.w * t + k * 2.3) % (Math.PI * 2);
      bend[k] = (b.b * fan * (1 - ce)) / Math.max(W - ox, 1);
    }
    return { c, win };
  }

  function draw(): void {
    const { c, win } = updateBeams();
    const L = Math.max(W - ox, 1);

    // Minimum fringe spacing between the outermost futures, in CSS pixels.
    const k = (2 * Math.PI) / (4.6 * scale * 2 * fan);

    let detX: number;
    let detS: number;
    if (pointerC > autoC && pointerC > 0.01) {
      detX = pointerX * scale;
      detS = pointerC * 0.55;
    } else {
      detX = ox + L * autoDetX;
      detS = Math.exp(-flashAge / 0.9) * clamp(autoC * 1.4, 0, 1);
    }
    const detY = oy + win * (detX - ox);

    gl!.uniform2f(u.res, W, H);
    gl!.uniform1f(u.scale, scale);
    gl!.uniform2f(u.origin, ox, oy);
    gl!.uniform1f(u.k, k);
    gl!.uniform1f(u.w0, 1.1 * scale);
    gl!.uniform1f(u.grow, 0.12 * fan * (1 - 0.8 * c));
    gl!.uniform1fv(u.theta, theta);
    gl!.uniform1fv(u.amp, amp);
    gl!.uniform1fv(u.phi, phi);
    gl!.uniform1fv(u.bend, bend);
    gl!.uniform1f(u.fan, fan);
    gl!.uniform1f(u.time, t);
    gl!.uniform3f(u.win, win, 1.05 * Math.pow(c, 1.4), (1.25 + 3 * (1 - c)) * scale);
    gl!.uniform1f(u.collapse, c);
    gl!.uniform3f(u.fade, fadeA, fadeB, fadeX);
    gl!.uniform3f(u.detect, detX, detY, pin !== null ? 0 : detS);
    gl!.uniform1f(u.intro, introProgress());
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }

  function resize(): void {
    const rect = host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const nextW = Math.max(1, Math.round(rect.width * dpr));
    const nextH = Math.max(1, Math.round(rect.height * dpr));
    scale = dpr;
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

  function stepAuto(dt: number): void {
    phaseT += dt;
    flashAge += dt;
    const measuring = pointerOn || performance.now() < tapUntil;
    switch (phase) {
      case "spread":
        autoC = 0;
        // A live measurement from the pointer suspends the loop.
        if (measuring) phaseT = 0;
        if (phaseT >= spreadFor || triggerHeld) {
          pickWinner();
          phase = "collapse";
          phaseT = 0;
          spreadFor = SPREAD;
        }
        break;
      case "collapse":
        autoC = easeInOut(clamp(phaseT / COLLAPSE, 0, 1));
        if (phaseT >= COLLAPSE * 0.6 && flashAge > 5) flashAge = 0;
        if (phaseT >= COLLAPSE) {
          phase = "hold";
          phaseT = 0;
        }
        break;
      case "hold":
        autoC = 1;
        if (triggerHeld) phaseT = Math.min(phaseT, HOLD * 0.5);
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
          flashAge = 99;
        }
        break;
    }
  }

  function frame(now: number): void {
    const dt = clamp((now - lastFrame) / 1000, 0, 0.1);
    lastFrame = now;
    t += dt;
    stepAuto(dt);

    const measuring = pointerOn || now < tapUntil;
    const target = measuring ? 1 : 0;
    const tau = target > pointerC ? POINTER_IN : POINTER_OUT;
    pointerC += (target - pointerC) * (1 - Math.exp(-dt / tau));
    if (Math.abs(target - pointerC) < 0.0005) pointerC = target;

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

  /** Points the apparatus at a client position, if it lies over the future. */
  function aim(clientX: number, clientY: number): boolean {
    const rect = host.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const dx = x - ox / scale;
    if (dx < 24) return false;
    pointerX = x;
    pointerY = y;
    const dy = pointerY - oy / scale;
    pointerTheta = clamp(dy / dx, -1.15 * fan, 1.15 * fan);
    return true;
  }

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === "touch" || reducedMotion.matches) return;
    pointerOn = aim(event.clientX, event.clientY);
    start();
  };

  const onPointerLeave = () => {
    pointerOn = false;
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== "touch" && !coarse.matches) return;
    if (reducedMotion.matches) return;
    if (aim(event.clientX, event.clientY)) tapUntil = performance.now() + TAP_HOLD * 1000;
  };

  host.addEventListener("pointermove", onPointerMove);
  host.addEventListener("pointerleave", onPointerLeave);
  host.addEventListener("pointerdown", onPointerDown);

  // Hovering or focusing the download button holds the field in its measured
  // state, the way the current hero responds to it.
  const triggerFor = (target: EventTarget | null) =>
    target instanceof Element ? target.closest(TRIGGER_SELECTOR) : null;
  const onTriggerIn = (event: Event) => {
    if (triggerFor(event.target) && host.contains(event.target as Node)) {
      triggerHeld = true;
      pointerOn = false;
    }
  };
  const onTriggerOut = (event: Event) => {
    if (triggerFor(event.target)) triggerHeld = false;
  };
  host.addEventListener("pointerover", onTriggerIn);
  host.addEventListener("pointerout", onTriggerOut);
  host.addEventListener("focusin", onTriggerIn);
  host.addEventListener("focusout", onTriggerOut);

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
      autoC = 0;
      pointerC = 0;
      draw();
    } else {
      start();
    }
  };
  reducedMotion.addEventListener?.("change", onReducedMotionChange);

  // The headline is split into spans after load, which can move its bottom.
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
    host.removeEventListener("pointerdown", onPointerDown);
    host.removeEventListener("pointerover", onTriggerIn);
    host.removeEventListener("pointerout", onTriggerOut);
    host.removeEventListener("focusin", onTriggerIn);
    host.removeEventListener("focusout", onTriggerOut);
    window.removeEventListener("load", onLoad);
    reducedMotion.removeEventListener?.("change", onReducedMotionChange);
    releaseGL();
  };
}
