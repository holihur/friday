import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { api, ApiError } from "@/lib/api"
import type { MeResponse, User } from "@/lib/types"

interface AuthContextValue {
  user: User | null
  me: MeResponse | null
  isLoading: boolean
  setUser: (user: User) => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data, isLoading } = useQuery<MeResponse | null>({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await api.get<MeResponse>("/auth/me")
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null
        throw error
      }
    },
    retry: false,
    staleTime: 30_000,
  })

  const setUser = useCallback(
    (user: User) => {
      queryClient.setQueryData<MeResponse>(["me"], { user, scopes: ["*"], authMethod: "session" })
    },
    [queryClient],
  )

  useEffect(() => {
    const handler = () => {
      queryClient.setQueryData(["me"], null)
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" && q.queryKey[0] !== "config" })
      navigate("/login")
    }
    window.addEventListener("friday:unauthorized", handler)
    return () => window.removeEventListener("friday:unauthorized", handler)
  }, [navigate, queryClient])

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout")
    } finally {
      queryClient.clear()
      queryClient.setQueryData(["me"], null)
      navigate("/login")
    }
  }, [navigate, queryClient])

  const value = useMemo<AuthContextValue>(
    () => ({ user: data?.user ?? null, me: data ?? null, isLoading, setUser, logout }),
    [data, isLoading, setUser, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider")
  return ctx
}
