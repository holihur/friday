import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import type { Workspace } from "@/lib/types"

const STORAGE_KEY = "friday-workspace-id"

interface WorkspaceContextValue {
  workspaces: Workspace[]
  workspace: Workspace | null
  isLoading: boolean
  setWorkspace: (id: string) => void
  refresh: () => Promise<unknown>
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [storedId, setStoredId] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY))
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => api.get<{ workspaces: Workspace[] }>("/workspaces"),
    enabled: Boolean(user),
    staleTime: 30_000,
  })
  const workspaces = useMemo(() => data?.workspaces ?? [], [data])
  const workspace = useMemo(
    () => workspaces.find((w) => w.id === storedId) ?? workspaces[0] ?? null,
    [workspaces, storedId],
  )

  useEffect(() => {
    // Only auto-select on first use. Do not overwrite an explicit switch while
    // the workspace list is still refetching after a create/accept.
    if (!storedId && workspace) {
      setStoredId(workspace.id)
      localStorage.setItem(STORAGE_KEY, workspace.id)
    }
  }, [workspace, storedId])

  const setWorkspace = useCallback(
    (id: string) => {
      localStorage.setItem(STORAGE_KEY, id)
      setStoredId(id)
      void queryClient.invalidateQueries({ queryKey: ["boards"] })
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      void queryClient.invalidateQueries({ queryKey: ["my-items"] })
    },
    [queryClient],
  )

  const refresh = useCallback(async () => {
    return queryClient.invalidateQueries({ queryKey: ["workspaces"] })
  }, [queryClient])

  const value = useMemo(
    () => ({ workspaces, workspace, isLoading, setWorkspace, refresh }),
    [workspaces, workspace, isLoading, setWorkspace, refresh],
  )
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider")
  return ctx
}

export function workspaceQuery(workspaceId?: string | null): string {
  return workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ""
}
