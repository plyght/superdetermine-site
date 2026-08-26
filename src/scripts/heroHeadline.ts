/**
 * Splits the hero headline into per-character spans so each one can be given a
 * staggered entrance delay. The original text is preserved on aria-label and
 * every generated span is hidden from assistive tech.
 */
export function initHeroHeadline(): void {
  const headline = document.querySelector<HTMLElement>("[data-hero-headline]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!headline || reducedMotion) return;

  headline.setAttribute("aria-label", (headline.textContent ?? "").replace(/\s+/g, " ").trim());

  let index = 0;

  const makeChar = (content: string | Node): HTMLSpanElement => {
    const span = document.createElement("span");
    span.className = "hero-char";
    span.style.setProperty("--char-d", `${180 + index * 11}ms`);
    span.setAttribute("aria-hidden", "true");
    if (typeof content === "string") span.textContent = content;
    else span.append(content);
    index++;
    return span;
  };

  const originalNodes = [...headline.childNodes];
  headline.textContent = "";

  for (const node of originalNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      for (const chunk of (node.textContent ?? "").split(/(\s+)/)) {
        if (!chunk) continue;
        if (/^\s+$/.test(chunk)) {
          headline.append(" ");
          continue;
        }
        // Wrap each word so it never breaks mid-word across lines.
        const word = document.createElement("span");
        word.className = "hero-word";
        for (const char of chunk) word.append(makeChar(char));
        headline.append(word);
      }
    } else if (node instanceof Element) {
      headline.append(makeChar(node));
    }
  }
}
