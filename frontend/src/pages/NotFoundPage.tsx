import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Compass } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/Logo"

export default function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <Logo />
      <div className="mt-10 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Compass className="h-7 w-7" />
      </div>
      <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">404</p>
      <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{t("This page slipped off the board")}</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{t("The link may be broken or the item was moved. Head back to your workspace.")}</p>
      <Button asChild className="mt-6">
        <Link to="/">{t("Back to home")}</Link>
      </Button>
    </div>
  )
}
