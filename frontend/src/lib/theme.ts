export type Theme = "light" | "dark"

const KEY = "friday-theme"

export function readTheme(): Theme {
  const stored = localStorage.getItem(KEY)
  if (stored === "light" || stored === "dark") return stored
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark")
  localStorage.setItem(KEY, theme)
}

export function initTheme() {
  applyTheme(readTheme())
}
