export type Theme = "light" | "dark";

const STORAGE_KEY = "sdt:theme";

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

interface ThemeToggleOptions {
  button: HTMLElement | null;
  sunIcon: HTMLElement | null;
  moonIcon: HTMLElement | null;
  hiddenClass: string;
  themeColor: Record<Theme, string>;
}

export function initThemeToggle(options: ThemeToggleOptions): void {
  const { button, sunIcon, moonIcon, hiddenClass, themeColor } = options;

  function apply(theme: Theme): void {
    document.documentElement.dataset.theme = theme;
    const isLight = theme === "light";
    sunIcon?.classList.toggle(hiddenClass, isLight);
    moonIcon?.classList.toggle(hiddenClass, !isLight);

    const label = isLight ? "Switch to dark mode" : "Switch to light mode";
    button?.setAttribute("aria-label", label);
    if (button) button.title = label;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor[theme]);
  }

  apply(currentTheme());

  button?.addEventListener("click", () => {
    const next: Theme = currentTheme() === "light" ? "dark" : "light";
    apply(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  });

  window.matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", (event) => {
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch {}
    apply(event.matches ? "light" : "dark");
  });
}
