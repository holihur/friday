import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { CornerDownLeft, Search } from "lucide-react"
import { api } from "@/lib/api"
import { useWorkspace } from "@/lib/workspace"
import type { SearchResult } from "@/lib/types"
import { cn, timeAgo } from "@/lib/utils"

export function SearchBar() {
  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { workspace } = useWorkspace()

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 220)
    return () => clearTimeout(timer)
  }, [query])

  const { data, isFetching } = useQuery({
    queryKey: ["search", workspace?.id, debounced],
    queryFn: () =>
      api.get<{ results: SearchResult[] }>(
        `/search?q=${encodeURIComponent(debounced)}&workspaceId=${workspace?.id}`,
      ),
    enabled: debounced.length > 0 && Boolean(workspace),
    staleTime: 5_000,
  })

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [])

  const results = data?.results ?? []
  const showPanel = open && debounced.length > 0

  function choose(result: SearchResult) {
    navigate(`/boards/${result.boardId}?item=${result.itemId}`)
    setOpen(false)
    setQuery("")
    setDebounced("")
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false)
            if (e.key === "Enter" && results[0]) choose(results[0])
          }}
          placeholder={t("Search items across your workspace…")}
          className="h-9 w-full rounded-lg border border-border bg-secondary/60 pl-9 pr-16 text-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-primary/40 focus:bg-background focus:ring-2 focus:ring-primary/10"
        />
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground sm:flex">
          ⌘ K
        </kbd>
      </div>
      {showPanel && (
        <div className="animate-popover absolute left-0 right-0 top-11 z-50 overflow-hidden rounded-xl border border-border bg-popover shadow-2xl">
          {isFetching && results.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">{t("Searching…")}</div>
          ) : results.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-semibold">{t("No matches for")} “{debounced}”</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("Try an item name, feature or task.")}</p>
            </div>
          ) : (
            <div className="max-h-[360px] overflow-y-auto p-1.5 scrollbar-thin">
              {results.map((result) => (
                <button
                  key={result.itemId}
                  onClick={() => choose(result)}
                  className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition hover:bg-accent"
                >
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm"
                    style={{ backgroundColor: `${result.boardColor}1f` }}
                  >
                    {result.boardIcon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{result.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {result.boardName} · {t("Updated")} {timeAgo(result.updatedAt)}
                    </span>
                  </span>
                  <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border bg-muted/40 px-3 py-1.5 text-[10px] text-muted-foreground">
            <span>{t("Search across every board")}</span>
            <span className={cn("font-medium", results.length > 0 && "text-foreground")}>
              {results.length === 1 ? t("{{count}} result", { count: results.length }) : t("{{count}} results", { count: results.length })}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
