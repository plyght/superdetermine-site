/**
 * Drives the capture tape.
 *
 * The tape runs on one scalar, `flow`, measured in captured states: it advances
 * forever at a fixed rate and never pauses, including while the playhead is
 * parked in the past. Positions on the tape are absolute `flow` coordinates, so
 * the playhead and the pin drift leftward on their own as new states arrive,
 * which is exactly what continuous capture looks like.
 *
 * One rAF loop owns every write. Each moving part gets a `translate3d` written
 * straight onto its own element, never a custom property on a shared ancestor
 * and never a layout property, so the flowing rails keep their composited
 * texture and the 1px marks stay steady at any pixel ratio. Layout is read only
 * on resize, never inside the loop.
 *
 * The markup already paints the rewound state, so a build with no JavaScript,
 * and anyone who asked for reduced motion, gets a correct still frame.
 */

/** Milliseconds between captured states. */
const TICK_MS = 900;
/** Seconds of wall clock each captured state stands for. */
const TICK_SECONDS = 90;
/** How far the demo rewinds, in captured states. */
const REWIND = 26;
/** Clock at the live end of the tape, in seconds past midnight. */
const LIVE_SECONDS = 14 * 3600 + 41 * 60;
const BASE_MOMENTS = 1284;

/** Time constant of the playhead's approach to its goal. */
const TAU_MS = 150;

type Phase = "live" | "back" | "return";

function clockAt(secondsBack: number): string {
  const total = Math.round(LIVE_SECONDS - secondsBack);
  const hh = String(Math.floor(total / 3600) % 24).padStart(2, "0");
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  return `${hh}:${mm}`;
}

function initTape(root: HTMLElement): () => void {
  const stage = root.querySelector<HTMLElement>("[data-stage]");
  const flow = root.querySelector<HTMLElement>("[data-flow]");
  const wake = root.querySelector<HTMLElement>("[data-wake]");
  const playhead = root.querySelector<HTMLElement>("[data-playhead]");
  const pin = root.querySelector<HTMLElement>("[data-pin]");
  const readout = root.querySelector<HTMLElement>("[data-readout]");
  const counter = root.querySelector<HTMLElement>("[data-counter]");
  const noop = (): void => {};
  if (!stage || !flow || !wake || !playhead || !pin || !readout || !counter) return noop;

  const stageEl = stage;
  const flowEl = flow;
  const wakeEl = wake;
  const headEl = playhead;
  const pinEl = pin;
  const readoutEl = readout;
  const counterEl = counter;

  /** Integer, so the flow wraps on an exact multiple of the tile width. */
  const pitch =
    Math.round(Number.parseFloat(getComputedStyle(root).getPropertyValue("--pitch"))) || 12;
  const format = new Intl.NumberFormat("en-US");

  /** The only layout read, refreshed on resize rather than per frame. */
  let stageWidth = stageEl.clientWidth;
  let stageRight = stageEl.getBoundingClientRect().right;
  const observer = new ResizeObserver(() => {
    stageWidth = stageEl.clientWidth;
    stageRight = stageEl.getBoundingClientRect().right;
  });
  observer.observe(stageEl);
  const onScroll = (): void => {
    stageRight = stageEl.getBoundingClientRect().right;
  };
  addEventListener("scroll", onScroll, { passive: true });

  let tapeFlow = 0;
  let headPos = -REWIND;
  let goal = -REWIND;
  let pinPos: number | null = -5;
  let phase: Phase = "back";
  let phaseUntil = 3200;
  let dragging = false;
  let dragFrom = 0;
  let idleUntil = 0;
  let elapsed = 0;
  let last = 0;
  let frame = 0;
  let lastReadout = "";
  let lastCount = -1;
  let lastPinVisible = true;

  function offsetFor(pos: number): number {
    return Math.max(0, tapeFlow - pos);
  }

  function shift(el: HTMLElement, px: number): void {
    el.style.transform = `translate3d(${px.toFixed(2)}px, 0, 0)`;
  }

  function paint(): void {
    const headOffset = offsetFor(headPos);
    const headPx = -headOffset * pitch;
    shift(wakeEl, headPx);
    shift(headEl, headPx);

    if (pinPos === null) {
      if (lastPinVisible) {
        pinEl.style.setProperty("--pin-opacity", "0");
        lastPinVisible = false;
      }
    } else {
      const pinPx = -offsetFor(pinPos) * pitch;
      shift(pinEl, pinPx);
      const visible = -pinPx < stageWidth - 8;
      if (visible !== lastPinVisible) {
        pinEl.style.setProperty("--pin-opacity", visible ? "1" : "0");
        lastPinVisible = visible;
      }
    }

    const count = BASE_MOMENTS + Math.floor(tapeFlow);
    if (count !== lastCount) {
      counterEl.textContent = format.format(count);
      lastCount = count;
    }

    let text: string;
    if (headOffset < 0.35) {
      text = `live · ${clockAt(0)}`;
    } else {
      const back = Math.round(headOffset) * TICK_SECONDS;
      const span =
        back >= 5400 ? `${(back / 3600).toFixed(1)} hours` : `${Math.round(back / 60)} minutes`;
      text = `${clockAt(back)} · ${span} back`;
    }
    if (text !== lastReadout) {
      readoutEl.textContent = text;
      lastReadout = text;
    }
  }

  function step(now: number): void {
    frame = requestAnimationFrame(step);
    const dt = Math.min(64, now - last);
    last = now;
    elapsed += dt;
    tapeFlow += dt / TICK_MS;

    if (!dragging && elapsed > idleUntil) {
      if (elapsed > phaseUntil) {
        if (phase === "live") {
          phase = "back";
          pinPos = tapeFlow;
          goal = tapeFlow - REWIND;
          phaseUntil = elapsed + 5400;
        } else if (phase === "back") {
          phase = "return";
          pinPos = null;
          phaseUntil = elapsed + 2600;
        } else {
          phase = "live";
          phaseUntil = elapsed + 2400;
        }
      }
      if (phase !== "back") goal = tapeFlow;
    }

    if (dragging) {
      headPos = goal;
    } else {
      headPos += (goal - headPos) * (1 - Math.exp(-dt / TAU_MS));
      if (Math.abs(goal - headPos) < 0.01) headPos = goal;
    }

    // Wraps on an exact multiple of the tile pitch, so the seam is invisible.
    shift(flowEl, -(tapeFlow % 1) * pitch);
    paint();
  }

  function positionFrom(event: PointerEvent): number {
    const fromRight = Math.max(0, Math.min(stageWidth, stageRight - event.clientX));
    return tapeFlow - fromRight / pitch;
  }

  const onDown = (event: PointerEvent): void => {
    dragging = true;
    dragFrom = headPos;
    idleUntil = Infinity;
    stageEl.setPointerCapture(event.pointerId);
    goal = positionFrom(event);
  };

  const onMove = (event: PointerEvent): void => {
    if (!dragging) return;
    goal = positionFrom(event);
  };

  const onUp = (): void => {
    if (!dragging) return;
    dragging = false;
    if (offsetFor(headPos) > 1 && Math.abs(headPos - dragFrom) > 1) pinPos = dragFrom;
    goal = headPos;
    phase = "back";
    idleUntil = elapsed + 4200;
    phaseUntil = idleUntil + 2600;
  };

  stageEl.addEventListener("pointerdown", onDown);
  stageEl.addEventListener("pointermove", onMove);
  stageEl.addEventListener("pointerup", onUp);
  stageEl.addEventListener("pointercancel", onUp);

  last = performance.now();
  frame = requestAnimationFrame(step);

  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    removeEventListener("scroll", onScroll);
    stageEl.removeEventListener("pointerdown", onDown);
    stageEl.removeEventListener("pointermove", onMove);
    stageEl.removeEventListener("pointerup", onUp);
    stageEl.removeEventListener("pointercancel", onUp);
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
