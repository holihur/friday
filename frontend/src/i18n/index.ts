import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import { zh } from "./zh"

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English", short: "EN" },
  { code: "zh-CN", label: "简体中文", short: "中" },
] as const

export type Locale = (typeof SUPPORTED_LANGUAGES)[number]["code"]

const STORAGE_KEY = "friday-locale"

function detectLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === "en" || stored === "zh-CN") return stored
  return navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en"
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: {} },
    "zh-CN": { translation: zh },
  },
  lng: detectLocale(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
})

function syncDocument(locale: string) {
  localStorage.setItem(STORAGE_KEY, locale)
  document.documentElement.lang = locale
}

syncDocument(i18n.language)
i18n.on("languageChanged", syncDocument)

export function currentLocale(): Locale {
  return i18n.language.startsWith("zh") ? "zh-CN" : "en"
}

export default i18n
