/**
 * The hero field: history as a horizontal axis.
 *
 * A few hairline tracks run across the card. Each is a trunk that runs dead
 * straight while diversions keep peeling off it, hold flat beside it for a
 * while, and end. Most of them just stop partway, which is the state nobody
 * named; some run their length and stop dead; some come back and merge into the
 * line. The whole history drifts leftward, and the oldest of it dissolves into
 * haze at the left edge.
 *
 * The export keeps the name and signature the rest of the site imports.
 */

interface Track {
  /** Trunk height, as a fraction of the canvas box. */
  y: number;
  /** Distance between two successive branch points, as a fraction of width. */
  lens: number;
  /** Peak departure of a diversion from the trunk, as a fraction of height. */
  spread: number;
  /** Half stroke width in CSS pixels. */
  halfWidth: number;
  /** Overall weight of this track against the others. */
  weight: number;
  /** Drift in lens lengths per second, before the hover multiplier. */
  speed: number;
  /** Decorrelates this track's per-cell hashes from the others. */
  seed: number;
  /**
   * Shifts the thresholds that pick how a diversion ends, so each track shows a
   * different mix rather than the same one reseeded.
   */
  flavor: number;
}

interface Field {
  /** Radial gradient stops, matching the card's CSS fallback exactly. */
  stops: [string, string, string];
  /** Gradient centre and radii, as fractions of the canvas box. */
  origin: [number, number];
  span: [number, number];
  tracks: Track[];
  /** Peak edge softness at the far left, in CSS pixels, and its ramp exponent. */
  maxBlur: number;
  blurExp: number;
  /** Ink alpha, idle and the amount hover adds. */
  alpha: number;
  hoverAlpha: number;
  /** Vertical fade that keeps the field clear of the headline. */
  topFade: [number, number];
  /** Multiplier applied to every track speed while hovered. */
  hoverSpeed: number;
}

/**
 * Every track speed is this base times a factor that shares no small common
 * multiple with the others, so no two tracks ever drift back into step.
 */
const SPEED = 0.115;

const DEFAULT_FIELD: Field = {
  stops: ["#14b866", "#0a8f4d", "#06663a"],
  origin: [0.16, 0.52],
  span: [1.25, 1.5],
  tracks: [
    {
      y: 0.4,
      lens: 0.14,
      spread: 0.02,
      halfWidth: 0.42,
      weight: 0.22,
      speed: SPEED * 0.874,
      seed: 41.7,
      flavor: 0.62,
    },
    {
      y: 0.455,
      lens: 0.255,
      spread: 0.038,
      halfWidth: 0.68,
      weight: 0.5,
      speed: SPEED * 0.618,
      seed: 0,
      flavor: 0.15,
    },
    {
      y: 0.535,
      lens: 0.2,
      spread: 0.056,
      halfWidth: 1.05,
      weight: 1,
      speed: SPEED * 1,
      seed: 5.3,
      flavor: 0.55,
    },
    {
      y: 0.6,
      lens: 0.11,
      spread: 0.018,
      halfWidth: 0.4,
      weight: 0.2,
      speed: SPEED * 1.457,
      seed: 53.9,
      flavor: 0.35,
    },
    {
      y: 0.665,
      lens: 0.16,
      spread: 0.042,
      halfWidth: 0.72,
      weight: 0.7,
      speed: SPEED * 0.786,
      seed: 11.9,
      flavor: 0.9,
    },
    {
      y: 0.735,
      lens: 0.132,
      spread: 0.02,
      halfWidth: 0.44,
      weight: 0.24,
      speed: SPEED * 1.113,
      seed: 67.1,
      flavor: 0.75,
    },
    {
      y: 0.805,
      lens: 0.175,
      spread: 0.05,
      halfWidth: 0.95,
      weight: 0.85,
      speed: SPEED * 1.272,
      seed: 23.1,
      flavor: 0.3,
    },
    {
      y: 0.885,
      lens: 0.095,
      spread: 0.016,
      halfWidth: 0.48,
      weight: 0.3,
      speed: SPEED * 0.703,
      seed: 79.3,
      flavor: 0.48,
    },
  ],
  maxBlur: 9,
  blurExp: 4.2,
  alpha: 0.27,
  hoverAlpha: 0.09,
  topFade: [0.18, 0.42],
  hoverSpeed: 2.4,
};

const SETTINGS_FIELD: Field = {
  stops: ["#12a35c", "#0a8f4d", "#06663a"],
  origin: [0.1, 0.5],
  span: [1.1, 2.2],
  tracks: [
    {
      y: 0.185,
      lens: 0.13,
      spread: 0.028,
      halfWidth: 0.45,
      weight: 0.26,
      speed: SPEED * 1.113,
      seed: 61.3,
      flavor: 0.5,
    },
    {
      y: 0.29,
      lens: 0.2,
      spread: 0.06,
      halfWidth: 0.78,
      weight: 0.72,
      speed: SPEED * 0.786,
      seed: 3.1,
      flavor: 0.2,
    },
    {
      y: 0.42,
      lens: 0.145,
      spread: 0.062,
      halfWidth: 0.95,
      weight: 1,
      speed: SPEED * 1.272,
      seed: 8.7,
      flavor: 0.7,
    },
    {
      y: 0.545,
      lens: 0.1,
      spread: 0.022,
      halfWidth: 0.42,
      weight: 0.22,
      speed: SPEED * 1.618,
      seed: 47.9,
      flavor: 0.34,
    },
    {
      y: 0.66,
      lens: 0.17,
      spread: 0.05,
      halfWidth: 0.8,
      weight: 0.78,
      speed: SPEED * 1,
      seed: 17.5,
      flavor: 0.95,
    },
    {
      y: 0.805,
      lens: 0.12,
      spread: 0.036,
      halfWidth: 0.6,
      weight: 0.46,
      speed: SPEED * 0.703,
      seed: 29.3,
      flavor: 0.4,
    },
  ],
  maxBlur: 13,
  blurExp: 2.6,
  alpha: 0.3,
  hoverAlpha: 0.12,
  topFade: [0.02, 0.1],
  hoverSpeed: 2.3,
};

const INK = "#dcf8e9";

/** Time constant of the exponential hover glide, in seconds. */
const HOVER_SMOOTHING = 0.22;

const INTRO_DELAY_MS = 120;
const INTRO_DURATION_MS = 950;

/** Per-cell hashes repeat after this many branch points, so phase can wrap on it. */
const WRAP = 32;

const MAX_DPR = 2;

const TRIGGER_SELECTOR = "[data-wave-trigger], .buy-btn";

const VERTEX_SHADER = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

/** GLSL ES has no implicit int to float promotion, so every literal needs a point. */
const f = (n: number): string => n.toFixed(5);

function rgb(hex: string): string {
  const value = parseInt(hex.slice(1), 16);
  const r = ((value >> 16) & 255) / 255;
  const g = ((value >> 8) & 255) / 255;
  const b = (value & 255) / 255;
  return `vec3(${f(r)}, ${f(g)}, ${f(b)})`;
}

function trackCall(t: Track, index: number): string {
  const geom = `vec4(${f(t.y)}, ${f(t.lens)}, ${f(t.spread)}, ${f(t.halfWidth)} * uScale)`;
  const mode = `vec3(${f(t.seed)}, ${f(t.weight)}, ${f(t.flavor)})`;
  return `cov = max(cov, track(frag, W, H, soft, ${geom}, ${mode}, uPhase[${index}]));`;
}

function buildFragmentShader(p: Field): string {
  return `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2  uRes;
uniform float uScale;
uniform float uHover;
uniform float uIntro;
uniform float uSeed;
uniform float uPhase[${p.tracks.length}];

const float WRAP = ${f(WRAP)};

const vec3  STOP0 = ${rgb(p.stops[0])};
const vec3  STOP1 = ${rgb(p.stops[1])};
const vec3  STOP2 = ${rgb(p.stops[2])};
const vec2  ORIGIN = vec2(${f(p.origin[0])}, ${f(p.origin[1])});
const vec2  SPAN = vec2(${f(p.span[0])}, ${f(p.span[1])});
const float MID_STOP = 0.46;

const vec3  INK = ${rgb(INK)};

const float MAX_BLUR = ${f(p.maxBlur)};
const float BLUR_EXP = ${f(p.blurExp)};
const float BASE_A = ${f(p.alpha)};
const float HOVER_A = ${f(p.hoverAlpha)};
const float TOP_FADE0 = ${f(p.topFade[0])};
const float TOP_FADE1 = ${f(p.topFade[1])};
const float GRAIN = 0.013;

float hash11(float p_) {
  p_ = fract(p_ * 0.1031);
  p_ *= p_ + 33.33;
  return fract(p_ * (p_ + p_));
}

float hash21(vec2 p_) {
  p_ = fract(p_ * vec2(127.1, 311.7));
  p_ += dot(p_, p_ + 34.56);
  return fract(p_.x * p_.y);
}

/**
 * One history track. Returns a single coverage in 0 to 1.
 */
float track(vec2 frag, float W, float H, float soft, vec4 geom, vec3 mode, float phase) {
  float lensF = geom.y;
  float halfW = geom.w;

  float lens = lensF * W;
  float u = frag.x / lens + phase;
  float cell = floor(u);
  float t = u - cell;

  // uSeed is redrawn on every page load, so the history is a different one
  // each time rather than the same fixed reel.
  float key = mod(cell, WRAP) + mode.x + uSeed;
  float r1 = hash11(key + 1.7);
  float r2 = hash11(key + 13.3);
  float r3 = hash11(key + 57.1);
  float r4 = hash11(key + 91.9);
  float r5 = hash11(key + 137.5);

  // The departure window. t0 is where the filament leaves the trunk and t1 where
  // it comes back, so one expression yields both a stub that dies almost at once
  // and a runner that holds for most of the cell. Squaring r2 biases the
  // population toward the short ones.
  float ramp = 0.08 + 0.12 * r1;
  float t0 = 0.05 + 0.10 * r4;
  float t1 = min(t0 + 0.06 + 0.66 * r2 * r2, 1.0 - ramp);

  float x1 = clamp((t - t0) / ramp, 0.0, 1.0);
  float x2 = clamp((t - t1) / ramp, 0.0, 1.0);
  float s1 = x1 * x1 * (3.0 - 2.0 * x1);
  float s2 = 1.0 - x2 * x2 * (3.0 - 2.0 * x2);
  float w = s1 * s2;
  // Both shoulders are smoothsteps, so value and slope are zero at the cell
  // edges and successive cells join with no crease. Between them the window sits
  // at exactly one, which is what keeps every run flat.
  float dwdt = (6.0 * x1 * (1.0 - x1) * s2 - 6.0 * x2 * (1.0 - x2) * s1) / ramp;

  // Below the threshold the branch point never opens at all.
  float amp = geom.z * H * (0.40 + 0.60 * r3) * step(0.12, r1);
  float side = sign(r5 - 0.5);

  float off = side * amp * w;
  float slope = side * amp * dwdt / lens;
  // Vertical distance corrected onto the curve normal, so the shoulders do not
  // read as thicker than the flat runs.
  float invS = inversesqrt(1.0 + slope * slope);

  float y0 = geom.x * H;
  float trunkCov = 1.0 - smoothstep(halfW - soft, halfW + soft, abs(frag.y - y0));
  float divCov = 1.0 - smoothstep(halfW - soft, halfW + soft, abs(frag.y - (y0 + off)) * invS);

  // How the diversion ends. Most simply stop partway. A graded one runs the full
  // length of its window and stops dead at the end of it. A rejoined one is never
  // cut at all, so it rides the closing shoulder back into the trunk.
  float b = hash11(key + 211.3) + 0.10 * mode.z;
  float rejoin = step(0.62, b) * (1.0 - step(0.86, b));
  float graded = step(0.86, b);
  float cut = mix(mix(t0 + (t1 - t0) * 0.55, t1 - 0.02, graded), 2.0, rejoin);
  float divA = 1.0 - smoothstep(cut, cut + mix(0.26, 0.06, graded), t);

  // The strands are combined by taking the strongest, not by compositing them
  // over one another. Because each coverage falls off with distance from its own
  // curve, that is a union of distance fields: where the two coincide the union
  // collapses to a single stroke of the usual width, and they part into two
  // strokes only once they are genuinely apart. A branch point is therefore a
  // clean Y with no seam, no gap and no bulge at the joint, and there is one ink
  // level across the whole field so nothing steps in brightness where they meet.
  return max(trunkCov, divCov * divA) * mode.y;
}

void main() {
  float W = uRes.x;
  float H = uRes.y;
  // Top-left origin, so the gradient geometry matches the CSS one verbatim.
  vec2 frag = vec2(gl_FragCoord.x, H - gl_FragCoord.y);
  vec2 p = frag / uRes;

  float g = length((p - ORIGIN) / SPAN);
  vec3 base = mix(STOP0, STOP1, clamp(g / MID_STOP, 0.0, 1.0));
  base = mix(base, STOP2, clamp((g - MID_STOP) / (1.0 - MID_STOP), 0.0, 1.0));
  base *= 1.0 + uHover * 0.04;

  // The edge radius grows toward the left, so the oldest history dissolves into
  // haze under the headline while the newest stays a crisp hairline. The intro
  // is the same control pushed all the way open and let back down.
  float leftness = clamp(1.0 - p.x, 0.0, 1.0);
  float soft = (0.70 + MAX_BLUR * pow(leftness, BLUR_EXP) * (1.0 - 0.25 * uHover)) * uScale
             + (1.0 - uIntro) * 16.0 * uScale;

  float cov = 0.0;
  ${p.tracks.map(trackCall).join("\n  ")}

  float topFade = smoothstep(TOP_FADE0, TOP_FADE1, p.y);
  float a = cov * topFade * uIntro * (BASE_A + uHover * HOVER_A);
  vec3 col = mix(base, INK, clamp(a, 0.0, 1.0));

  col += (hash21(frag) - 0.5) * GRAIN;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error("History field shader compile error: " + log);
  }
  return shader;
}

export function initWaveCanvas(canvas: HTMLCanvasElement, host: HTMLElement): () => void {
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
  // No context means the card keeps its CSS gradient, which the shader mirrors.
  if (!gl) return () => {};

  const field = host.dataset.waveVariant === "settings" ? SETTINGS_FIELD : DEFAULT_FIELD;

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
    buffer = null;
    program = null;
    vertex = null;
    fragment = null;
  }

  try {
    vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    fragment = compileShader(gl, gl.FRAGMENT_SHADER, buildFragmentShader(field));
    program = gl.createProgram()!;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error("History field program link error: " + gl.getProgramInfoLog(program));
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

  const uRes = gl.getUniformLocation(program, "uRes");
  const uScale = gl.getUniformLocation(program, "uScale");
  const uHover = gl.getUniformLocation(program, "uHover");
  const uIntro = gl.getUniformLocation(program, "uIntro");
  const uSeed = gl.getUniformLocation(program, "uSeed");
  const uPhase = gl.getUniformLocation(program, "uPhase");

  gl.uniform1f(uSeed, Math.random() * 512);

  const count = field.tracks.length;
  const phases = new Float32Array(count);
  // Every track starts somewhere different in its own history, so the field
  // never opens on the same arrangement twice.
  for (let i = 0; i < count; i++) phases[i] = Math.random() * WRAP;

  let widthPx = 1;
  let heightPx = 1;
  let scale = 1;

  let hoverMix = 0;
  let hoverTarget = 0;
  let lastFrame = performance.now();
  let rafId = 0;
  let running = false;
  let visible = true;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const startedAt = performance.now();

  /** Eased 0 to 1 ramp that opens the field. Blur and opacity only, never position. */
  function introProgress(): number {
    if (reducedMotion.matches) return 1;
    const raw = (performance.now() - startedAt - INTRO_DELAY_MS) / INTRO_DURATION_MS;
    const t = Math.min(Math.max(raw, 0), 1);
    return 1 - Math.pow(1 - t, 3);
  }

  function draw(): void {
    gl!.uniform2f(uRes, widthPx, heightPx);
    gl!.uniform1f(uScale, scale);
    gl!.uniform1f(uHover, hoverMix);
    gl!.uniform1f(uIntro, introProgress());
    gl!.uniform1fv(uPhase, phases);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }

  function resize(): void {
    const rect = host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const nextWidth = Math.max(1, Math.round(rect.width * dpr));
    const nextHeight = Math.max(1, Math.round(rect.height * dpr));
    if (nextWidth === widthPx && nextHeight === heightPx && dpr === scale) return;
    widthPx = nextWidth;
    heightPx = nextHeight;
    scale = dpr;
    canvas.width = nextWidth;
    canvas.height = nextHeight;
    gl!.viewport(0, 0, nextWidth, nextHeight);
    if (!running) draw();
  }

  function frame(now: number): void {
    const delta = Math.min(Math.max((now - lastFrame) / 1000, 0), 0.1);
    lastFrame = now;
    hoverMix += (hoverTarget - hoverMix) * (1 - Math.exp(-delta / HOVER_SMOOTHING));
    if (Math.abs(hoverTarget - hoverMix) < 0.001) hoverMix = hoverTarget;
    const rate = 1 + (field.hoverSpeed - 1) * hoverMix;
    for (let i = 0; i < count; i++) {
      // Phase counts branch points, and the per-cell hash repeats every WRAP of
      // them, so subtracting WRAP returns an identical field with no seam.
      phases[i]! += delta * field.tracks[i]!.speed * rate;
      if (phases[i]! >= WRAP) phases[i]! -= WRAP;
    }
    draw();
    rafId = requestAnimationFrame(frame);
  }

  function start(): void {
    if (running || !visible || document.hidden || reducedMotion.matches) return;
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

  const triggerFor = (target: EventTarget | null) =>
    target instanceof Element ? target.closest(TRIGGER_SELECTOR) : null;

  const enterHover = () => {
    host.dataset.waveHover = "true";
    hoverTarget = 1;
    start();
  };

  const leaveHover = () => {
    host.dataset.waveHover = "false";
    hoverTarget = 0;
    start();
  };

  host.dataset.waveHover = "false";

  const onPointerOver = (event: PointerEvent) => {
    const trigger = triggerFor(event.target);
    if (!trigger) return;
    const related = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (!trigger.contains(related)) enterHover();
  };

  const onPointerOut = (event: PointerEvent) => {
    const trigger = triggerFor(event.target);
    if (!trigger) return;
    const related = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (!trigger.contains(related)) leaveHover();
  };

  const onFocusIn = (event: FocusEvent) => {
    if (triggerFor(event.target)) enterHover();
  };

  const onFocusOut = (event: FocusEvent) => {
    if (triggerFor(event.target)) leaveHover();
  };

  document.addEventListener("pointerover", onPointerOver);
  document.addEventListener("pointerout", onPointerOut);
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", onFocusOut);

  const onReducedMotionChange = () => {
    if (reducedMotion.matches) {
      stop();
      hoverMix = hoverTarget;
      draw();
    } else {
      start();
    }
  };
  reducedMotion.addEventListener?.("change", onReducedMotionChange);

  resize();
  draw();
  start();

  return function destroy(): void {
    stop();
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    document.removeEventListener("visibilitychange", onVisibilityChange);
    document.removeEventListener("pointerover", onPointerOver);
    document.removeEventListener("pointerout", onPointerOut);
    document.removeEventListener("focusin", onFocusIn);
    document.removeEventListener("focusout", onFocusOut);
    delete host.dataset.waveHover;
    reducedMotion.removeEventListener?.("change", onReducedMotionChange);
    releaseGL();
  };
}
