/**
 * Drives the capture tape.
 *
 * The tape runs on one scalar, `flow`, measured in captured states: it advances
 * forever at a fixed rate and never pauses, including while the playhead is
 * parked in the past. Positions on the tape are absolute `flow` coordinates, so
 * the playhead drifts leftward on its own as new states arrive, which is
 * exactly what continuous capture looks like.
 *
 * One rAF loop owns every write. Each moving part gets a `translate3d` written
 * straight onto its own element, and every horizontal offset is snapped to a
 * whole device pixel relative to the stage's right edge before it is written.
 * The marks are real elements two pixels wide rather than a hairline gradient,
 * so nothing in the flowing lattice is ever resampled across a pixel boundary.
 * Layout is read only on resize and scroll, never inside the loop.
 *
 * The markup already paints the rewound state, so a build with no JavaScript,
 * and anyone who asked for reduced motion, gets a correct still frame.
 */

/** Marks per major mark. Also the period the flow wraps on. */
const MAJOR = 6;
/** Milliseconds between captured states. */
const TICK_MS = 720;
/** Seconds of wall clock each captured state stands for. */
const TICK_SECONDS = 20;
/** The most the demo ever rewinds, in captured states. */
const REWIND = 18;
/** Share of the stage the rewind lights when it lands. The playhead then drifts
    on as capture continues, so this is the low end of the range the band
    sweeps, and the tape reads as one length running off both ends rather than
    as a lit block held against the right. */
const PARK_SHARE = 0.34;

/** Time constant of the playhead's approach to its goal. */
const TAU_MS = 190;

type Phase = "live" | "back" | "return";

function readout(offset: number): string {
  if (offset < 0.35) return "now";
  const seconds = Math.round(offset) * TICK_SECONDS;
  if (seconds < 5400) return `-${Math.max(1, Math.round(seconds / 60))} min`;
  return `-${(seconds / 3600).toFixed(1)} h`;
}

function initTape(root: HTMLElement): () => void {
  const stage = root.querySelector<HTMLElement>("[data-stage]");
  const marks = root.querySelector<HTMLElement>("[data-marks]");
  const lit = root.querySelector<HTMLElement>("[data-lit]");
  const kept = root.querySelector<HTMLElement>("[data-kept]");
  const playhead = root.querySelector<HTMLElement>("[data-playhead]");
  const handle = root.querySelector<HTMLElement>("[data-handle]");
  const label = root.querySelector<HTMLElement>("[data-readout]");
  const noop = (): void => {};
  if (!stage || !marks || !lit || !kept || !playhead || !handle || !label) return noop;

  const stageEl = stage;
  const marksEl = marks;
  const litEl = lit;
  const keptEl = kept;
  const headEl = playhead;
  const handleEl = handle;
  const labelEl = label;

  /** The only layout reads, refreshed on resize and scroll, never per frame. */
  let stageWidth = stageEl.clientWidth;
  let stageRight = stageEl.getBoundingClientRect().right;
  let handleWidth = handleEl.offsetWidth;
  /** Whole pixels between captured states, so the marks sit on whole pixels. */
  let pitch = 24;
  let maxOffset = 8;
  let park = 8;

  function measure(): void {
    const rect = stageEl.getBoundingClientRect();
    stageWidth = stageEl.clientWidth;
    stageRight = rect.right;
    handleWidth = handleEl.offsetWidth;
    pitch = Math.round(Number.parseFloat(getComputedStyle(root).getPropertyValue("--pitch"))) || 24;
    maxOffset = Math.max(6, Math.floor((stageWidth - 96) / pitch));
    park = Math.max(4, Math.min(REWIND, maxOffset, Math.round((stageWidth * PARK_SHARE) / pitch)));
  }

  measure();

  const observer = new ResizeObserver(measure);
  observer.observe(stageEl);
  const onScroll = (): void => {
    stageRight = stageEl.getBoundingClientRect().right;
  };
  addEventListener("scroll", onScroll, { passive: true });

  let tapeFlow = 0;
  let headPos = -park;
  let goal = headPos;
  let phase: Phase = "back";
  let phaseUntil = 4600;
  let dragging = false;
  /** A touch that has landed but has not yet declared an axis. */
  let pending: { id: number; x: number; y: number } | null = null;
  let held = false;
  let idleUntil = 0;
  let elapsed = 0;
  let last = 0;
  let frame = 0;
  let lastText = "";
  let lastShift = Number.NaN;
  let lastAria = -1;

  function offsetFor(pos: number): number {
    return Math.max(0, tapeFlow - pos);
  }

  /**
   * Rounds an offset so the element's own right edge lands on a whole device
   * pixel. Every moving part is anchored to the stage's right edge, and the
   * marks sit on whole multiples of the pitch from there, so one correction
   * keeps the entire lattice on the pixel grid at any ratio.
   */
  function snap(px: number): number {
    const ratio = window.devicePixelRatio || 1;
    return Math.round((stageRight + px) * ratio) / ratio - stageRight;
  }

  function shift(el: HTMLElement, px: number): void {
    el.style.transform = `translate3d(${px}px, 0, 0)`;
  }

  function paint(): void {
    const flowPx = snap(-(tapeFlow % MAJOR) * pitch);
    shift(marksEl, flowPx);

    const headOffset = offsetFor(headPos);
    const headPx = snap(-headOffset * pitch);
    shift(keptEl, headPx);
    shift(litEl, flowPx - headPx);
    shift(headEl, headPx);

    const text = readout(headOffset);
    if (text !== lastText) {
      labelEl.textContent = text;
      lastText = text;
      handleWidth = handleEl.offsetWidth;
    }

    /* Keep the readout inside the stage so it never gets clipped at either end. */
    const centre = stageWidth + headPx;
    const half = handleWidth / 2;
    const lowest = 6 + half - centre;
    const highest = stageWidth - 6 - half - centre;
    const shiftPx = Math.round(Math.min(Math.max(0, lowest), highest));
    if (shiftPx !== lastShift) {
      handleEl.style.setProperty("--handle-shift", `${shiftPx}px`);
      lastShift = shiftPx;
    }

    const aria = Math.round(headOffset);
    if (aria !== lastAria) {
      stageEl.setAttribute("aria-valuenow", String(aria));
      stageEl.setAttribute("aria-valuemax", String(maxOffset));
      stageEl.setAttribute(
        "aria-valuetext",
        aria === 0
          ? "At the live edge, capturing now"
          : `${aria * TICK_SECONDS} seconds back, with ${aria} captured states still on the tape ahead of here`,
      );
      lastAria = aria;
    }
  }

  function step(now: number): void {
    frame = requestAnimationFrame(step);
    const dt = Math.min(64, now - last);
    last = now;
    elapsed += dt;
    tapeFlow += dt / TICK_MS;

    if (!dragging && !held && elapsed > idleUntil) {
      if (elapsed > phaseUntil) {
        if (phase === "back") {
          phase = "return";
          phaseUntil = elapsed + 2600;
        } else if (phase === "return") {
          phase = "live";
          phaseUntil = elapsed + 2600;
        } else {
          phase = "back";
          goal = tapeFlow - park;
          phaseUntil = elapsed + 6400;
        }
      }
      /* Capture keeps running while the playhead is parked, so the gap between
         them widens on its own. Hold it at the width of the window: past that
         the playhead would walk out of the left end of the stage. */
      if (phase === "back") goal = Math.max(goal, tapeFlow - maxOffset);
      else goal = tapeFlow;
    }

    if (dragging) {
      headPos = goal;
    } else {
      headPos += (goal - headPos) * (1 - Math.exp(-dt / TAU_MS));
      if (Math.abs(goal - headPos) < 0.01) headPos = goal;
    }

    paint();
  }

  function positionFrom(event: PointerEvent): number {
    const fromRight = Math.max(0, Math.min(maxOffset * pitch, stageRight - event.clientX));
    return tapeFlow - fromRight / pitch;
  }

  /** A hand on the tape takes it over: the demo stops and waits. */
  function seize(): void {
    held = true;
    idleUntil = Infinity;
  }

  function release(delay: number): void {
    held = false;
    idleUntil = elapsed + delay;
    phase = "back";
    phaseUntil = idleUntil + 2600;
  }

  const onEnter = (): void => {
    if (!dragging) seize();
  };

  const onLeave = (): void => {
    if (!dragging && document.activeElement !== stageEl) release(900);
  };

  /**
   * A finger on the stage is not yet a scrub. `touch-action: pan-y` leaves the
   * vertical axis with the browser, so the tape waits for the gesture to
   * declare itself horizontal before it claims the pointer: a swipe up scrolls
   * the page and never moves the playhead. A mouse has no such ambiguity and
   * starts scrubbing on the press.
   */
  const onDown = (event: PointerEvent): void => {
    seize();
    if (event.pointerType === "touch") {
      pending = { id: event.pointerId, x: event.clientX, y: event.clientY };
      return;
    }
    dragging = true;
    stageEl.setPointerCapture(event.pointerId);
    goal = positionFrom(event);
  };

  const onMove = (event: PointerEvent): void => {
    if (pending && event.pointerId === pending.id) {
      const dx = Math.abs(event.clientX - pending.x);
      const dy = Math.abs(event.clientY - pending.y);
      if (dy > dx && dy > 4) {
        pending = null;
        release(900);
        return;
      }
      if (dx <= dy || dx < 6) return;
      pending = null;
      dragging = true;
      stageEl.setPointerCapture(event.pointerId);
    }
    if (!dragging) return;
    goal = positionFrom(event);
  };

  const onUp = (): void => {
    pending = null;
    if (!dragging) {
      if (held) release(900);
      return;
    }
    dragging = false;
    goal = headPos;
    release(5200);
  };

  const onKey = (event: KeyboardEvent): void => {
    let next = goal;
    if (event.key === "ArrowLeft") next = goal - 1;
    else if (event.key === "ArrowRight") next = goal + 1;
    else if (event.key === "Home") next = tapeFlow - maxOffset;
    else if (event.key === "End") next = tapeFlow;
    else return;
    event.preventDefault();
    seize();
    goal = Math.min(tapeFlow, Math.max(tapeFlow - maxOffset, next));
  };

  const onFocus = (): void => seize();
  const onBlur = (): void => release(900);

  stageEl.addEventListener("pointerenter", onEnter);
  stageEl.addEventListener("pointerleave", onLeave);
  stageEl.addEventListener("pointerdown", onDown);
  stageEl.addEventListener("pointermove", onMove);
  stageEl.addEventListener("pointerup", onUp);
  stageEl.addEventListener("pointercancel", onUp);
  stageEl.addEventListener("keydown", onKey);
  stageEl.addEventListener("focus", onFocus);
  stageEl.addEventListener("blur", onBlur);

  last = performance.now();
  frame = requestAnimationFrame(step);

  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    removeEventListener("scroll", onScroll);
    stageEl.removeEventListener("pointerenter", onEnter);
    stageEl.removeEventListener("pointerleave", onLeave);
    stageEl.removeEventListener("pointerdown", onDown);
    stageEl.removeEventListener("pointermove", onMove);
    stageEl.removeEventListener("pointerup", onUp);
    stageEl.removeEventListener("pointercancel", onUp);
    stageEl.removeEventListener("keydown", onKey);
    stageEl.removeEventListener("focus", onFocus);
    stageEl.removeEventListener("blur", onBlur);
  };
}

export function initCaptureTape(): () => void {
  const tapes = Array.from(document.querySelectorAll<HTMLElement>("[data-tape]"));
  if (!tapes.length) return (): void => {};
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return (): void => {};

  const teardowns = tapes.map(initTape);
  return () => {
    for (const teardown of teardowns) teardown();
  };
}
