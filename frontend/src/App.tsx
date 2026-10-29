import type { ReactNode } from "react"
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom"
import { AppShell } from "@/components/layout/AppShell"
import { useAuth } from "@/lib/auth"
import { WorkspaceProvider } from "@/lib/workspace"
import { Loader2 } from "lucide-react"
import LoginPage from "@/pages/LoginPage"
import RegisterPage from "@/pages/RegisterPage"
import ForgotPasswordPage from "@/pages/ForgotPasswordPage"
import ResetPasswordPage from "@/pages/ResetPasswordPage"
import DashboardPage from "@/pages/DashboardPage"
import BoardPage from "@/pages/BoardPage"
import MyWorkPage from "@/pages/MyWorkPage"
import SettingsPage from "@/pages/SettingsPage"
import NotFoundPage from "@/pages/NotFoundPage"
import WorkspacePage from "@/pages/WorkspacePage"
import InvitePage from "@/pages/InvitePage"

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-xl font-extrabold text-primary-foreground shadow-lg shadow-primary/25">
          F
        </div>
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    </div>
  )
}

function ProtectedShell() {
  const { user, isLoading } = useAuth()
  const location = useLocation()
  if (isLoading) return <FullScreenLoader />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return (
    <WorkspaceProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </WorkspaceProvider>
  )
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  if (isLoading) return <FullScreenLoader />
  if (user && !from) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <GuestOnly>
            <LoginPage />
          </GuestOnly>
        }
      />
      <Route
        path="/register"
        element={
          <GuestOnly>
            <RegisterPage />
          </GuestOnly>
        }
      />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/invite/:token" element={<InvitePage />} />
      <Route element={<ProtectedShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="boards/:boardId" element={<BoardPage />} />
        <Route path="my-work" element={<MyWorkPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="workspace" element={<WorkspacePage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
