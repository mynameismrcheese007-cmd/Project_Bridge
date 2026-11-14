/** Light ("paper") or dark ("ink"). The palettes are in styles/tokens.css. */
export type Theme = 'light' | 'dark';

const KEY = 'projectbridge-theme';

export function storedTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    // Private windows and blocked storage: carry on with the system setting.
    return null;
  }
}

/** What is showing now: the person's choice if they made one, otherwise the system setting. */
export function currentTheme(): Theme {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === 'light' || chosen === 'dark') return chosen;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(KEY, theme);
  } catch {
    // Not remembered, but applied for this visit.
  }
}

/** Called once before the first render, so the page never flashes the wrong palette. */
export function applyStoredTheme(): void {
  const theme = storedTheme();
  if (theme) document.documentElement.dataset.theme = theme;
}
