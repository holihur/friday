import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { ArrowUpRight, CheckCircle2, ShieldCheck, Sparkles, Zap } from "lucide-react"
import { UserAvatar } from "@/components/UserAvatar"
import { LanguageToggle } from "@/components/LanguageToggle"

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-screen bg-background">
      <div className="auth-gradient relative hidden w-[46%] max-w-[680px] flex-col justify-between overflow-hidden p-10 text-white lg:flex xl:p-14">
        <div className="pointer-events-none absolute inset-0 opacity-[0.14] board-grid-bg" />
        <div className="relative flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[17px] font-extrabold text-primary shadow-lg shadow-black/20">
            F
          </div>
          <div>
            <div className="text-lg font-extrabold tracking-tight">Friday</div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">Work OS</div>
          </div>
        </div>

        <div className="relative max-w-md">
          <div className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/85 backdrop-blur">
            <Sparkles className="h-3 w-3 text-[#ffcb00]" />
            {t("A calmer way to ship")}
          </div>
          <h1 className="text-[38px] font-extrabold leading-[1.08] tracking-tight xl:text-[44px]">
            {t("Turn ideas into")}
            <br />
            {t("shipped features.")}
          </h1>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/65">
            {t("Plan roadmaps, run sprints and keep every owner aligned — without the status-meeting theatre.")}
          </p>

          <div className="mt-8 space-y-3">
            {[
              { icon: Zap, text: t("Fast boards with groups, statuses and owners") },
              { icon: ShieldCheck, text: t("TOTP, scoped API tokens and OIDC SSO") },
              { icon: CheckCircle2, text: t("One workspace for features, launches and ops") },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-2.5 text-sm text-white/80">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/10">
                  <item.icon className="h-3.5 w-3.5 text-[#8de8bd]" />
                </span>
                {item.text}
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="w-full max-w-md rotate-[-1.5deg] rounded-2xl border border-white/15 bg-white/95 p-4 text-foreground shadow-2xl shadow-black/30 backdrop-blur">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#6161ff]/15 text-sm">🗺️</span>
                <span className="text-xs font-bold">Product Roadmap</span>
              </div>
              <span className="rounded-md bg-[#00c875]/15 px-1.5 py-0.5 text-[9px] font-bold text-[#00a862]">{t("On track")}</span>
            </div>
            <div className="mb-2 flex items-center gap-2 border-b border-[#e6e9ef] pb-2 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
              <span className="flex-1">{t("Item")}</span>
              <span className="w-16">{t("Owner")}</span>
              <span className="w-20">{t("Status")}</span>
            </div>
            {[
              { name: "AI-powered insights", color: "#fdab3d", label: "Working on it", person: "Maya Chen", avatar: "#00c875" },
              { name: "Public API v2", color: "#579bfc", label: "In review", person: "Jordan Lee", avatar: "#e2445c" },
              { name: "Credential rotation", color: "#00c875", label: "Done", person: "Sam Rivera", avatar: "#fdab3d" },
            ].map((row) => (
              <div key={row.name} className="flex items-center gap-2 border-b border-[#f0f1f5] py-2 last:border-0">
                <span className="flex-1 truncate text-[11px] font-semibold">{row.name}</span>
                <span className="flex w-16 items-center">
                  <UserAvatar name={row.person} color={row.avatar} size="xs" />
                </span>
                <span
                  className="w-20 rounded-[3px] px-1.5 py-0.5 text-center text-[9px] font-bold text-white"
                  style={{ backgroundColor: row.color }}
                >
                  {t(row.label)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2 text-[11px] text-white/45">
            <ArrowUpRight className="h-3.5 w-3.5" />
            {t("Built for teams who love clarity.")}
          </div>
        </div>
      </div>

      <div className="relative flex flex-1 flex-col">
        <div className="absolute right-4 top-4 z-10">
          <LanguageToggle compact />
        </div>
        <div className="flex justify-center px-6 pt-8 lg:hidden">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-primary text-sm font-extrabold text-primary-foreground">
              F
            </div>
            <span className="text-lg font-extrabold tracking-tight">Friday</span>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-10">
          <div className="w-full max-w-[400px] animate-slide-up">
            <h2 className="text-[28px] font-extrabold tracking-tight">{title}</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
            <div className="mt-7">{children}</div>
            {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
          </div>
        </div>
        <div className="px-6 pb-6 text-center text-[11px] text-muted-foreground">
          {t("Friday Work OS")} · {t("Secure by default")}
        </div>
      </div>
    </div>
  )
}
