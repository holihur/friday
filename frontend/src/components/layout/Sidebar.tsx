import { useState } from "react"
import { useTranslation } from "react-i18next"
import { NavLink, useLocation, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Building2, Check, ChevronDown, ChevronRight, ChevronUp, Home, Languages, LayoutGrid, ListTodo, LogOut, Moon, Plus, Settings2, Sun, UserRound, X } from "lucide-react"
import { Logo } from "@/components/Logo"
import { UserAvatar } from "@/components/UserAvatar"
import { NewBoardDialog } from "@/components/dialogs/NewBoardDialog"
import { NewWorkspaceDialog } from "@/components/dialogs/NewWorkspaceDialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { applyTheme, readTheme, type Theme } from "@/lib/theme"
import { SUPPORTED_LANGUAGES } from "@/i18n"
import { useWorkspace } from "@/lib/workspace"
import { cn } from "@/lib/utils"
import type { BoardSummary } from "@/lib/types"

const navItems = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/my-work", label: "My work", icon: ListTodo },
]

export function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const { user, logout } = useAuth()
  const { t, i18n } = useTranslation()
  const [theme, setTheme] = useState<Theme>(readTheme)
  const location = useLocation()
  const navigate = useNavigate()
  const [newBoardOpen, setNewBoardOpen] = useState(false)
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false)
  const { workspace, workspaces, setWorkspace, isLoading: wsLoading } = useWorkspace()
  const { data } = useQuery({
    queryKey: ["boards", workspace?.id],
    queryFn: () => api.get<{ boards: BoardSummary[] }>(`/boards?workspaceId=${workspace?.id}`),
    enabled: Boolean(workspace),
  })
  const boards = data?.boards ?? []
  const canEdit = workspace?.role !== "guest"

  function go(path: string) {
    navigate(path)
    onClose()
  }

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark"
    setTheme(next)
    applyTheme(next)
  }

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-[1px] md:hidden" onClick={onClose} />}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[252px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-200 md:static md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center justify-between px-4">
          <button onClick={() => go("/")} className="rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Logo />
          </button>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent md:hidden">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-3 pb-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-sidebar-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-success/15 text-success">
                  <Building2 className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold">{workspace?.name ?? (wsLoading ? t("Loading…") : t("No workspace"))}</p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {workspace ? (
                      <>
                        <span className="capitalize">{t(workspace.role)}</span> ·{" "}
                        {workspace.memberCount === 1
                          ? t("{{count}} person", { count: workspace.memberCount })
                          : t("{{count}} people", { count: workspace.memberCount })}
                      </>
                    ) : (
                      t("Create your first workspace")
                    )}
                  </p>
                </div>
                <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="bottom" className="w-64">
              <DropdownMenuLabel>{t("Workspaces")}</DropdownMenuLabel>
              {workspaces.map((ws) => (
                <DropdownMenuItem
                  key={ws.id}
                  onSelect={() => {
                    setWorkspace(ws.id)
                    go("/")
                  }}
                  className="gap-2"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[11px] font-bold text-primary">
                    {ws.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold">{ws.name}</span>
                    <span className="block text-[10px] text-muted-foreground"><span className="capitalize">{t(ws.role)}</span> · {ws.boardCount === 1 ? t("{{count}} board", { count: ws.boardCount }) : t("{{count}} boards", { count: ws.boardCount })}</span>
                  </span>
                  {workspace?.id === ws.id && <Check className="h-3.5 w-3.5 text-primary" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => go("/workspace")}>
                <Settings2 /> {t("Workspace settings")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setNewWorkspaceOpen(true)}>
                <Plus /> {t("New workspace")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <nav className="space-y-0.5 px-3">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onClose}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-semibold transition",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-foreground/80 hover:bg-sidebar-accent hover:text-foreground",
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {t(item.label)}
              </NavLink>
            )
          })}
        </nav>

        <div className="mt-6 flex items-center justify-between px-5">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{t("Boards")}</span>
          {canEdit && (
            <button
              onClick={() => setNewBoardOpen(true)}
              className="rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
              title={t("New board")}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="mt-1.5 flex-1 overflow-y-auto px-2 pb-3 scrollbar-thin">
          {boards.length === 0 ? (
            canEdit ? (
              <button
                onClick={() => setNewBoardOpen(true)}
                className="mx-1 mt-1 flex w-[calc(100%-0.5rem)] flex-col items-start gap-1 rounded-xl border border-dashed border-border p-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold">
                  <LayoutGrid className="h-3.5 w-3.5" /> {t("Create your first board")}
                </span>
                <span className="text-[11px] text-muted-foreground">{t("Start from a template")}</span>
              </button>
            ) : (
              <p className="px-3 py-5 text-center text-[11px] text-muted-foreground">{t("No boards shared with you yet.")}</p>
            )
          ) : (
            boards.map((board) => {
              const active = location.pathname === `/boards/${board.id}`
              return (
                <button
                  key={board.id}
                  onClick={() => go(`/boards/${board.id}`)}
                  className={cn(
                    "group mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition",
                    active ? "bg-sidebar-accent text-foreground" : "text-foreground/75 hover:bg-sidebar-accent/70",
                  )}
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[13px]"
                    style={{ backgroundColor: `${board.color}22` }}
                  >
                    {board.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{board.name}</span>
                  <span className="text-[10px] font-medium tabular-nums text-muted-foreground">{board.itemCount}</span>
                  <ChevronRight
                    className={cn(
                      "h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100",
                      active && "opacity-100",
                    )}
                  />
                </button>
              )
            })
          )}
        </div>

        {user && (
          <div className="border-t border-sidebar-border p-2.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-2 rounded-lg p-1.5 text-left transition hover:bg-sidebar-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <UserAvatar user={user} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold">{user.name}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{user.email}</p>
                  </div>
                  <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="mb-1 w-64">
                <DropdownMenuLabel className="normal-case tracking-normal">
                  <span className="block text-sm font-bold text-foreground">{user.name}</span>
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{user.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => go("/settings")}>
                  <UserRound /> {t("Profile")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => go("/settings?tab=security")}>
                  <Settings2 /> {t("Account settings")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>{t("Language")}</DropdownMenuLabel>
                {SUPPORTED_LANGUAGES.map((language) => (
                  <DropdownMenuItem
                    key={language.code}
                    onSelect={() => void i18n.changeLanguage(language.code)}
                    className="gap-2"
                  >
                    <Languages className="h-4 w-4" />
                    <span className="flex-1">{language.label}</span>
                    {i18n.language.startsWith(language.code) && <Check className="h-3.5 w-3.5 text-primary" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={toggleTheme}>
                  {theme === "dark" ? <Sun /> : <Moon />}
                  {theme === "dark" ? t("Light mode") : t("Dark mode")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  destructive
                  onSelect={() => {
                    onClose()
                    void logout()
                  }}
                >
                  <LogOut /> {t("Sign out")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </aside>
      <NewBoardDialog open={newBoardOpen} onOpenChange={setNewBoardOpen} />
      <NewWorkspaceDialog open={newWorkspaceOpen} onOpenChange={setNewWorkspaceOpen} />
    </>
  )
}
