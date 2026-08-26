/**
 * Drives the field of captured states. The markup already ships graded, so the
 * first paint is correct without this file. Hydration adds the grading itself:
 * move a pointer across an ungraded state and sdt runs your check on it in a
 * throwaway clone, which takes a beat and then comes back green or red. The
 * verdict a state resolves to is fixed by its content, so it never changes.
 */

const ROWS = 9;
const GRADE_MIN = 120;
const GRADE_SPREAD = 220;
const ROUND_PAUSE = 1500;
const ROUND_TAIL = ROWS * 11;
const ROUND_STEP = 9;

function hash(a: number, b: number): number {
  let h = 0x811c9dc5;
  for (const part of [a + 7, b * 131 + 3, a * 31 + b + 11]) {
    h = Math.imul(h ^ part, 0x01000193) >>> 0;
  }
  return h;
}

function verdictFor(index: number, round: number): "green" | "red" {
  const column = Math.floor(index / ROWS);
  const broken = hash(column, round + 1) % 7 === 0;
  const h = hash(index, round);
  if (broken) return h % 9 === 0 ? "green" : "red";
  return h % 31 === 0 ? "red" : "green";
}

export function initMomentField(root: HTMLElement): () => void {
  const grid = root.querySelector<HTMLElement>("[data-moment-grid]");
  const cells = Array.from(root.querySelectorAll<HTMLElement>(".mcell"));
  if (!grid || !cells.length) return () => {};

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const timers = new Set<number>();
  let round = 0;
  let resetting = false;

  const wait = (ms: number, run: () => void): void => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      run();
    }, ms);
    timers.add(id);
  };

  function markHead(): void {
    let head: HTMLElement | null = null;
    for (const cell of cells) {
      if (cell.dataset.verdict === "green") head = cell;
      cell.removeAttribute("data-head");
    }
    head?.setAttribute("data-head", "");
  }

  function ungraded(): number {
    return cells.filter((cell) => cell.dataset.verdict === "ungraded").length;
  }

  /** Every state is graded, so quietly let the session carry on and refill the tail. */
  function refill(): void {
    if (reduced || resetting) return;
    resetting = true;
    round += 1;
    const start = Math.max(0, cells.length - ROUND_TAIL);
    const tail = cells.slice(start);
    tail.forEach((cell, offset) => {
      wait(ROUND_PAUSE + offset * ROUND_STEP, () => {
        cell.dataset.verdict = "ungraded";
        cell.dataset.next = verdictFor(Number(cell.dataset.i), round);
        cell.removeAttribute("data-pending");
        markHead();
        if (offset === tail.length - 1) resetting = false;
      });
    });
  }

  function grade(cell: HTMLElement): void {
    if (cell.dataset.verdict !== "ungraded" || cell.hasAttribute("data-pending")) return;
    const settle = (): void => {
      cell.removeAttribute("data-pending");
      cell.dataset.verdict = cell.dataset.next ?? "green";
      markHead();
      if (ungraded() === 0) refill();
    };
    if (reduced) {
      settle();
      return;
    }
    cell.setAttribute("data-pending", "");
    wait(GRADE_MIN + (hash(Number(cell.dataset.i), round) % GRADE_SPREAD), settle);
  }

  function onPointer(event: PointerEvent): void {
    const cell = (event.target as HTMLElement | null)?.closest<HTMLElement>(".mcell");
    if (cell) grade(cell);
  }

  grid.addEventListener("pointerover", onPointer);
  grid.addEventListener("pointerdown", onPointer);

  return () => {
    for (const id of timers) window.clearTimeout(id);
    timers.clear();
    grid.removeEventListener("pointerover", onPointer);
    grid.removeEventListener("pointerdown", onPointer);
  };
}
