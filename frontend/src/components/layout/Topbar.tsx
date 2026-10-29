import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Menu, Moon, Sun } from "lucide-react"
import { SearchBar } from "@/components/layout/SearchBar"
import { Logo } from "@/components/Logo"
import { applyTheme, readTheme, type Theme } from "@/lib/theme"

export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { t } = useTranslation()
  const [theme, setTheme] = useState<Theme>(readTheme)

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark"
    setTheme(next)
    applyTheme(next)
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-3 backdrop-blur-md sm:px-5">
      <button
        onClick={onOpenMenu}
        className="rounded-md p-1.5 text-muted-foreground transition hover:bg-accent md:hidden"
        aria-label={t("Open menu")}
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="md:hidden">
        <Logo compact />
      </div>

      <SearchBar />

      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={toggleTheme}
          className="rounded-md p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground"
          title={theme === "dark" ? t("Switch to light mode") : t("Switch to dark mode")}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>

    </header>
  )
}
