/**
 * Independence is decided by who wrote the check, so that is the one input the
 * card exposes. Swapping the author re-answers that axis; the other two are
 * measured from the run itself and do not move.
 */
const SETTLE_MS = 240;

type Author = {
  id: string;
  label: string;
  tone: string;
  value: string;
  note: string;
};

const AUTHORS: Author[] = [
  {
    id: "agent",
    label: "the same agent",
    tone: "signal",
    value: "no",
    note: "same author",
  },
  {
    id: "other",
    label: "someone else",
    tone: "signal-ok",
    value: "yes",
    note: "a different author",
  },
];

export function initWarrant(root: HTMLElement): () => void {
  const swap = root.querySelector<HTMLButtonElement>("[data-warrant-swap]");
  const label = root.querySelector<HTMLElement>("[data-warrant-author]");
  const axis = root.querySelector<HTMLElement>('[data-axis="independence"]');
  const value = axis?.querySelector<HTMLElement>("[data-warrant-value]");
  const note = axis?.querySelector<HTMLElement>("[data-warrant-note]");
  if (!swap || !label || !axis || !value || !note) return () => {};

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let index = 0;
  let timer = 0;

  function apply(author: Author): void {
    axis!.dataset.tone = author.tone;
    value!.textContent = author.value;
    note!.textContent = author.note;
    delete axis!.dataset.settling;
  }

  function onClick(): void {
    index = (index + 1) % AUTHORS.length;
    const author = AUTHORS[index];
    label!.textContent = author.label;
    swap!.setAttribute(
      "aria-label",
      `Who wrote the check: ${author.label}. Activate to change it.`,
    );

    window.clearTimeout(timer);
    if (reduced) {
      apply(author);
      return;
    }
    axis!.dataset.settling = "";
    timer = window.setTimeout(() => apply(author), SETTLE_MS);
  }

  swap.addEventListener("click", onClick);

  return () => {
    window.clearTimeout(timer);
    swap.removeEventListener("click", onClick);
  };
}
