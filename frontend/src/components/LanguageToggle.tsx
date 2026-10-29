import { Check, Languages } from "lucide-react"
import { useTranslation } from "react-i18next"
import { SUPPORTED_LANGUAGES } from "@/i18n"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export function LanguageToggle({ compact, className }: { compact?: boolean; className?: string }) {
  const { t, i18n } = useTranslation()
  const current = SUPPORTED_LANGUAGES.find((l) => i18n.language.startsWith(l.code)) ?? SUPPORTED_LANGUAGES[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size={compact ? "sm" : "default"} className={cn("gap-1.5 text-muted-foreground", className)}>
          <Languages className="h-4 w-4" />
          {compact ? current.short : current.label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>{t("Language")}</DropdownMenuLabel>
        {SUPPORTED_LANGUAGES.map((language) => (
          <DropdownMenuItem
            key={language.code}
            onSelect={() => void i18n.changeLanguage(language.code)}
            className="gap-2"
          >
            <span className="flex-1">{language.label}</span>
            {i18n.language.startsWith(language.code) && <Check className="h-3.5 w-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
